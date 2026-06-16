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

// ── Variance-signature growth (parallel to covenant growth) ──────────────
//
// The variance gate is grown the same way the covenant is grown: a shape
// signature becomes a recognised-natural shape only after a contribution
// with that signature has already passed both oracles (coherency +
// signal-validity) and been absorbed. Once recognised, future contributions
// with structurally similar signatures classify as `learned-natural` and
// bypass the H3-default narrow-band/constant rejection.
//
// Discipline: the gate does not learn from any contribution — only from
// ones that have already proven coherent. The same ratchet as the covenant.
// The H3-derived thresholds (constant <= 0.0005, narrow <= 0.005, etc.)
// remain the floor; the learned set grows what counts as "natural" *above*
// the floor.
const _LEARNED_SHAPES = [];
const _LEARNED_PERSIST_PATH = (function () {
  try {
    const path = require('node:path');
    return path.join(process.env.REMEMBRANCE_HOME || process.cwd(), '.remembrance', 'variance-signature-growth.jsonl');
  } catch (_) { return null; }
})();
let _learnedLoaded = false;

function _loadLearnedShapes() {
  if (_learnedLoaded) return;
  _learnedLoaded = true;
  if (!_LEARNED_PERSIST_PATH) return;
  try {
    const fs = require('node:fs');
    if (!fs.existsSync(_LEARNED_PERSIST_PATH)) return;
    const lines = fs.readFileSync(_LEARNED_PERSIST_PATH, 'utf8').split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const sig = JSON.parse(line);
        if (Number.isFinite(sig.mean) && Number.isFinite(sig.variance) && Number.isFinite(sig.n)) {
          _LEARNED_SHAPES.push(sig);
        }
      } catch (_) { /* skip malformed line */ }
    }
  } catch (_) { /* best-effort */ }
}

