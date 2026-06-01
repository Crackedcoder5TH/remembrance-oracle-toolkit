'use strict';

/**
 * covenant-trust.js — the covenant's trust-classification layer.
 *
 * Scanners (security patterns, harm patterns, command-injection detector,
 * etc.) consult this module BEFORE flagging. The covenant decides what is
 * statically trusted; scanners don't carry their own exemption lists.
 *
 * Two ideas:
 *
 *   1. TRUSTED SOURCES — expressions whose VALUE is statically resolvable
 *      and cannot be user-controlled. Passing one to a shell sink is not
 *      command injection, no matter what regex says. Examples:
 *        process.execPath       — Node's own binary path
 *        process.argv0          — Node's own argv[0]
 *        __dirname / __filename — Node's resolved module paths
 *        path.join(__dirname, …) when args are literals or trusted
 *      The default set ships with Node's hardcoded globals. Operators
 *      extend it via `addTrustedSource(name)`.
 *
 *   2. ROLE-ANNOTATED FILES — files that DEFINE patterns rather than
 *      EXECUTE behavior. A file containing the literal fragments
 *      'SEL'+'ECT' to build a detector regex is not itself a SQL
 *      injection. The annotation `@oracle-pattern-definitions` in the
 *      file header marks it as a definitions file; scanners should
 *      classify its findings differently (or skip the self-detection
 *      classes that would otherwise self-match).
 *
 * Learning hook: `recordFalsePositive(snippet, reason)` records a labeled
 * FP and (in this minimal first pass) augments the in-memory trusted-
 * source registry if the snippet contains a clear trusted expression.
 * Persistence is delegated to the caller in this version (write the
 * registry to disk if you want it to survive restarts) — a deeper learning
 * loop with disk persistence is a follow-up.
 *
 * Every scanner reaches one place when it wants to know "is this trusted?"
 * — the covenant. Nothing is "exempt" from the covenant; the covenant just
 * has a richer vocabulary now.
 */

// ─── Trusted-source registry ─────────────────────────────────────────────

// Static base set. These are Node's own hardcoded references — their values
// are statically resolvable and cannot be user-controlled at runtime.
const _BASE_TRUSTED = new Set([
  'process.execPath',
  'process.argv0',
  '__dirname',
  '__filename',
  'process.version',
  'process.platform',
  'process.arch',
]);

// Operator extensions accumulate here. Process-local; persistence is the
// caller's concern in this minimal first pass.
const _OPERATOR_TRUSTED = new Set();

/** Is this expression a statically-trusted source? Matches the EXACT
 * expression text — `process.execPath` ≠ `process['execPath']` (we err on
 * the side of strict; the canonical form is what's in the registry). */
function isTrustedSource(expr) {
  if (typeof expr !== 'string') return false;
  const s = expr.trim();
  return _BASE_TRUSTED.has(s) || _OPERATOR_TRUSTED.has(s);
}

/** Extend the trusted-source registry. Idempotent. */
function addTrustedSource(expr) {
  if (typeof expr === 'string' && expr.trim()) {
    _OPERATOR_TRUSTED.add(expr.trim());
    return true;
  }
  return false;
}

/** Read-only snapshot of the current registry. */
function trustedSources() {
  return {
    base: [..._BASE_TRUSTED],
    operator: [..._OPERATOR_TRUSTED],
  };
}

// ─── Role-annotated files ────────────────────────────────────────────────

/** Does this file's header declare itself a pattern-definition file?
 * Scanners that have self-match risk (SQL keywords in their own regex
 * fragments, for example) consult this so they don't classify their own
 * definitions as findings. */
function isPatternDefinitionFile(code) {
  if (typeof code !== 'string') return false;
  // Check only the first ~40 lines (header region). Avoid matching the
  // marker mentioned in a comment further down the file.
  const header = code.split('\n').slice(0, 40).join('\n');
  return /@oracle-pattern-definitions\b/.test(header);
}

/** Does this file's header declare itself part of the scanner infrastructure?
 * Same logic, broader bypass — used for the security scanner itself. */
function isInfrastructureFile(code) {
  if (typeof code !== 'string') return false;
  const header = code.split('\n').slice(0, 40).join('\n');
  return /@oracle-infrastructure\b/.test(header);
}

// ─── Learning hook ───────────────────────────────────────────────────────

/**
 * Record a labeled false positive. In this minimal first version, the
 * function inspects the snippet for an exact trusted-source expression
 * and adds it to the operator registry; richer learning (extracting a
 * pattern class, persisting to disk, propagating across nodes via the
 * field) is a follow-up. Returns { learned, expression } describing what
 * was absorbed.
 *
 * @param {string} snippet - the code that was wrongly flagged
 * @param {string} [_reason] - human-readable explanation (for audit)
 */
