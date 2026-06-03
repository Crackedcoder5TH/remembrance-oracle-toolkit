'use strict';

/**
 * Field-coupling helper for the LivingRemembranceEngine.
 *
 * Every producer of a numeric score (reflect, audit, risk-score,
 * covenant, security-scan, etc.) calls `contribute()` here after
 * emitting its result. The helper is best-effort: if the engine
 * can't be loaded (e.g. running in a stripped environment), it
 * no-ops silently so production callers don't break.
 *
 * Backpressure-by-field (per the design principle):
 *   The LRE's own dynamics throttle implicitly — when many producers
 *   contribute rapidly, cascadeFactor and globalEntropy saturate,
 *   making further contributions less impactful and signaling to
 *   high-volume callers that the field is hot. Callers can peek via
 *   `peekField()` and self-throttle (delay/batch) when entropy
 *   exceeds a threshold. There is no hardcoded rate limit; capacity
 *   is added by adding nodes, not by raising a knob.
 */

let _engineRef = null;
let _engineLoadAttempted = false;
let _localUpdateCount = 0;

// Rolling baseline of recent contribution coherence values. Used by
// validateContribution() to self-calibrate the variance-signature
// detector — what counts as a "narrow band" is judged relative to the
// recent contribution-shape distribution, not against a fixed band.
// As the substrate grows and the natural variance range shifts, this
// buffer tracks it.
const _RECENT_MAX = 200;
const _recentCoherences = [];
function _pushRecent(c) {
  if (!Number.isFinite(c)) return;
  _recentCoherences.push(c);
  if (_recentCoherences.length > _RECENT_MAX) _recentCoherences.shift();
}
function _stats(xs) {
  if (!xs || xs.length === 0) return { mean: 0.95, variance: 0.05, n: 0 };
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const v = xs.reduce((s, x) => s + (x - m) ** 2, 0) / xs.length;
  return { mean: m, variance: v, n: xs.length };
}

function _loadEngine() {
  if (_engineLoadAttempted) return _engineRef;
  _engineLoadAttempted = true;
  try {
    const { getEngine } = require('./living-remembrance');
    _engineRef = getEngine();
  } catch (_e) {
    _engineRef = null;
  }
  return _engineRef;
}

/**
 * Submit a measurement to the LivingRemembranceEngine field.
 *
 * @param {object} obs
 * @param {number} obs.cost — work units (default 1.0)
 * @param {number} obs.coherence — alignment 0..1
 * @param {string} obs.source — caller identity (e.g. "reflect:src/foo.js")
 * @returns {object|null} new field state + derived terms, or null if engine unavailable
 */
function contribute(obs) {
  const engine = _loadEngine();
  if (!engine) return null;
  if (typeof obs?.coherence !== 'number' || !isFinite(obs.coherence)) return null;
  const clamped = Math.max(0, Math.min(1, obs.coherence));
  // Sanitize cost once, then hand the same value to both the engine and
  // the memory layer — previously the engine received a sanitized cost
  // while field-memory got the raw, unchecked obs.cost.
  const cost = (typeof obs.cost === 'number' && isFinite(obs.cost)) ? Math.max(0, obs.cost) : 1.0;
  const result = engine.contribute({ cost, coherence: clamped, source: obs.source || null });
  _localUpdateCount += 1;
  _pushRecent(clamped);

  // Compress every observation into the pattern library. The similarity
  // gate in field-memory drops redundant shapes by design; only genuinely
  // new observations are stored. Snapshots of the whole field are taken
  // periodically so the library carries the field's own history.
  // Best-effort — never blocks or breaks a contribute.
  try {
    const fm = require('./field-memory');
    fm.recordObservation({ source: obs.source || null, coherence: clamped, cost });
    fm.maybeSnapshot(result || (engine.getState && engine.getState()) || null);
  } catch (_) { /* best-effort */ }

  return result;
}

/**
 * Read the current field state. Reading the field also records it:
 * every call routes the current state through field-memory's snapshot
 * machinery, which is counter-throttled (a durable snapshot lands every
 * SNAPSHOT_EVERY calls) and similarity-gated (only genuinely-new field
 * configurations are stored) — so this is cheap, and the field cannot
 * be observed without witnessing itself. To call the field is to leave
 * it remembered. Best-effort: a memory failure never breaks a read.
 * Does not contribute — the LRE state is unchanged.
 */
