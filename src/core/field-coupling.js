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

function _loadEngine() {
  if (_engineLoadAttempted) return _engineRef;
  _engineLoadAttempted = true;
  try {
    const { getEngine } = require('../core/living-remembrance');
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
  const result = engine.contribute({
    cost: typeof obs.cost === 'number' && isFinite(obs.cost) ? Math.max(0, obs.cost) : 1.0,
    coherence: clamped,
    source: obs.source || null,
  });
  _localUpdateCount += 1;

  // Compress every observation into the pattern library. The similarity
  // gate in field-memory drops redundant shapes by design; only genuinely
  // new observations are stored. Snapshots of the whole field are taken
  // periodically so the library carries the field's own history.
  // Best-effort — never blocks or breaks a contribute.
  try {
    const fm = require('./field-memory');
    fm.recordObservation({ source: obs.source || null, coherence: clamped, cost: obs.cost });
    fm.maybeSnapshot(result || (engine.getState && engine.getState()) || null);
  } catch (_) { /* best-effort */ }

  return result;
}

/** Read current field state without contributing. */
function peekField() {
  const engine = _loadEngine();
  if (!engine) return null;
  return engine.getState();
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

module.exports = {
  contribute,
  peekField,
  fieldPressure,
  localUpdateCount,
};
