'use strict';

/**
 * field-coupling/engine.js — engine ownership: the singleton reference, injection flag, last reading and local update count — every other organ reaches this state through the accessors below, never directly.
 * Extracted verbatim from src/core/field-coupling.js in decomposition #4;
 * inline requires repathed one level deeper.
 */



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

// True while an injected engine is active (tests, scratch fields). An
// injected field is ISOLATED: no field-memory echo, no live-field HTTP
// bridge — only the canonical singleton participates in those.
let _injectedFlag = false;

let _localUpdateCountVal = 0;

// The most recent LRE contribution reading, cached so a caller that just
// contributed (e.g. the goggles reading a file) can surface the void term
// the field computed for it — delta_void + its provenance — without
// recomputing anything. null until the first contribution this process.
let _lastReadingVal = null;

function lastReading() { return _lastReadingVal; }

function _loadEngine() {
  if (_engineLoadAttempted) return _engineRef;
  _engineLoadAttempted = true;
  try {
    const { getEngine } = require('../living-remembrance');
    _engineRef = getEngine();
  } catch (_e) {
    _engineRef = null;
  }
  return _engineRef;
}

/**
 * Inject an engine for every field verb here — the isolation lever that
 * kills test order-dependence. Pass an isolated
 * `new LivingRemembranceEngine({ persistPath })` and all verbs route to
 * it with shared side channels disabled; pass `null` to restore the
 * canonical singleton. The LRE physics are untouched — only who holds
 * the state changes.
 */
function _setEngine(engine) {
  _engineRef = engine || null;
  _engineLoadAttempted = engine != null;
  _injectedFlag = engine != null;
  _lastReadingVal = null;
}

_setEngine.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility", taint: "none"  };

/** Number of successful contribute() calls made through this helper since process start. */
function localUpdateCount() {
  return _localUpdateCountVal;
}

localUpdateCount.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** True while an injected (isolated) engine is active. */
function _engineInjected() { return _injectedFlag; }
_engineInjected.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility", taint: "none" };

/** Record a contribution reading: caches lastReading, bumps the local count. */
function _recordReading(result) {
  _lastReadingVal = result;
  _localUpdateCountVal += 1;
}
_recordReading.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility", taint: "none" };

module.exports = { lastReading, _loadEngine, _setEngine, localUpdateCount, _engineInjected, _recordReading };