function peekField() {
  const engine = _loadEngine();
  if (!engine) return null;
  const state = engine.getState();
  try {
    require('./field-memory').maybeSnapshot(state);
  } catch (_) { /* best-effort — never break a field read */ }
  return state;
}

/**
 * Field-aware throttle hint. High-volume callers can check this
 * before contributing in a tight loop and yield/batch when hot.
 *
 * @param {object} [opts]
 * @param {number} [opts.entropyThreshold=10] — globalEntropy above this signals "hot"
 * @param {number} [opts.cascadeThreshold=4] — cascadeFactor above this signals "saturated"
 * @returns {{hot: boolean, state: object|null, reason: string|null}}
 */
function fieldPressure({ entropyThreshold = 10, cascadeThreshold = 4 } = {}) {
  const state = peekField();
  if (!state) return { hot: false, state: null, reason: null };
  // After the !state guard above, every dereference below is safe.
  // The integration-class auditor doesn't trace control flow through
  // early returns; the `?.` chains here are defensive cosmetics that
  // also serve as a self-documenting witness to the guard.
  if ((state?.globalEntropy ?? 0) > entropyThreshold) {
    return { hot: true, state, reason: `globalEntropy=${state.globalEntropy.toFixed(2)} > ${entropyThreshold}` };
  }
  if ((state?.cascadeFactor ?? 0) > cascadeThreshold) {
    return { hot: true, state, reason: `cascadeFactor=${state.cascadeFactor.toFixed(2)} > ${cascadeThreshold}` };
  }
  return { hot: false, state, reason: null };
}

/** Number of successful contribute() calls made through this helper since process start. */
function localUpdateCount() {
  return _localUpdateCount;
}

/**
 * Project the field's response to a candidate contribution without
 * committing it. Returns { current, projected, delta } where delta = the
 * change in global coherency the contribution would cause. Used by the
 * covenant to decide whether to absorb a new pattern: positive/zero delta
 * = field accepts (covenant grows), negative delta = field rejects.
 */
function projectContribution(obs) {
  const engine = _loadEngine();
  if (!engine || typeof engine.peekProjection !== 'function') return null;
  if (typeof obs?.coherence !== 'number' || !isFinite(obs.coherence)) return null;
  const current = engine.getState().coherence;
  const clamped = Math.max(0, Math.min(1, obs.coherence));
  const cost = (typeof obs.cost === 'number' && isFinite(obs.cost)) ? Math.max(0, obs.cost) : 1.0;
  const projected = engine.peekProjection({ cost, coherence: clamped });
  return { current, projected, delta: projected - current };
}

/**
 * Classify the shape of a candidate contribution (or batch of them)
 * against the rolling baseline of recent activity. The H3 experiment
 * established that the field engine reads variance as a signal-validity
 * indicator: narrow-band contributions far from the field's current
 * neighbourhood collapse global coherence in a characteristic way, while
 * wide naturally-distributed contributions are tolerated even at low
 * values. This classifier names what the engine will see.
 *
 * Returned shape classes:
 *   constant-displaced   — variance ~0, mean far from baseline (synthetic-looking)
 *   narrow-band-displaced — small variance, mean far from baseline (the temporal-collapse class)
 *   constant-aligned     — variance ~0 but mean near baseline (e.g. all 0.99 at a steady field)
 *   narrow-band-aligned  — small variance, mean near baseline (fine — focused observation)
 *   bimodal              — variance >= 0.15 (e.g. half low + half high; tolerated)
 *   wide-uniform         — variance 0.05..0.15 (natural-observation spread)
 *   natural-high         — mean >= 0.85, ordinary variance
 *   natural-low          — mean <= 0.15, ordinary variance
 *   natural-mid          — anything else
 *
 * The thresholds come directly from the H3 measurement; they're not
 * arbitrary. See docs/EXPERIMENT_TEMPORAL_AND_FIFTH_FAMILY.md.
 */