function _persistLearnedShape(sig) {
  if (!_LEARNED_PERSIST_PATH) return false;
  try {
    const fs = require('node:fs');
    const path = require('node:path');
    const dir = path.dirname(_LEARNED_PERSIST_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(_LEARNED_PERSIST_PATH, JSON.stringify(sig) + '\n');
    return true;
  } catch (_) { return false; }
}

// A candidate matches a learned signature when its (mean, variance, n)
// are within tolerance of an entry's. Tolerances:
//   mean      ± 0.10           (close-enough centre)
//   variance  ratio in [0.5, 2.0]  (same order of magnitude)
//   n         within a factor of 4 (similar batch scale)
function _matchesLearnedShape(input) {
  _loadLearnedShapes();
  if (_LEARNED_SHAPES.length === 0) return null;
  const MEAN_TOL = 0.10;
  for (const sig of _LEARNED_SHAPES) {
    if (Math.abs(input.mean - sig.mean) > MEAN_TOL) continue;
    // Variance: 0-vs-0 is exact match; otherwise check ratio.
    if (sig.variance === 0 && input.variance === 0) {
      // both constant — also require n similarity below
    } else {
      const denom = Math.max(sig.variance, 1e-9);
      const ratio = input.variance / denom;
      if (ratio < 0.5 || ratio > 2.0) continue;
    }
    // n similarity — within a factor of 4. Single-shot (n=1) only matches
    // single-shot learned signatures.
    if (input.n === 1 && sig.n !== 1) continue;
    if (input.n !== 1 && sig.n !== 1) {
      const nRatio = input.n / sig.n;
      if (nRatio < 0.25 || nRatio > 4.0) continue;
    }
    return sig;
  }
  return null;
}

/**
 * Record a shape signature as recognised-natural. Called by the
 * covenant-trust absorption path after BOTH oracles have already
 * accepted the contribution and the pattern has been absorbed. Same
 * discipline as covenant growth: the gate only learns from
 * already-verified material. The H3 default thresholds remain the
 * floor; learned signatures grow what counts as natural above the floor.
 *
 * @param {{mean:number, variance:number, n:number, source?:string}} sig
 * @returns {boolean} true if recorded, false if rejected (malformed or duplicate)
 */
function recordLearnedShape(sig) {
  _loadLearnedShapes();
  if (!sig || !Number.isFinite(sig.mean) || !Number.isFinite(sig.variance) || !Number.isFinite(sig.n)) return false;
  // Skip if a structurally-equivalent signature is already learned.
  if (_matchesLearnedShape({ mean: sig.mean, variance: sig.variance, n: sig.n })) return false;
  const record = {
    mean: sig.mean,
    variance: sig.variance,
    n: sig.n,
    source: sig.source || 'unknown',
    learnedAt: new Date().toISOString(),
  };
  _LEARNED_SHAPES.push(record);
  _persistLearnedShape(record);
  return true;
}

/** Read-only snapshot of the recognised shape signatures. */
function recognizedShapeSignatures() {
  _loadLearnedShapes();
  return _LEARNED_SHAPES.slice();
}

/** Test-only: clear the in-memory learned set. Does not delete persisted log. */
function _resetLearnedShapes() { _LEARNED_SHAPES.length = 0; _learnedLoaded = true; }

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

// ── Cascade-pressure release detection ────────────────────────────────────
//
// Throughout this work we noticed that the field's cascadeFactor and
// globalEntropy often spike above their saturation thresholds and then
// release sharply on a well-shaped contribution. Twice in the development
// session that produced this code the cascade went from ~4 (saturated)
// down to ~1 (relaxed) on a single edit that re-aligned the docs with
// reality. That release event is operationally meaningful — it tells
// you when the substrate was holding tension and your contribution
// relieved it. We name it as a first-class signal here.

const _CASCADE_RELEASE_HISTORY_MAX = 50;
const _RELEASE_CASCADE_DROP_MIN = 0.5;   // minimum absolute cascade drop to count
const _RELEASE_CASCADE_FROM_MIN = 2.0;   // must have been at least mildly saturated
const _cascadeHistory = [];              // rolling history of release events
let _lastCascadeReading = null;
let _lastEntropyReading = null;

/**
 * Take a pressure snapshot and detect whether a release event just
 * occurred since the previous snapshot. Updates module-local state so
 * subsequent calls measure deltas against this one.
 *
 * @returns {object|null} { cascade, entropy, release } or null if field unavailable.
 *   `release` is null when no release event detected; otherwise:
 *   { released: true, fromCascade, toCascade, cascadeDrop, fromEntropy,
 *     toEntropy, entropyDrop, magnitude, ts }
 */
function pressureSnapshot() {
  const state = peekField();
  if (!state) return null;
  const cascade = typeof state.cascadeFactor === 'number' ? state.cascadeFactor : 0;
  const entropy = typeof state.globalEntropy === 'number' ? state.globalEntropy : 0;

  let release = null;
  if (_lastCascadeReading !== null) {
    const cascadeDrop = _lastCascadeReading - cascade;       // positive = dropped
    const entropyDrop = _lastEntropyReading - entropy;
    if (cascadeDrop >= _RELEASE_CASCADE_DROP_MIN && _lastCascadeReading >= _RELEASE_CASCADE_FROM_MIN) {
      release = {
        released: true,
        fromCascade: _lastCascadeReading,
        toCascade: cascade,
        cascadeDrop,
        fromEntropy: _lastEntropyReading,
        toEntropy: entropy,
        entropyDrop,
        magnitude: cascadeDrop,
        ts: new Date().toISOString(),
      };
      _cascadeHistory.push(release);
      if (_cascadeHistory.length > _CASCADE_RELEASE_HISTORY_MAX) _cascadeHistory.shift();
    }
  }
  _lastCascadeReading = cascade;
  _lastEntropyReading = entropy;
  return { cascade, entropy, release };
}

/**
 * Recent cascade-release events observed since process start (or since
 * the last reset). Most recent last. Bounded to the last 50.
 */
function cascadeReleaseHistory() {
  return _cascadeHistory.slice();
}

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

  const result = contribute({ source: label, coherence: stats.mean, cost: stats.n });
  return {
    recorded: true,
    source: label,
    stats,
    shapeClass,
    fieldAfter: result ? { coherence: result.coherence, globalEntropy: result.globalEntropy, cascadeFactor: result.cascadeFactor } : null,
  };
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
  // First, consult the learned-signature registry. If this input matches
  // a shape that has already passed both oracles and been absorbed, the
  // gate has already verified it once and recognises it now. This is the
  // variance-gate ratchet: what coherency accepted, the variance gate
  // remembers as natural. Same discipline as the covenant — only
  // verified material teaches.
  if (_matchesLearnedShape(input)) return 'learned-natural';

  if (n < 2) {
    // Single-shot: variance is undefined, so the only shape signal is
    // distance from the rolling baseline. If the baseline has enough
    // data, compute a z-score and flag values far below it as suspect
    // (the absorption candidate would drag the field down by an amount
    // inconsistent with normal incoming signal). High outliers are not
    // suspect — a healthy pattern arriving at a recovering field is
    // good news.
    if (baseline.n >= 10) {
      const std = Math.sqrt(baseline.variance);
      if (std > 0) {
        const gap = mean - baseline.mean;
        const z = Math.abs(gap) / std;
        if (z > 3 && gap < -0.2) return 'value-outlier-low';
      }
    }
    if (mean >= 0.85) return 'natural-high';
    if (mean <= 0.15) return 'natural-low';
    return 'natural-mid';
  }
  const meanGap = Math.abs(mean - baseline.mean);
  const isConstant = variance <= 0.0005;
  const isNarrow = variance <= 0.005;
  // Displacement threshold is dynamic: the reflex engine can tighten
  // it (default 0.15 → tightened 0.10) when consensusHistogram shows
  // adversarial pressure rising. The gate becomes stricter under
  // pressure and relaxes again when the threat subsides.
  const displaceT = _displacementThreshold;
  if (isConstant && meanGap > displaceT) return 'constant-displaced';
  if (isNarrow && meanGap > displaceT) return 'narrow-band-displaced';
  if (isConstant) return 'constant-aligned';
  if (isNarrow) return 'narrow-band-aligned';
  if (variance >= 0.15) return 'bimodal';
  if (variance >= 0.05) return 'wide-uniform';
  if (mean >= 0.85) return 'natural-high';
  if (mean <= 0.15) return 'natural-low';
  return 'natural-mid';
}