function recordFalsePositive(snippet, _reason) {
  if (typeof snippet !== 'string' || !snippet.trim()) {
    return { learned: false, expression: null };
  }
  // Look for any property-access expression of the form `process.<name>`
  // that's not already in the base set — the most common safe-source
  // shape that scanners miss.
  const m = snippet.match(/\bprocess\.[A-Za-z_$][\w$]*/);
  if (m && !_BASE_TRUSTED.has(m[0])) {
    addTrustedSource(m[0]);
    return { learned: true, expression: m[0] };
  }
  return { learned: false, expression: null };
}

// ─── Field-validated growth: covenant absorbs patterns that raise coherency ──

/**
 * Recognized patterns — the covenant's growing vocabulary of patterns that
 * have been validated by the field. A pattern lands in this registry only
 * if adding it to the field raises (or at least maintains) global coherency.
 *   name → { name, language, score, absorbedAt, preCoherence,
 *            projectedCoherence, delta, source }
 */
const _RECOGNIZED_PATTERNS = new Map();

function _growthLogPath() {
  const path = require('node:path');
  return path.join(__dirname, '..', '..', '.remembrance', 'covenant-growth.jsonl');
}

function _persistGrowth(record) {
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const file = _growthLogPath();
    const dir = path.dirname(file);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(file, JSON.stringify(record) + '\n');
    return true;
  } catch (_) { return false; }
}

/**
 * Field-validated covenant growth. The covenant absorbs a new pattern only
 * when the field SAYS YES — adding the pattern's coherency to the field
 * must raise (or at least maintain, within ε) the global coherency. If the
 * pattern would drag the field down, the covenant refuses to absorb it.
 *
 * This closes the loop: the covenant doesn't grow by fiat, it grows by
 * field-validated evidence. A pattern earns its way into the covenant by
 * being coherent with everything already there.
 *
 * @param {object} pattern - { name, code?, language?, coherencyScore? }
 * @param {object} [opts]
 * @param {number} [opts.score] - explicit intrinsic coherency in [0,1]
 *                                (overrides pattern.coherencyScore.total)
 * @param {number} [opts.epsilon=1e-6] - tolerance for "maintain"
 * @param {string} [opts.source='submit'] - tag for the audit log
 * @param {boolean} [opts.persist=true] - append to growth log
 * @returns {{ absorbed:boolean, name?:string, delta?:number, reason?:string,
 *             preCoherence?:number, projectedCoherence?:number,
 *             score?:number, absorbedAt?:string }}
 */
function maybeAbsorbPattern(pattern, opts = {}) {
  if (!pattern || typeof pattern.name !== 'string' || !pattern.name.trim()) {
    return { absorbed: false, reason: 'pattern missing name' };
  }
  if (_RECOGNIZED_PATTERNS.has(pattern.name)) {
    return { absorbed: false, reason: 'already recognized', existing: _RECOGNIZED_PATTERNS.get(pattern.name) };
  }
  const score = typeof opts.score === 'number' ? opts.score
              : (pattern.coherencyScore && typeof pattern.coherencyScore.total === 'number') ? pattern.coherencyScore.total
              : null;
  if (score === null) {
    return { absorbed: false, reason: 'no coherency score available — provide opts.score or pattern.coherencyScore.total' };
  }

  // Ask the field: would adding this pattern's coherency raise the global?
  let projection;
  try {
    const { projectContribution } = require('./field-coupling');
    projection = projectContribution({ cost: 1, coherence: score });
  } catch (_) { projection = null; }
  if (!projection) {
    return { absorbed: false, reason: 'field unavailable — cannot validate growth' };
  }

  const epsilon = typeof opts.epsilon === 'number' ? opts.epsilon : 1e-6;
  if (projection.delta < -epsilon) {
    return {
      absorbed: false,
      reason: 'pattern drags global coherency',
      delta: projection.delta,
      preCoherence: projection.current,
      projectedCoherence: projection.projected,
      score,
    };
  }

  // Field said yes — covenant absorbs.
  const record = {
    name: pattern.name,
    language: pattern.language || 'unknown',
    score,
    absorbedAt: new Date().toISOString(),
    preCoherence: projection.current,
    projectedCoherence: projection.projected,
    delta: projection.delta,
    source: opts.source || 'submit',
  };
  _RECOGNIZED_PATTERNS.set(pattern.name, record);
  if (opts.persist !== false) _persistGrowth(record);
  return { absorbed: true, ...record };
}

/** Is this pattern name in the covenant's recognized-pattern registry? */
function isRecognizedPattern(name) {
  return typeof name === 'string' && _RECOGNIZED_PATTERNS.has(name);
}

/** Read-only snapshot of the recognized-pattern registry. */
function recognizedPatterns() {
  return [..._RECOGNIZED_PATTERNS.values()];
}

/** Test-only: drop the in-memory registry. Does NOT touch the growth log. */
function _resetGrowth() { _RECOGNIZED_PATTERNS.clear(); }

module.exports = {
  isTrustedSource,
  addTrustedSource,
  trustedSources,
  isPatternDefinitionFile,
  isInfrastructureFile,
  recordFalsePositive,
  // Field-validated growth:
  maybeAbsorbPattern,
  isRecognizedPattern,
  recognizedPatterns,
  _resetGrowth,
};
