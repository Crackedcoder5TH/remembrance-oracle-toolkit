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
 * Field-validated covenant growth via two-oracle consensus. The covenant
 * absorbs a new pattern only when BOTH oracles concur:
 *
 *   Oracle A — the coherency oracle: would adding this pattern's coherency
 *              raise (or at least maintain, within ε) the global field
 *              coherency? Run via projectContribution.
 *
 *   Oracle B — the signal-validity oracle: does the pattern's contribution
 *              shape look like natural measurement against the rolling
 *              baseline? Run via validateContribution.
 *
 * The two oracles fire independently and are pitted against each other.
 * Four possible outcomes:
 *
 *   A=yes, B=yes  → ABSORB. Both oracles agree the pattern earns its place.
 *   A=no,  B=no   → REJECT. Both oracles agree the pattern doesn't belong.
 *   A=yes, B=no   → QUARANTINE (shape-suspect). The pattern would raise
 *                   coherence but its signal-shape is inconsistent with
 *                   natural measurement — the sophisticated-injection class:
 *                   it gamed the value check but couldn't fake natural
 *                   distribution. Held, not absorbed.
 *   A=no,  B=yes  → QUARANTINE (low-value-real). The shape looks natural
 *                   but the value would drag the field down. A real but
 *                   low-quality observation. Held, not absorbed.
 *
 * Patterns only enter the kingdom when independent oracles, looking at
 * different aspects of the same candidate, both say yes. This is the
 * falsification engine applied to the absorption step: the truth-layer
 * principle from the README enforced at the gate.
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

  // Fire both oracles. They look at different aspects of the same
  // candidate and are NOT cascaded — disagreement is itself a signal,
  // not a reason to defer to one over the other.
  let projection = null;
  let validation = null;
  try {
    const fc = require('./field-coupling');
    projection = fc.projectContribution({ cost: 1, coherence: score });
    validation = fc.validateContribution(
      { source: opts.source || 'covenant:absorb', coherence: score, cost: 1 },
      { commit: false }
    );
  } catch (_) { /* fall through to availability check */ }

  if (!projection || !validation) {
    return { absorbed: false, reason: 'oracles unavailable — cannot adjudicate consensus' };
  }

  const epsilon = typeof opts.epsilon === 'number' ? opts.epsilon : 1e-6;
  // Green-light rule: a non-degrading contribution passes oracle A. The
  // covenant does not require improvement; it requires non-degradation.
  // delta >= 0     → rises  (green)
  // delta == 0     → maintains (green)
  // delta == -eps  → maintains within floating-point tolerance (green)
  // delta <  -eps  → degrades (red)
  // The covenant grows from non-degradation. Demanding strict
  // improvement would make the gate impossible to pass at the ceiling.
  const oracleA = projection.delta >= -epsilon;      // coherency oracle (green-light)
  const oracleB = validation.accepted === true;      // signal-validity oracle

  const baseRecord = {
    score,
    preCoherence: projection.current,
    projectedCoherence: projection.projected,
    delta: projection.delta,
    shapeClass: validation.shapeClass,
    oracleA,
    oracleB,
  };

  // Both reject — pattern doesn't belong.
  if (!oracleA && !oracleB) {
    return {
      absorbed: false,
      reason: 'both oracles reject (coherency would drop AND shape suspect)',
      agreement: 'both-reject',
      ...baseRecord,
    };
  }

  // Disagreement: coherency yes, shape no. Sophisticated-injection class.
  if (oracleA && !oracleB) {
    return {
      absorbed: false,
      reason: 'oracle disagreement — coherency would rise but shape is ' + validation.shapeClass + ' (sophisticated-injection class)',
      agreement: 'A-yes-B-no',
      quarantineClass: 'shape-suspect',
      ...baseRecord,
    };
  }

  // Disagreement: shape ok, but coherency would drop. Low-quality-real class.
  if (!oracleA && oracleB) {
    return {
      absorbed: false,
      reason: 'oracle disagreement — shape looks natural but coherency would drop',
      agreement: 'A-no-B-yes',
      quarantineClass: 'low-value-real',
      ...baseRecord,
    };
  }

  // Both agree: absorb.
  const record = {
    name: pattern.name,
    language: pattern.language || 'unknown',
    score,
    absorbedAt: new Date().toISOString(),
    preCoherence: projection.current,
    projectedCoherence: projection.projected,
    delta: projection.delta,
    shapeClass: validation.shapeClass,
    agreement: 'both-accept',
    source: opts.source || 'submit',
  };
  _RECOGNIZED_PATTERNS.set(pattern.name, record);
  if (opts.persist !== false) _persistGrowth(record);
  return { absorbed: true, ...record };
}