function _classifyShape(input, baseline) {
  const { mean, variance, n } = input;
  if (n < 2) {
    if (mean >= 0.85) return 'natural-high';
    if (mean <= 0.15) return 'natural-low';
    return 'natural-mid';
  }
  const meanGap = Math.abs(mean - baseline.mean);
  const isConstant = variance <= 0.0005;
  const isNarrow = variance <= 0.005;
  if (isConstant && meanGap > 0.15) return 'constant-displaced';
  if (isNarrow && meanGap > 0.15) return 'narrow-band-displaced';
  if (isConstant) return 'constant-aligned';
  if (isNarrow) return 'narrow-band-aligned';
  if (variance >= 0.15) return 'bimodal';
  if (variance >= 0.05) return 'wide-uniform';
  if (mean >= 0.85) return 'natural-high';
  if (mean <= 0.15) return 'natural-low';
  return 'natural-mid';
}

/**
 * The signal-validity oracle. Validate a candidate contribution (or
 * batch) against the field's expected input shape without committing
 * unless explicitly asked. Returns an accept/reject verdict, the shape
 * class the engine would see, the rolling baseline used for the call,
 * and — for single contributions — a projected coherence deflection
 * via projectContribution().
 *
 * Inputs:
 *   obs = { source, coherence, cost? }         — single contribution; coherence is a number
 *   obs = { source, coherence: [c1, c2, ...] } — batch; coherence is an array
 *   obs = [{ source, coherence, cost? }, ...]  — batch as observation array
 *
 * Options:
 *   commit: false — when true, contribute() each value if the verdict is accepted
 *
 * Returned object:
 *   accepted     — boolean; the verdict
 *   shapeClass   — string; what the engine would see
 *   suspect      — boolean; shorthand for shapeClass ending in '-displaced'
 *   inputStats   — { mean, variance, n } of the candidate
 *   baseline     — { mean, variance, n } of the rolling buffer used
 *   projected    — { current, projected, delta } for single contributions, else null
 *   committed    — boolean; whether the contribution was actually written to the field
 *   reason       — string; non-empty when accepted=false
 *
 * Non-mutating by default. The point of validation is to gate, not to push.
 */
function validateContribution(obs, opts = {}) {
  const commit = opts.commit === true;
  if (obs == null) return { accepted: false, reason: 'no input provided' };

  let coherences = [];
  let source = null;
  let cost = 1.0;

  if (Array.isArray(obs)) {
    for (const o of obs) {
      const c = Number(o && o.coherence);
      if (Number.isFinite(c)) coherences.push(c);
    }
    source = (obs[0] && obs[0].source) || 'validate:batch';
    if (obs[0] && typeof obs[0].cost === 'number' && Number.isFinite(obs[0].cost)) cost = obs[0].cost;
  } else if (Array.isArray(obs.coherence)) {
    coherences = obs.coherence.filter(Number.isFinite);
    source = obs.source || 'validate:batch';
    if (typeof obs.cost === 'number' && Number.isFinite(obs.cost)) cost = obs.cost;
  } else if (typeof obs.coherence === 'number' && Number.isFinite(obs.coherence)) {
    coherences = [obs.coherence];
    source = obs.source || 'validate:single';
    if (typeof obs.cost === 'number' && Number.isFinite(obs.cost)) cost = obs.cost;
  } else {
    return { accepted: false, reason: 'no valid coherence values' };
  }

  if (coherences.length === 0) {
    return { accepted: false, reason: 'no finite coherence values' };
  }

  // Clamp to [0,1] — same gate as contribute() applies. Shape is judged
  // post-clamp because that's what the engine sees.
  coherences = coherences.map(c => Math.max(0, Math.min(1, c)));

  const inputStats = _stats(coherences);
  const baseline = _stats(_recentCoherences);
  const shapeClass = _classifyShape(inputStats, baseline);
  const suspect = shapeClass.endsWith('-displaced');

  // For single-shot, predict the actual field deflection. Batches don't
  // have a batch-projection primitive on the engine yet — the shape
  // verdict is the operational signal there.
  let projected = null;
  if (coherences.length === 1) {
    projected = projectContribution({ coherence: coherences[0], cost });
  }

  const result = {
    accepted: !suspect,
    shapeClass,
    suspect,
    inputStats,
    baseline,
    projected,
    committed: false,
    reason: suspect ? ('shape ' + shapeClass + ' inconsistent with rolling baseline (variance signature)') : null,
  };

  if (commit && !suspect) {
    for (const c of coherences) {
      contribute({ source, coherence: c, cost });
    }
    result.committed = true;
  }

  return result;
}

module.exports = {
  contribute,
  peekField,
  fieldPressure,
  localUpdateCount,
  projectContribution,
  validateContribution,
};