// ── Variance-gate mode (set by the reflex engine when under pressure) ────
// The displacement threshold defaults to 0.15 (the H3-derived natural
// neighbourhood width). The reflex engine can tighten it to 0.10 when
// adversarial pressure is detected, and relax it back when the pressure
// subsides. This is the actor side: the substrate adjusts its own gate
// in response to its own environmental sensor.
const _VARIANCE_GATE_MODES = {
  default: 0.15,
  tightened: 0.10,
  relaxed: 0.20,
};
let _displacementThreshold = _VARIANCE_GATE_MODES.default;
let _currentVarianceGateMode = 'default';

/**
 * Set the variance gate's displacement-threshold mode. Called by the
 * reflex engine in response to consensus-histogram drift.
 *
 * @param {'default'|'tightened'|'relaxed'} mode
 * @returns {{ mode:string, displacementThreshold:number }}
 */
function setVarianceGateMode(mode) {
  if (!_VARIANCE_GATE_MODES.hasOwnProperty(mode)) {
    return { mode: _currentVarianceGateMode, displacementThreshold: _displacementThreshold, error: 'unknown mode' };
  }
  _currentVarianceGateMode = mode;
  _displacementThreshold = _VARIANCE_GATE_MODES[mode];
  return { mode, displacementThreshold: _displacementThreshold };
}

