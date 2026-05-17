'use strict';

/**
 * Event → LRE field bridge.
 *
 * Every event emitted via oracle._emit() participates in the unified
 * field by contributing to field-coupling. The histogram in
 * .remembrance/entropy.json then carries one source key per event
 * type — `event:<type>` — turning the field into a complete
 * compass of "what's firing right now" for any non-coder reader.
 *
 * Before this bridge: 19 event types were emitted; ~6 had internal
 * handlers (reactions.js, lifecycle.js, whisper.js). The rest landed
 * only on the WebSocket dashboard, or vanished if WS wasn't running.
 *
 * After: every emit lands on disk in the source histogram. Best-
 * effort: if field-coupling can't load the engine, the bridge no-ops
 * silently.
 *
 * Entry: wireEventFieldBridge(oracle). Idempotent per oracle instance.
 */

const { contribute } = require('./field-coupling');

/**
 * Map an event payload to a numeric coherence signal in [0, 1].
 * Returns null if the event should be skipped (e.g. unknown type +
 * no obvious signal). Falls back to 0.5 (neutral) for known types
 * without an obvious numeric.
 */
function _coherenceFor(event) {
  if (!event || typeof event.type !== 'string') return null;
  const p = event;
  switch (event.type) {
    // ── Positive outcomes
    case 'feedback':           return clamp01(p.newReliability ?? 0.7);
    case 'pattern_registered': return clamp01(p.coherency ?? 0.85);
    case 'auto_promote':       return clamp01(p.coherency ?? 0.9);
    case 'auto_heal':          return clamp01(p.newCoherency ?? 0.8);
    case 'healing_complete':   return clamp01(p.coherency ?? 0.85);
    case 'pattern_evolved':    return clamp01(p.newCoherency ?? 0.85);
    case 'harvest_complete':   return clamp01(p.coherency ?? p.avgCoherency ?? 0.8);
    case 'entangled':          return 0.85;  // entanglement is structurally positive
    case 'entry_added':        return clamp01(p.coherency ?? 0.7);
    case 'auto_grow':          return 0.7;
    case 'compound_growth':    return 0.75;
    case 'cascade_spawn':      return clamp01(p.newAmplitude ?? 0.75);
    case 'similarity_candidate':
      return clamp01(p.similarity ?? p.score ?? 0.6);

    // ── Cleanup / maintenance signals
    case 'decoherence_sweep':  return clamp01(p.avgAmplitude ?? 0.4);
    case 'field_reexcited':    return clamp01(p.avgAmplitude ?? 0.7);
    case 'deep_clean':         return 0.65;
    case 'coherency_rechecked':return clamp01(p.coherency ?? 0.5);
    case 'resolve_served':     return clamp01(p.coherency ?? 0.7);
    case 'import_complete':    return clamp01(p.successRate ?? 0.7);
    case 'vote':               return p.approve === false ? 0.0 : clamp01(p.weight ?? 1.0);
    case 'debug_capture':      return 0.5;
    case 'debug_feedback':     return p.succeeded === false ? 0.2 : 0.85;

    // ── Negative / failure signals
    case 'auto_heal_failed':   return 0.1;
    case 'rejection_captured': return 0.15;
    case 'regressions_detected': return 0.2;
    case 'rollback':           return 0.3;
    case 'stale_detected':     return 0.4;
    case 'auto_submit_complete': return clamp01(p.coherency ?? 0.65);

    default: return null; // unknown type — let the caller decide
  }
}

function _costFor(event) {
  if (!event) return 1;
  if (typeof event.count === 'number' && event.count > 0) return event.count;
  if (typeof event.spawned === 'number' && event.spawned > 0) return event.spawned;
  if (typeof event.totalDecohered === 'number' && event.totalDecohered > 0) return event.totalDecohered;
  if (typeof event.reexcited === 'number' && event.reexcited > 0) return event.reexcited;
  if (typeof event.harvested === 'number' && event.harvested > 0) return event.harvested;
  if (typeof event.cleaned === 'number' && event.cleaned > 0) return event.cleaned;
  if (typeof event.imported === 'number' && event.imported > 0) return event.imported;
  return 1;
}

function clamp01(n) {
  if (typeof n !== 'number' || !isFinite(n)) return 0.5;
  return Math.max(0, Math.min(1, n));
}

/**
 * Subscribe an oracle's event stream to the LRE field.
 *
 * @param {object} oracle - RemembranceOracle instance (must expose `on`)
 * @returns {() => void} unsubscribe function (no-op if oracle.on missing)
 */
function wireEventFieldBridge(oracle) {
  if (!oracle || typeof oracle.on !== 'function') return () => {};
  if (oracle._fieldBridgeWired) return oracle._fieldBridgeOff || (() => {});

  const off = oracle.on((event) => {
    try {
      if (!event || typeof event.type !== 'string') return;
      const coherence = _coherenceFor(event);
      if (coherence === null) return; // unknown type — skip rather than mislabel
      const cost = _costFor(event);
      contribute({ cost, coherence, source: `event:${event.type}` });
    } catch (_) { /* best-effort — bridge must never break emit */ }
  });

  oracle._fieldBridgeWired = true;
  oracle._fieldBridgeOff = () => {
    try { off(); } catch (_) { /* noop */ }
    oracle._fieldBridgeWired = false;
    oracle._fieldBridgeOff = null;
  };
  return oracle._fieldBridgeOff;
}

module.exports = {
  wireEventFieldBridge,
  // Exposed for testing
  _coherenceFor,
  _costFor,
};
