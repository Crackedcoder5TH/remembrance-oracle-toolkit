'use strict';

/**
 * Tests for src/unified/emergent-coherency.js — the SERF equation
 * as a meta-function that emerges from pipeline signal aggregation.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  EmergentCoherency,
  getEmergentCoherency,
  geometricMean,
  registerAuditSignal,
  registerGroundSignal,
  registerPlanSignal,
  registerGateSignal,
  registerFeedbackSignal,
  registerTierCoverageSignal,
} = require('../src/unified/emergent-coherency');

describe('geometricMean', () => {
  it('returns 0 for empty array', () => {
    assert.equal(geometricMean([]), 0);
  });

  it('returns the single value for a 1-element array', () => {
    const result = geometricMean([0.8]);
    assert.ok(Math.abs(result - 0.8) < 0.001);
  });

  it('computes correct geometric mean for two values', () => {
    // geometric mean of 0.81 and 1.0 = sqrt(0.81) = 0.9
    const result = geometricMean([0.81, 1.0]);
    assert.ok(Math.abs(result - 0.9) < 0.001);
  });

  it('one zero-ish value pulls the mean toward the floor', () => {
    // With SIGNAL_FLOOR=0.01, a "zero" input becomes 0.01
    // gmean([0.9, 0.01]) = sqrt(0.009) ≈ 0.095
    const result = geometricMean([0.9, 0.0]);
    assert.ok(result < 0.15, `Expected low result for one zero input, got ${result}`);
  });

  it('all-perfect signals produce perfect score', () => {
    const result = geometricMean([1.0, 1.0, 1.0, 1.0]);
    assert.ok(Math.abs(result - 1.0) < 0.001);
  });
});

describe('EmergentCoherency', () => {
  let ec;
  beforeEach(() => { ec = new EmergentCoherency(); });

  it('returns 0 with no signals and no legacy', () => {
    assert.equal(ec.total, 0);
  });

  it('returns legacy score when no pipeline signals registered', () => {
    ec.registerLegacy({ total: 0.75, breakdown: { syntax: 0.8 } });
    assert.ok(Math.abs(ec.total - 0.75) < 0.001);
  });

  it('blends legacy + one pipeline signal via geometric mean', () => {
    ec.registerLegacy({ total: 0.81, breakdown: {} });
    ec.registerSignal('audit', 1.0);
    // gmean(0.81, 1.0) = sqrt(0.81) = 0.9
    assert.ok(Math.abs(ec.total - 0.9) < 0.01);
  });

  it('weakest signal dominates (SERF property)', () => {
    ec.registerSignal('audit', 0.95);
    ec.registerSignal('ground', 0.95);
    ec.registerSignal('plan', 0.95);
    ec.registerSignal('gate', 0.1);  // one bad dimension
    // gmean should be much lower than 0.95
    assert.ok(ec.total < 0.6, `Expected SERF to pull score down, got ${ec.total}`);
  });

  it('more signals dilute legacy score', () => {
    ec.registerLegacy({ total: 0.9, breakdown: {} });
    // No pipeline signals: total ≈ 0.9
    const legacyOnly = ec.total;

    ec.registerSignal('audit', 0.5);
    ec.registerSignal('ground', 0.5);
    // With two pipeline signals at 0.5, total should be pulled down from 0.9
    assert.ok(ec.total < legacyOnly, `Expected ${ec.total} < ${legacyOnly}`);
  });

  it('reset clears all signals and legacy', () => {
    ec.registerLegacy({ total: 0.8, breakdown: {} });
    ec.registerSignal('audit', 0.9);
    ec.reset();
    assert.equal(ec.total, 0);
    assert.equal(ec.signalCount, 0);
  });

  it('breakdown includes both legacy and pipeline dimensions', () => {
    ec.registerLegacy({ total: 0.8, breakdown: { syntaxValid: 0.9, testProof: 0.7 } });
    ec.registerSignal('audit', 0.85);
    ec.registerSignal('void', 0.6);
    const bd = ec.breakdown;
    assert.equal(bd.syntaxValid, 0.9);
    assert.equal(bd.testProof, 0.7);
    assert.equal(bd['pipeline.audit'], 0.85);
    assert.equal(bd['pipeline.void'], 0.6);
  });

  it('hasVoidSignal returns true only when void is registered', () => {
    assert.equal(ec.hasVoidSignal, false);
    ec.registerSignal('void', 0.7);
    assert.equal(ec.hasVoidSignal, true);
  });

  it('signalNames lists all registered pipeline signals', () => {
    ec.registerSignal('audit', 0.9);
    ec.registerSignal('ground', 0.8);
    ec.registerSignal('void', 0.7);
    const names = ec.signalNames;
    assert.ok(names.includes('audit'));
    assert.ok(names.includes('ground'));
    assert.ok(names.includes('void'));
    assert.equal(names.length, 3);
  });

  it('ignores non-finite signal values', () => {
    ec.registerSignal('good', 0.9);
    ec.registerSignal('bad', NaN);
    ec.registerSignal('worse', Infinity);
    assert.equal(ec.signalCount, 1);
  });

  it('clamps signals to 0-1 range', () => {
    ec.registerSignal('over', 1.5);
    ec.registerSignal('under', -0.3);
    const bd = ec.breakdown;
    assert.equal(bd['pipeline.over'], 1.0);
    assert.equal(bd['pipeline.under'], 0.0);
  });
});

describe('convenience signal helpers', () => {
  beforeEach(() => { getEmergentCoherency().reset(); });

  it('registerAuditSignal: 0 findings → 1.0, 10+ findings → 0.0', () => {
    registerAuditSignal(0);
    assert.equal(getEmergentCoherency().breakdown['pipeline.audit'], 1.0);
    getEmergentCoherency().reset();
    registerAuditSignal(10);
    assert.equal(getEmergentCoherency().breakdown['pipeline.audit'], 0.0);
  });

  it('registerGroundSignal: all grounded → 1.0', () => {
    registerGroundSignal(0, 10);
    assert.equal(getEmergentCoherency().breakdown['pipeline.ground'], 1.0);
  });

  it('registerGroundSignal: half ungrounded → 0.5', () => {
    registerGroundSignal(5, 10);
    assert.ok(Math.abs(getEmergentCoherency().breakdown['pipeline.ground'] - 0.5) < 0.01);
  });

  it('registerPlanSignal: all verified → 1.0', () => {
    registerPlanSignal(0, 8);
    assert.equal(getEmergentCoherency().breakdown['pipeline.plan'], 1.0);
  });

  it('registerGateSignal: no violations → 1.0', () => {
    registerGateSignal(0, 15);
    assert.equal(getEmergentCoherency().breakdown['pipeline.gate'], 1.0);
  });

  it('registerFeedbackSignal: direct pass-through', () => {
    registerFeedbackSignal(0.73);
    assert.ok(Math.abs(getEmergentCoherency().breakdown['pipeline.feedback'] - 0.73) < 0.01);
  });

  it('registerTierCoverageSignal: 3/3 tiers → 1.0', () => {
    registerTierCoverageSignal(3, 3);
    assert.ok(Math.abs(getEmergentCoherency().breakdown['pipeline.tier_coverage'] - 1.0) < 0.01);
  });

  it('registerTierCoverageSignal: 1/3 tiers → 0.33', () => {
    registerTierCoverageSignal(1, 3);
    assert.ok(Math.abs(getEmergentCoherency().breakdown['pipeline.tier_coverage'] - 0.333) < 0.01);
  });
});

describe('integration with computeCoherencyScore', () => {
  beforeEach(() => { getEmergentCoherency().reset(); });

  it('computeCoherencyScore still works with no pipeline signals (backwards compatible)', () => {
    const { computeCoherencyScore } = require('../src/unified/coherency');
    const result = computeCoherencyScore('function add(a, b) { return a + b; }', { language: 'javascript' });
    assert.ok(typeof result.total === 'number');
    assert.ok(result.total >= 0 && result.total <= 1);
    assert.ok(result.breakdown);
  });

  it('computeCoherencyScore resets stale signals between calls (no cross-contamination)', () => {
    const { computeCoherencyScore } = require('../src/unified/coherency');
    const ec = getEmergentCoherency();

    // Pre-register a signal, then call computeCoherencyScore.
    // The function should reset stale signals, so the pre-registered
    // signal should NOT affect the result.
    ec.reset();
    ec.registerSignal('ground', 0.1);
    const withStale = computeCoherencyScore('function add(a, b) { return a + b; }', { language: 'javascript' });

    ec.reset();
    const clean = computeCoherencyScore('function add(a, b) { return a + b; }', { language: 'javascript' });

    // Both should produce the same score since stale signals are cleared
    assert.equal(withStale.total, clean.total,
      'Stale pipeline signals should not affect computeCoherencyScore');
  });

  it('computeCoherencyScore with all-perfect signals stays high', () => {
    const { computeCoherencyScore } = require('../src/unified/coherency');
    const ec = getEmergentCoherency();
    ec.reset();
    ec.registerSignal('audit', 1.0);
    ec.registerSignal('ground', 1.0);
    ec.registerSignal('plan', 1.0);
    ec.registerSignal('gate', 1.0);
    const result = computeCoherencyScore('function add(a, b) { return a + b; }', { language: 'javascript' });
    assert.ok(result.total >= 0.5, `Expected high score with all-perfect signals, got ${result.total}`);
  });
});