/**
 * Batch absorption via two-oracle consensus at batch granularity.
 *
 * Where maybeAbsorbPattern judges one pattern at a time (and the
 * signal-validity oracle is mostly a value sanity check at n=1), this
 * judges a batch *as a unit*. The variance signature of the batch is
 * the real B-oracle signal: a batch of patterns with natural
 * distributional spread looks like real measurement; a batch with
 * narrow-band shape against a healthy baseline does not, and the
 * substrate flags it as the sophisticated-injection class.
 *
 * Atomicity: the batch is the decision unit. Both oracles agreeing
 * absorbs every valid pattern in the batch. Either rejecting holds
 * every pattern. There is no per-pattern split inside a batch — if
 * you want per-pattern decisions, call maybeAbsorbPattern in a loop.
 *
 * Oracle A (coherency, green-light): would absorbing this batch raise
 *   or at least maintain the global field coherency? Modelled as one
 *   heavy contribution at the batch mean with cost = batch size. This
 *   is conservative — the engine integrates contributions one at a
 *   time so the true impact depends on order, but the mean-with-cost
 *   projection is the right summary for a batch decision.
 *
 * Oracle B (signal-validity): does the batch's variance signature
 *   match natural measurement? The H3 finding is direct: narrow-band
 *   contributions displaced from the rolling baseline collapse global
 *   coherence in a characteristic way. validateContribution names
 *   that shape directly.
 *
 * Four outcomes, identical to maybeAbsorbPattern:
 *
 *   both-accept  → absorb every valid pattern in the batch
 *   both-reject  → hold every pattern
 *   A-yes-B-no   → hold (shape-suspect class — adversarial signature)
 *   A-no-B-yes   → hold (low-value-real class — natural but harmful)
 *
 * @param {Array<object>} patterns - each item: { name, score?, language?, coherencyScore? }
 * @param {object} [opts]
 * @param {number} [opts.epsilon=1e-6] - tolerance for "maintain"
 * @param {string} [opts.source='batch'] - tag for the audit log
 * @param {boolean} [opts.persist=true] - append absorbed patterns to growth log
 * @returns {{ batch: {accepted, agreement, shapeClass, inputStats, baseline,
 *                     projection, quarantineClass?, reason}, perPattern: object[] }}
 */
