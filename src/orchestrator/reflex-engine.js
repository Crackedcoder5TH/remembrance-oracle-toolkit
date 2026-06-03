'use strict';

/**
 * Reflex Engine — the actor side of the substrate.
 *
 * Up until this layer the substrate has been an observer: it measures
 * its own pressure (cascadeFactor), its own environment
 * (consensusHistogram), its own contributors (cognitionTrajectory), its
 * own direction (fieldDirection). Every one of those sensors has been
 * a callable read-only readout that nothing acts on automatically.
 *
 * The reflex engine wires sensors to specific responses. Each reflex
 * follows the canonical pattern established by entropy-relaxer:
 *
 *   1. Cooldown — module-level timestamp prevents firing every cycle
 *   2. Threshold-based triggering — fires only when sensor crosses a bound
 *   3. Best-effort, never-throw — failures return a structured verdict,
 *      never raise into a caller
 *   4. Structured verdict — { triggered, reason, action, ... } whether
 *      it fired or not
 *   5. Bounded effect — every action is bounded and reversible
 *
 * Reflexes (this checkout):
 *
 *   tightenIfAdversarial   — consensusHistogram A-yes-B-no rises
 *                            → setVarianceGateMode('tightened')
 *                            (gate becomes stricter under injection pressure)
 *
 *   warnIfCognitionDrifting — cognitionTrajectory variance rises sharply
 *                             → emit a focus-warning verdict
 *                             (no field mutation; signals the working agent)
 *
 *   relaxIfDegrading       — fieldDirection reports 'degrading' for N ticks
 *                             → delegates to relaxIfHot (existing reflex)
 *                             (entropy-side response to coherency-side signal)
 *
 *   restoreIfQuietened     — adversarial ratio drops back below floor
 *                             → setVarianceGateMode('default')
 *                             (the tighten reflex is reversible)
 *
 * fireReflexes() runs all reflexes on a tick and returns the structured
 * verdicts. The orchestrator can call it from any loop (cron, hook, or
 * MCP action); each reflex is independent and safe to skip.
 */

const { relaxIfHot } = require('./entropy-relaxer');
const { consensusHistogram } = require('../core/covenant-trust');
const {
  cognitionTrajectory,
  fieldDirection,
  setVarianceGateMode,
  getVarianceGateMode,
} = require('../core/field-coupling');

// ── Cooldowns ───────────────────────────────────────────────────────────
let _lastTightenAt = 0;
let _lastWarnAt = 0;
let _lastDegradeRelaxAt = 0;
let _lastRestoreAt = 0;

// ── Threshold defaults (overridable per call) ───────────────────────────
const DEFAULTS = {
  adversarialThreshold: 0.15,    // A-yes-B-no ratio above this = tighten
  restoreThreshold:    0.05,     // and below this = restore
  cognitionVarianceThreshold: 0.05, // trajectory variance above = warn
  cognitionMinN: 5,
  degradeConsecutive: 3,
  windowN: 50,
  tightenCooldownMs: 60_000,
  warnCooldownMs:    30_000,
  degradeCooldownMs: 60_000,
  restoreCooldownMs: 60_000,
};

/**
 * Reflex: tighten the variance gate when adversarial pressure rises.
 * Fires when the A-yes-B-no ratio (sophisticated-injection class) in
 * the consensus histogram exceeds the adversarial threshold.
 */
function tightenIfAdversarial(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = Date.now();
  if (now - _lastTightenAt < o.tightenCooldownMs) {
    return { triggered: false, reason: 'cooldown', reflex: 'tighten-if-adversarial' };
  }
  let h;
  try { h = consensusHistogram(o.windowN); }
  catch (e) { return { triggered: false, reason: 'histogram-unavailable', error: String(e), reflex: 'tighten-if-adversarial' }; }
  if (!h || h.total < 10) {
    return { triggered: false, reason: 'insufficient-history', total: h ? h.total : 0, reflex: 'tighten-if-adversarial' };
  }
  const ratio = h.ratios['A-yes-B-no'] || 0;
  if (ratio < o.adversarialThreshold) {
    return { triggered: false, reason: 'below-threshold', ratio, threshold: o.adversarialThreshold, reflex: 'tighten-if-adversarial' };
  }
  const current = getVarianceGateMode();
  if (current.mode === 'tightened') {
    return { triggered: false, reason: 'already-tightened', ratio, reflex: 'tighten-if-adversarial' };
  }
  const before = current;
  const after = setVarianceGateMode('tightened');
  _lastTightenAt = now;
  return {
    triggered: true,
    reflex: 'tighten-if-adversarial',
    action: 'variance-gate-tightened',
    ratio,
    threshold: o.adversarialThreshold,
    before,
    after,
  };
}

/**
 * Reflex: restore the variance gate to default when adversarial
 * pressure subsides. The tighten reflex is reversible — if the
 * substrate's environment calms down, the gate relaxes back.
 */
