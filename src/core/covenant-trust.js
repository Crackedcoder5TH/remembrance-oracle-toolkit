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

module.exports = {
  isTrustedSource,
  addTrustedSource,
  trustedSources,
  isPatternDefinitionFile,
  isInfrastructureFile,
  recordFalsePositive,
};