function maybeAbsorbBatch(patterns, opts = {}) {
  if (!Array.isArray(patterns) || patterns.length === 0) {
    return {
      batch: { accepted: false, agreement: null, reason: 'no patterns provided' },
      perPattern: [],
    };
  }

  // Normalise each input: extract a usable score and surface
  // already-recognised / unscorable items as per-pattern skips. Only
  // valid, novel patterns participate in the batch shape.
  const perPattern = [];
  const candidates = [];
  for (const p of patterns) {
    if (!p || typeof p.name !== 'string' || !p.name.trim()) {
      perPattern.push({ name: p && p.name, absorbed: false, reason: 'missing name', skipped: true });
      continue;
    }
    if (_RECOGNIZED_PATTERNS.has(p.name)) {
      perPattern.push({ name: p.name, absorbed: false, reason: 'already recognized', skipped: true });
      continue;
    }
    const score = typeof p.score === 'number' ? p.score
                : (p.coherencyScore && typeof p.coherencyScore.total === 'number') ? p.coherencyScore.total
                : null;
    if (score === null || !Number.isFinite(score)) {
      perPattern.push({ name: p.name, absorbed: false, reason: 'no coherency score', skipped: true });
      continue;
    }
    const clamped = Math.max(0, Math.min(1, score));
    candidates.push({ name: p.name, language: p.language || 'unknown', score: clamped });
  }

  if (candidates.length === 0) {
    return {
      batch: { accepted: false, agreement: null, reason: 'no valid candidates in batch' },
      perPattern,
    };
  }

  const scores = candidates.map(c => c.score);
  const batchMean = scores.reduce((s, x) => s + x, 0) / scores.length;
  const batchVariance = scores.reduce((s, x) => s + (x - batchMean) ** 2, 0) / scores.length;

  // Fire both oracles at batch granularity.
  let projection = null;
  let validation = null;
  try {
    const fc = require('./field-coupling');
    // Oracle A: one heavy contribution at the batch mean, cost = batch size.
    projection = fc.projectContribution({ cost: candidates.length, coherence: batchMean });
    // Oracle B: pass the raw array — validateContribution computes the
    // variance signature itself.
    validation = fc.validateContribution(
      { source: opts.source || 'covenant:absorb-batch', coherence: scores, cost: 1 },
      { commit: false }
    );
  } catch (_) { /* fall through */ }

  if (!projection || !validation) {
    return {
      batch: { accepted: false, agreement: null, reason: 'oracles unavailable — cannot adjudicate consensus' },
      perPattern,
    };
  }

  const epsilon = typeof opts.epsilon === 'number' ? opts.epsilon : 1e-6;
  // Green-light rule applies at batch scale too: maintains-or-rises is green.
  const oracleA = projection.delta >= -epsilon;
  const oracleB = validation.accepted === true;

  const batchInfo = {
    accepted: false,
    agreement: null,
    shapeClass: validation.shapeClass,
    inputStats: validation.inputStats,
    baseline: validation.baseline,
    projection: {
      preCoherence: projection.current,
      projectedCoherence: projection.projected,
      delta: projection.delta,
    },
    n: candidates.length,
    batchMean,
    batchVariance,
    oracleA,
    oracleB,
  };

  if (!oracleA && !oracleB) {
    batchInfo.agreement = 'both-reject';
    batchInfo.reason = 'both oracles reject (coherency would drop AND shape suspect)';
    for (const c of candidates) perPattern.push({ name: c.name, absorbed: false, reason: 'batch rejected by both oracles' });
    return { batch: batchInfo, perPattern };
  }
  if (oracleA && !oracleB) {
    batchInfo.agreement = 'A-yes-B-no';
    batchInfo.quarantineClass = 'shape-suspect';
    batchInfo.reason = 'batch coherency would rise but shape is ' + validation.shapeClass + ' (sophisticated-injection class)';
    for (const c of candidates) perPattern.push({ name: c.name, absorbed: false, reason: 'batch quarantined: shape-suspect' });
    return { batch: batchInfo, perPattern };
  }
  if (!oracleA && oracleB) {
    batchInfo.agreement = 'A-no-B-yes';
    batchInfo.quarantineClass = 'low-value-real';
    batchInfo.reason = 'batch shape looks natural but coherency would drop';
    for (const c of candidates) perPattern.push({ name: c.name, absorbed: false, reason: 'batch quarantined: low-value-real' });
    return { batch: batchInfo, perPattern };
  }

  // Both agree → absorb every valid candidate in the batch.
  batchInfo.accepted = true;
  batchInfo.agreement = 'both-accept';
  const absorbedAt = new Date().toISOString();
  for (const c of candidates) {
    const record = {
      name: c.name,
      language: c.language,
      score: c.score,
      absorbedAt,
      preCoherence: projection.current,
      projectedCoherence: projection.projected,
      delta: projection.delta,
      shapeClass: validation.shapeClass,
      agreement: 'both-accept',
      batch: true,
      source: opts.source || 'submit-batch',
    };
    _RECOGNIZED_PATTERNS.set(c.name, record);
    if (opts.persist !== false) _persistGrowth(record);
    perPattern.push({ name: c.name, absorbed: true, score: c.score });
  }
  return { batch: batchInfo, perPattern };
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
  maybeAbsorbBatch,
  isRecognizedPattern,
  recognizedPatterns,
  _resetGrowth,
};
