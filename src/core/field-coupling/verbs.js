'use strict';
const { quiet } = require('../quiet');

/**
 * field-coupling/verbs.js — the field verbs every producer calls: contribute, peekField, fieldPressure, projections, pruning, and the record* telemetry family.
 * Extracted verbatim from src/core/field-coupling.js in decomposition #4;
 * inline requires repathed one level deeper.
 */

const { _engineInjected, _loadEngine, _recordReading } = require('./engine');
const { _classifyShape, _pushRecent, _recentCoherences, _stats } = require('./validate');
const { _bridgeToLiveField } = require('./bridge');

/**
 * Coupling-level surface over engine.pruneSources so the goggles reach
 * it (`--do call …#pruneFieldSources`). Exact keys + mandatory reason;
 * scalars untouched; the pruning is recorded in state.sourcesPruned.
 */
function pruneFieldSources(keys, reason) {
  const engine = _loadEngine();
  if (!engine) return null;
  return engine.pruneSources(keys, reason);
}

pruneFieldSources.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility", taint: "none" };

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
  // Resonance-weighted authority (optional, default full): how much this
  // contribution resonates with the substrate governs how much it can move
  // the field. Callers on the canonical read path (field-tool) pass the
  // measured substrate resonance; a fabricated low-resonance flood is
  // therefore near-powerless against the field.
  const resonance = (typeof obs.resonance === 'number' && isFinite(obs.resonance)) ? Math.max(0, Math.min(1, obs.resonance)) : null;
  const result = engine.contribute({ cost, coherence: clamped, source: obs.source || null, resonance });
  _recordReading(result);  // the void term (delta_void, void_source), r_eff and p, read off the field
  _pushRecent(clamped);

  // Compress every observation into the pattern library. The similarity
  // gate in field-memory drops redundant shapes by design; only genuinely
  // new observations are stored. Snapshots of the whole field are taken
  // periodically so the library carries the field's own history.
  // Best-effort — never blocks or breaks a contribute. An injected
  // (isolated) engine skips both shared side channels: its observations
  // belong to it alone.
  if (!_engineInjected()) {
    try {
      const fm = require('../field-memory');
      fm.recordObservation({ source: obs.source || null, coherence: clamped, cost });
      fm.maybeSnapshot(result || (engine.getState && engine.getState()) || null);
    } catch (_) { quiet('core:field-coupling:verbs:require', _); /* best-effort */ }

    // Funnel the same observation into the shared LIVE field over HTTP when one is
    // configured, so this repo's numbers reach the field every other repo and the
    // interface read from — not just this process's in-memory engine. Best-effort.
    _bridgeToLiveField({ coherence: clamped, source: obs.source || 'unknown', cost });
  }

  return result;
}

contribute.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 1, group: 1, period: 3, harmPotential: "none", alignment: "healing", intention: "neutral", domain: "utility" };

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
  if (!_engineInjected()) {
    try {
      require('../field-memory').maybeSnapshot(state);
    } catch (_) { quiet('core:field-coupling:verbs:require', _); /* best-effort — never break a field read */ }
  }
  return state;
}

