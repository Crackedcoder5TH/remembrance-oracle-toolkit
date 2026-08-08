'use strict';

/**
 * field-coupling/validate.js — the rolling coherence baseline and the variance-signature gate: shape classification, gate modes, validateContribution, cognitionTrajectory.
 * Extracted verbatim from src/core/field-coupling.js in decomposition #4;
 * inline requires repathed one level deeper.
 */

const { _matchesLearnedShape } = require('./shapes');
// verbs is required lazily at call time — a top-level require here would
// be a load-order cycle (verbs imports the rolling baseline from this
// organ). Names stay identical so every body below is verbatim.
const contribute = (...a) => require('./verbs').contribute(...a);
const projectContribution = (...a) => require('./verbs').projectContribution(...a);

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

setVarianceGateMode.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Read the current variance-gate mode (default | tightened | relaxed). */
function getVarianceGateMode() {
  return { mode: _currentVarianceGateMode, displacementThreshold: _displacementThreshold };
}

getVarianceGateMode.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

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

validateContribution.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

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

cognitionTrajectory.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { _pushRecent, _stats, _classifyShape, setVarianceGateMode, getVarianceGateMode, validateContribution, cognitionTrajectory, _recentCoherences };