function restoreIfQuietened(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = Date.now();
  if (now - _lastRestoreAt < o.restoreCooldownMs) {
    return { triggered: false, reason: 'cooldown', reflex: 'restore-if-quietened' };
  }
  const current = getVarianceGateMode();
  if (current.mode !== 'tightened') {
    return { triggered: false, reason: 'gate-not-tightened', mode: current.mode, reflex: 'restore-if-quietened' };
  }
  let h;
  try { h = consensusHistogram(o.windowN); }
  catch (e) { return { triggered: false, reason: 'histogram-unavailable', error: String(e), reflex: 'restore-if-quietened' }; }
  if (!h || h.total < 10) {
    return { triggered: false, reason: 'insufficient-history', total: h ? h.total : 0, reflex: 'restore-if-quietened' };
  }
  const ratio = h.ratios['A-yes-B-no'] || 0;
  if (ratio > o.restoreThreshold) {
    return { triggered: false, reason: 'above-restore-threshold', ratio, threshold: o.restoreThreshold, reflex: 'restore-if-quietened' };
  }
  const before = current;
  const after = setVarianceGateMode('default');
  _lastRestoreAt = now;
  return {
    triggered: true,
    reflex: 'restore-if-quietened',
    action: 'variance-gate-restored',
    ratio,
    before,
    after,
  };
}

/**
 * Reflex: emit a focus-warning verdict when cognition trajectory
 * variance rises sharply. Does NOT mutate the field — the warning is
 * structural information for the working agent.
 */
function warnIfCognitionDrifting(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = Date.now();
  if (now - _lastWarnAt < o.warnCooldownMs) {
    return { triggered: false, reason: 'cooldown', reflex: 'warn-if-cognition-drifting' };
  }
  let ct;
  try { ct = cognitionTrajectory(); }
  catch (e) { return { triggered: false, reason: 'trajectory-unavailable', error: String(e), reflex: 'warn-if-cognition-drifting' }; }
  if (!ct || ct.n < o.cognitionMinN) {
    return { triggered: false, reason: 'insufficient-trajectory', n: ct ? ct.n : 0, reflex: 'warn-if-cognition-drifting' };
  }
  if (ct.variance == null || ct.variance < o.cognitionVarianceThreshold) {
    return { triggered: false, reason: 'cognition-tight', variance: ct.variance, reflex: 'warn-if-cognition-drifting' };
  }
  _lastWarnAt = now;
  return {
    triggered: true,
    reflex: 'warn-if-cognition-drifting',
    action: 'focus-warning',
    variance: ct.variance,
    mean: ct.mean,
    n: ct.n,
    shapeClass: ct.shapeClass,
    advisory: 'Cognition trajectory variance has risen above ' + o.cognitionVarianceThreshold + ' — the working agent may be losing focus or operating across multiple distinct modes.',
  };
}

/**
 * Reflex: when fieldDirection reports degrading, delegate to relaxIfHot.
 * The direction sensor (coherency side) triggers the entropy-side
 * existing reflex.
 */
async function relaxIfDegrading(opts = {}) {
  const o = { ...DEFAULTS, ...opts };
  const now = Date.now();
  if (now - _lastDegradeRelaxAt < o.degradeCooldownMs) {
    return { triggered: false, reason: 'cooldown', reflex: 'relax-if-degrading' };
  }
  let dir;
  try { dir = fieldDirection(o.degradeConsecutive); }
  catch (e) { return { triggered: false, reason: 'direction-unavailable', error: String(e), reflex: 'relax-if-degrading' }; }
  if (!dir || dir.verdict !== 'degrading') {
    return { triggered: false, reason: 'not-degrading', verdict: dir ? dir.verdict : null, reflex: 'relax-if-degrading' };
  }
  let relaxResult = null;
  try { relaxResult = await relaxIfHot(opts); }
  catch (e) { return { triggered: false, reason: 'relax-error', error: String(e), reflex: 'relax-if-degrading' }; }
  _lastDegradeRelaxAt = now;
  return {
    triggered: true,
    reflex: 'relax-if-degrading',
    action: 'delegated-to-relax-if-hot',
    direction: dir,
    relaxResult,
  };
}

/**
 * Fire every reflex once. Returns structured verdicts for each. The
 * orchestrator can call this from any loop (cron, hook, MCP action);
 * each reflex is independent and safe to skip.
 *
 * @param {object} [opts] threshold/cooldown overrides applied to all reflexes
 * @returns {Promise<{fired:object[], skipped:object[], all:object[]}>}
 */
async function fireReflexes(opts = {}) {
  const results = [
    tightenIfAdversarial(opts),
    restoreIfQuietened(opts),
    warnIfCognitionDrifting(opts),
    await relaxIfDegrading(opts),
  ];
  return {
    fired: results.filter(r => r && r.triggered),
    skipped: results.filter(r => r && !r.triggered),
    all: results,
  };
}

/** Test helper: clear all reflex cooldowns + restore default mode. */
function _resetReflexState() {
  _lastTightenAt = 0;
  _lastWarnAt = 0;
  _lastDegradeRelaxAt = 0;
  _lastRestoreAt = 0;
  setVarianceGateMode('default');
}

module.exports = {
  fireReflexes,
  tightenIfAdversarial,
  restoreIfQuietened,
  warnIfCognitionDrifting,
  relaxIfDegrading,
  _resetReflexState,
};