peekField.atomicProperties = { charge: 0, valence: 1, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 1, group: 9, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

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

fieldPressure.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

// ── Cost / coherency separation (explicit convention) ────────────────────
//
// The engine's master equation already auto-balances cost and coherence:
//   entropy(t) = cost / (coherence(t) + ε)
// Cost raises entropy; coherence lowers it. Cost-side contributions
// without a coherency benefit drive the substrate toward saturation;
// coherency-side contributions release that pressure. The two are
// thermodynamic conjugates.
//
// `recordCost` and `recordBenefit` are explicit-convention wrappers that
// make the intent of a contribution visible at the call site. Use them
// instead of raw `contribute()` whenever you can:
//
//   recordCost({ units, source, kind })
//     — register pure work that consumed resources: compute time,
//       money, energy, a swarm run, an audit pass. Raises entropy
//       without claiming a coherency benefit. The substrate "feels"
//       this as load.
//
//   recordBenefit({ coherence, source, cost })
//     — register a coherency-positive outcome: a verified pattern,
//       a healed file, a passed audit, an accepted contribution.
//       Raises the coherence integral while incurring a (typically
//       small) cost.
//
// The pair is auto-balanced: a swarm run that produces a verified
// pattern can call both — recordCost for the compute spend,
// recordBenefit for the outcome — and the engine integrates them
// against each other. The covenant aim — always raise coherency net —
// is enforced by the consensus gate and the field's own dynamics.

/**
 * Register a pure cost contribution. Drives entropy up without
 * claiming a coherency benefit.
 *
 * @param {object} obs
 * @param {number} obs.units — work units spent (compute time, dollars, kWh, swarm runs)
 * @param {string} obs.source — caller identity, e.g. 'swarm:run' or 'compute:gpt-4'
 * @param {string} [obs.kind='work'] — optional kind tag for the source label
 * @returns {object|null} engine result or null
 */
function recordCost({ units, source, kind = 'work' } = {}) {
  const u = (typeof units === 'number' && isFinite(units)) ? Math.max(0, units) : 1.0;
  const current = peekField();
  const passthroughCoherence = current ? current.coherence : 0.65;
  const label = (typeof source === 'string' && source) ? source : ('cost:' + kind);
  return contribute({ cost: u, coherence: passthroughCoherence, source: label });
}

recordCost.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Register a coherency-positive outcome. Drives the coherence integral
 * up. Pair with recordCost when there was associated work — they
 * auto-balance against each other in the engine's master equation.
 *
 * @param {object} obs
 * @param {number} obs.coherence — coherency reading in [0, 1]
 * @param {string} obs.source — caller identity, e.g. 'swarm:winner' or 'audit:passed'
 * @param {number} [obs.cost=1.0] — associated work cost (default 1.0)
 * @returns {object|null} engine result or null
 */
function recordBenefit({ coherence, source, cost = 1.0 } = {}) {
  if (typeof coherence !== 'number' || !isFinite(coherence)) return null;
  const label = (typeof source === 'string' && source) ? source : 'benefit:unspecified';
  return contribute({ cost, coherence, source: label });
}

recordBenefit.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * Sample how full the durable volume is and record it as a cost — the storage
 * volume's pressure flowing into the same entropy ledger as every other cost,
 * auto-balanced against coherency via the master equation. The fuller the
 * volume, the more the field feels it. Best-effort: a platform without statfs,
 * or an unreadable path, records nothing and never throws.
 *
 * Reported as a [0,1] used-fraction (not raw bytes) so it reads as a gentle,
 * coherence-balanced load rather than a number that would swamp the field.
 *
 * @param {object} [opts]
 * @param {string} [opts.path] — a directory on the volume (defaults to
 *   REMEMBRANCE_STATE_DIR / the entropy file's dir / cwd)
 * @returns {object|null} engine result, or null when unmeasurable
 */
function recordStorageVolume({ path: dir } = {}) {
  let fs, nodePath;
  try { fs = require('node:fs'); nodePath = require('node:path'); } catch (_) { return null; }
  if (typeof fs.statfsSync !== 'function') return null;
  const target = dir
    || process.env.REMEMBRANCE_STATE_DIR
    || (process.env.ENTROPY_PATH && nodePath.dirname(process.env.ENTROPY_PATH))
    || process.cwd();
  try {
    const st = fs.statfsSync(target);
    const total = st.blocks * st.bsize;
    if (!(total > 0)) return null;
    const usedFraction = Math.max(0, Math.min(1, (st.blocks - st.bfree) / st.blocks));
    return recordCost({ units: usedFraction, source: 'storage:volume', kind: 'disk' });
  } catch (_) { return null; }
}

recordStorageVolume.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

// ── Meta-observation as a first-class contribution type ──────────────────

/**
 * Record a meta-observation: aggregate a trajectory of edit/measurement
 * scores, classify its shape via the dual oracle, and contribute the
 * classification back to the field as a structured observation. This
 * makes "the substrate measured my work" a normal recorded type of
 * contribution rather than an ad-hoc end-of-session ritual.
 *
 * The substrate ends up containing a permanent record of its own
 * observation of being observed — the law of infinite reflection
 * with a write-through to the field histogram.
 *
 * @param {object} obs
 * @param {number[]} obs.scores — per-edit/per-measurement coherency readings
 * @param {string} obs.source — caller/session label
 * @param {string} [obs.sessionId] — optional session id appended to the source
 * @returns {object} { recorded, source, stats, shapeClass, accepted, ... }
 */
function recordMetaObservation({ scores, source, sessionId } = {}) {
  if (!Array.isArray(scores) || scores.length === 0) {
    return { recorded: false, reason: 'no scores provided' };
  }
  const cleaned = scores.filter(Number.isFinite).map(c => Math.max(0, Math.min(1, c)));
  if (cleaned.length === 0) return { recorded: false, reason: 'no finite scores' };

  const stats = _stats(cleaned);
  const baseline = _stats(_recentCoherences);
  const shapeClass = _classifyShape(stats, baseline);
  const accepted = !shapeClass.endsWith('-displaced') && shapeClass !== 'value-outlier-low';
  const label = 'meta:' + (source || 'cognition-trajectory') + (sessionId ? ':' + sessionId : '');

  if (!accepted) {
    return {
      recorded: false,
      reason: 'trajectory shape ' + shapeClass + ' would not pass the gate',
      source: label,
      stats,
      shapeClass,
    };
  }

  // NO AVERAGING. This used to contribute stats.mean — one fabricated number
  // standing in for N readings. Each cleaned reading goes in as itself, at
  // cost 1. `stats` is still returned for the caller to read the trajectory's
  // shape; it just no longer becomes the field's input.
  let result = null;
  for (const c of cleaned) {
    result = contribute({ source: label, coherence: c, cost: 1 });
  }
  return {
    recorded: true,
    source: label,
    stats,
    shapeClass,
    fieldAfter: result ? { coherence: result.coherence, globalEntropy: result.globalEntropy, cascadeFactor: result.cascadeFactor } : null,
  };
}

recordMetaObservation.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

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

projectContribution.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 1, period: 2, harmPotential: "none", alignment: "healing", intention: "neutral", domain: "utility" };

module.exports = { pruneFieldSources, contribute, peekField, fieldPressure, recordCost, recordBenefit, recordStorageVolume, recordMetaObservation, projectContribution };