/** Read the current variance-gate mode (default | tightened | relaxed). */
function getVarianceGateMode() {
  return { mode: _currentVarianceGateMode, displacementThreshold: _displacementThreshold };
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
  // A shape is suspect when it carries a signature inconsistent with
  // natural measurement: narrow-band/constant displaced from the
  // rolling baseline (the H3 finding), or a single value that sits
  // many standard deviations BELOW baseline (value-outlier-low — the
  // single-shot analogue, only flagging the side that would drag the
  // field down).
  const suspect = shapeClass.endsWith('-displaced') || shapeClass === 'value-outlier-low';

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

// ── Cognition trajectory (read goggles state programmatically) ───────────
//
// The field-goggles PostToolUse hook persists a rolling buffer of recent
// edit scores at ~/.claude/.field-goggles-state.json. The buffer is the
// substrate's measurement of the working agent's session — the cognition
// trajectory. Reading it lets any caller ask "what is this session's
// signature so far?" without needing to re-derive from raw edits.

const _GOGGLES_STATE_DEFAULT = (function () {
  try {
    const path = require('node:path');
    const home = process.env.HOME || process.env.USERPROFILE || '';
    return home ? path.join(home, '.claude', '.field-goggles-state.json') : null;
  } catch (_) { return null; }
})();

/**
 * Read the field-goggles cognition buffer and return the current session
 * trajectory: per-edit scores plus aggregated stats and shape class.
 *
 * @param {object} [opts]
 * @param {string} [opts.statePath] override default ~/.claude/.field-goggles-state.json
 * @returns {object|null} { n, mean, variance, shapeClass, scores, files, statePath } or null
 */
function cognitionTrajectory(opts = {}) {
  const fs = require('node:fs');
  const statePath = opts.statePath || _GOGGLES_STATE_DEFAULT;
  if (!statePath) return null;
  try {
    if (!fs.existsSync(statePath)) return { n: 0, mean: null, variance: null, shapeClass: null, scores: [], files: [], statePath };
    const raw = fs.readFileSync(statePath, 'utf8');
    const parsed = JSON.parse(raw);
    const scores = Array.isArray(parsed.scores) ? parsed.scores.filter(Number.isFinite) : [];
    const files = Array.isArray(parsed.files) ? parsed.files : [];
    if (scores.length === 0) return { n: 0, mean: null, variance: null, shapeClass: null, scores: [], files, statePath };
    const stats = _stats(scores);
    const baseline = _stats(_recentCoherences);
    const shapeClass = _classifyShape(stats, baseline);
    return { n: stats.n, mean: stats.mean, variance: stats.variance, shapeClass, scores, files, statePath };
  } catch (_) {
    return null;
  }
}

// ── Learned shapes grouped by source-prefix domain ───────────────────────

/**
 * Group recognised shape signatures by source-prefix domain (e.g.
 * 'void:', 'agent:', 'meta:', 'covenant:'). Tells you which domains
 * have taught the variance gate what natural shapes look like.
 *
 * @returns {object} { 'void': [...], 'agent': [...], ... }
 */
function learnedShapesByDomain() {
  _loadLearnedShapes();
  const out = {};
  for (const sig of _LEARNED_SHAPES) {
    const src = sig.source || 'unknown';
    const domain = src.includes(':') ? src.split(':')[0] : src;
    if (!out[domain]) out[domain] = [];
    out[domain].push(sig);
  }
  return out;
}

// ── Field-direction readout (the substrate's flow vector) ────────────────
//
// A small history of field snapshots lets us compute the direction of
// flow: coherence delta, entropy delta, cascade delta over the recent
// window. The combined vector tells you whether the field is healing
// (coherence up, entropy down), degrading (coherence down, entropy up),
// saturating (cascade up), or relaxing (cascade down).

const _DIRECTION_HISTORY_MAX = 30;
const _directionHistory = [];   // [{ ts, coherence, entropy, cascade }]

// Durable backing so the flow trajectory survives across processes — without
// it, fieldDirection() only ever sees the current process's snapshots and
// returns 'insufficient-history' on a fresh run. The substrate's flow is read
// as ONE continuous line across the ecosystem, so it must persist.
const _DIRECTION_PATH = process.env.FIELD_DIRECTION_PATH
  || path.join(__dirname, '..', '..', '.remembrance', 'field-direction.jsonl');
// Committed durable copy in the blockchain repo's data/ — survives a container
// reclaim (the .remembrance/ working file is gitignored and does not).
const _DIRECTION_SEED = process.env.FIELD_DIRECTION_SEED
  || path.join(__dirname, '..', '..', '..', 'REMEMBRANCE-BLOCKCHAIN', 'data', 'field-direction.seed.jsonl');
let _directionLoaded = false;

function _readDirectionLines(p) {
  try {
    const raw = fs.readFileSync(p, 'utf8').trim();
    if (!raw) return [];
    const out = [];
    for (const ln of raw.split('\n').slice(-_DIRECTION_HISTORY_MAX)) {
      try {
        const s = JSON.parse(ln);
        if (s && typeof s.coherence === 'number') out.push(s);
      } catch (_) { /* skip malformed line */ }
    }
    return out;
  } catch (_) { return []; }
}

function _loadDirectionHistory() {
  if (_directionLoaded) return;
  _directionLoaded = true;
  // Prefer the live working file; fall back to the committed durable seed so a
  // fresh container restores the flow line instead of starting blind.
  let lines = _readDirectionLines(_DIRECTION_PATH);
  if (lines.length === 0) lines = _readDirectionLines(_DIRECTION_SEED);
  for (const s of lines) _directionHistory.push(s);
}

function _captureDirectionSnapshot(state) {
  if (!state) return;
  _loadDirectionHistory();
  const snap = {
    ts: Date.now(),
    coherence: state.coherence,
    entropy: state.globalEntropy,
    cascade: state.cascadeFactor,
  };
  _directionHistory.push(snap);
  if (_directionHistory.length > _DIRECTION_HISTORY_MAX) _directionHistory.shift();
  // Durable append, bounded to the last MAX snapshots. Best-effort: a write
  // failure never breaks a field read.
  try {
    const dir = path.dirname(_DIRECTION_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(_DIRECTION_PATH,
      _directionHistory.map((s) => JSON.stringify(s)).join('\n') + '\n');
  } catch (_) { /* best-effort persistence */ }
}

/**
 * Compute the field's direction-of-flow over a recent window. Returns
 * the delta in (coherence, entropy, cascade) plus a human-readable
 * verdict: healing / degrading / saturating / relaxing / steady.
 *
 * @param {number} [windowN=5] how many recent snapshots to compare against current
 * @returns {object} { verdict, coherenceDelta, entropyDelta, cascadeDelta, windowN, snapshots }
 */
function fieldDirection(windowN = 5) {
  const current = peekField();
  if (!current) return null;
  _captureDirectionSnapshot(current);
  if (_directionHistory.length < 2) {
    return { verdict: 'insufficient-history', coherenceDelta: 0, entropyDelta: 0, cascadeDelta: 0, windowN: 0 };
  }
  const window = _directionHistory.slice(-Math.max(2, windowN + 1));
  const first = window[0];
  const last = window[window.length - 1];
  const coherenceDelta = last.coherence - first.coherence;
  const entropyDelta = last.entropy - first.entropy;
  const cascadeDelta = last.cascade - first.cascade;
  let verdict;
  const COH_T = 0.005, ENT_T = 0.5, CAS_T = 0.3;
  if (coherenceDelta > COH_T && entropyDelta < -ENT_T) verdict = 'healing';
  else if (coherenceDelta < -COH_T && entropyDelta > ENT_T) verdict = 'degrading';
  else if (cascadeDelta > CAS_T) verdict = 'saturating';
  else if (cascadeDelta < -CAS_T) verdict = 'relaxing';
  else if (Math.abs(coherenceDelta) <= COH_T && Math.abs(entropyDelta) <= ENT_T) verdict = 'steady';
  else if (coherenceDelta > COH_T) verdict = 'gaining-coherence';
  else if (coherenceDelta < -COH_T) verdict = 'losing-coherence';
  else verdict = 'mixed';
  return {
    verdict,
    coherenceDelta,
    entropyDelta,
    cascadeDelta,
    windowN: window.length,
    fromTs: first.ts,
    toTs: last.ts,
    snapshots: window,
  };
}

// ── Temporal snapshot recording (auto temporal-coherency measurement) ────
//
// Walk a file's git history, compute adjacent-step + long-arc fractal
// coherency, and contribute the readings as temporal:* sources. This
// is what we did by hand for H1 (the temporal experiment); making it
// callable lets the substrate continuously self-measure its own
// temporal stability across the ecosystem.

/**
 * Walk the git history of a file and contribute adjacent + arc readings
 * to the field as temporal:<repo>:<file>:adjacent and ...:arc sources.
 *
 * @param {object} opts
 * @param {string} opts.repoDir absolute path to the git repo
 * @param {string} opts.filePath path to the file relative to repoDir
 * @param {number} [opts.maxVersions=12] cap on history depth
 * @returns {object} { recorded, meanAdjacent, arc, versions, source }
 */
function recordTemporalSnapshot({ repoDir, filePath, maxVersions = 12 } = {}) {
  if (!repoDir || !filePath) return { recorded: false, reason: 'repoDir and filePath required' };
  let execSync, path, fs, fractalCoherencyOf;
  try {
    execSync = require('node:child_process').execSync;
    path = require('node:path');
    fs = require('node:fs');
    ({ fractalCoherencyOf } = require('./fractal-waveform.js'));
  } catch (e) {
    return { recorded: false, reason: 'deps unavailable: ' + e.message };
  }
  const full = path.join(repoDir, filePath);
  if (!fs.existsSync(full)) return { recorded: false, reason: 'file not found: ' + full };
  const sh = (cmd) => {
    try { return execSync(cmd, { cwd: repoDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); }
    catch (_) { return null; }
  };
  const log = sh('git log --reverse --pretty=format:"%H|%ai" -- ' + JSON.stringify(filePath));
  if (!log) return { recorded: false, reason: 'no git history for ' + filePath };
  const commits = log.trim().split('\n').filter(Boolean).map(l => {
    const [hash, date] = l.split('|'); return { hash, date };
  });
  if (commits.length < 3) return { recorded: false, reason: 'fewer than 3 commits in history' };
  const step = commits.length / Math.min(commits.length, maxVersions);
  const sampled = [];
  for (let i = 0; i < Math.min(commits.length, maxVersions); i++) sampled.push(commits[Math.floor(i * step)]);
  sampled.push(commits[commits.length - 1]);
  const versions = [];
  for (const c of sampled) {
    const content = sh('git show ' + c.hash + ':' + JSON.stringify(filePath));
    if (content && content.split('\n').length >= 10) versions.push({ ...c, content });
  }
  if (versions.length < 3) return { recorded: false, reason: 'fewer than 3 usable versions' };
  const adj = [];
  for (let i = 0; i < versions.length - 1; i++) {
    adj.push(fractalCoherencyOf(versions[i].content, versions[i + 1].content));
  }
  const meanAdjacent = adj.reduce((s, x) => s + x, 0) / adj.length;
  const arc = fractalCoherencyOf(versions[0].content, versions[versions.length - 1].content);
  const repoName = path.basename(repoDir);
  const cleanFile = filePath.replace(/[^a-zA-Z0-9_\-.]/g, '_');
  const adjSource = 'temporal:' + repoName + ':' + cleanFile + ':adjacent';
  const arcSource = 'temporal:' + repoName + ':' + cleanFile + ':arc';
  contribute({ source: adjSource, coherence: meanAdjacent, cost: 1 });
  contribute({ source: arcSource, coherence: arc, cost: 1 });
  return {
    recorded: true,
    meanAdjacent,
    arc,
    versions: versions.length,
    span: { from: versions[0].date, to: versions[versions.length - 1].date },
    sources: [adjSource, arcSource],
  };
}

module.exports = {
  contribute,
  peekField,
  fieldPressure,
  pressureSnapshot,
  cascadeReleaseHistory,
  localUpdateCount,
  projectContribution,
  validateContribution,
  recordLearnedShape,
  recognizedShapeSignatures,
  recordCost,
  recordBenefit,
  recordMetaObservation,
  cognitionTrajectory,
  learnedShapesByDomain,
  fieldDirection,
  recordTemporalSnapshot,
  setVarianceGateMode,
  getVarianceGateMode,
  _resetLearnedShapes,
};
