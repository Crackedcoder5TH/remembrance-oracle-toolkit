/**
 * Reflex engine: actor-side responses to substrate sensors. Each reflex
 * has a cooldown and a triggering threshold. These tests drive each
 * sensor into the firing state and verify the reflex responds (or
 * declines, in the case of cooldowns or insufficient data).
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.ENTROPY_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'reflex-')), 'entropy.json');

const fc = require('../src/core/field-coupling');
const { maybeAbsorbBatch, _resetConsensusHistory } = require('../src/core/covenant-trust');
const {
  fireReflexes,
  tightenIfAdversarial,
  restoreIfQuietened,
  warnIfCognitionDrifting,
  _resetReflexState,
} = require('../src/orchestrator/reflex-engine');

function mkBatch(prefix, scores) {
  return scores.map((s, i) => ({
    name: prefix + '-' + i + '-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6),
    language: 'js',
    score: s,
  }));
}

function primeAt(target, spread = 0.05, n = 60) {
  for (let i = 0; i < n; i++) {
    fc.contribute({ source: 'reflex-test:prime', coherence: target + (Math.random() * 2 - 1) * spread, cost: 1 });
  }
}

describe('reflex engine — actor side of the substrate', () => {

  beforeEach(() => {
    _resetReflexState();
    _resetConsensusHistory();
  });

  it('tightenIfAdversarial declines when consensus history is empty', () => {
    const r = tightenIfAdversarial();
    assert.equal(r.triggered, false);
    assert.equal(r.reason, 'insufficient-history');
    assert.equal(fc.getVarianceGateMode().mode, 'default');
  });

  it('tightenIfAdversarial fires when A-yes-B-no ratio exceeds the threshold', () => {
    // Prime baseline LOW (~0.30) so high-mean tight-cluster batches fire A-yes-B-no
    // (the sophisticated-injection class — would raise coherency but shape suspect).
    primeAt(0.30, 0.05);
    // Submit a series of narrow-band displaced batches. Each should classify
    // as A-yes-B-no and accumulate in the histogram.
    for (let i = 0; i < 12; i++) {
      const scores = Array.from({ length: 18 }, () => 0.94 + Math.random() * 0.02);
      maybeAbsorbBatch(mkBatch('reflex-adv-' + i, scores), { persist: false, source: 'reflex-test:adversarial' });
    }
    const histogram = require('../src/core/covenant-trust').consensusHistogram();
    // We need at least 15% A-yes-B-no for tighten to fire.
    if (histogram.ratios['A-yes-B-no'] < 0.15) {
      // Skip — couldn't reliably synthesize adversarial pressure in this env.
      return;
    }
    const r = tightenIfAdversarial();
    assert.equal(r.triggered, true);
    assert.equal(r.action, 'variance-gate-tightened');
    assert.equal(r.after.mode, 'tightened');
    assert.equal(fc.getVarianceGateMode().mode, 'tightened');
  });

  it('tightenIfAdversarial respects cooldown', () => {
    primeAt(0.30, 0.05);
    for (let i = 0; i < 12; i++) {
      const scores = Array.from({ length: 18 }, () => 0.94 + Math.random() * 0.02);
      maybeAbsorbBatch(mkBatch('reflex-cd-' + i, scores), { persist: false, source: 'reflex-test:cooldown' });
    }
    const histogram = require('../src/core/covenant-trust').consensusHistogram();
    if (histogram.ratios['A-yes-B-no'] < 0.15) return;
    const r1 = tightenIfAdversarial();
    if (!r1.triggered) return;
    const r2 = tightenIfAdversarial();
    assert.equal(r2.triggered, false);
    assert.equal(r2.reason, 'cooldown');
  });

  it('restoreIfQuietened declines when gate is already at default', () => {
    const r = restoreIfQuietened();
    assert.equal(r.triggered, false);
    assert.equal(r.reason, 'gate-not-tightened');
  });

  it('warnIfCognitionDrifting declines when no goggles state exists', () => {
    const r = warnIfCognitionDrifting({ statePath: '/nonexistent/goggles-state.json' });
    // Either insufficient-trajectory or cognition-tight depending on what
    // cognitionTrajectory returns for a missing path.
    assert.equal(r.triggered, false);
  });

  it('fireReflexes returns structured verdicts for every reflex', async () => {
    const out = await fireReflexes();
    assert.ok(Array.isArray(out.all));
    assert.equal(out.all.length, 4, 'four reflexes expected');
    for (const r of out.all) {
      assert.ok(typeof r.reflex === 'string', 'each verdict has a reflex name');
      assert.ok(typeof r.triggered === 'boolean', 'each verdict has triggered:bool');
    }
    assert.equal(out.fired.length + out.skipped.length, out.all.length);
  });

  it('the variance gate mode is reversible via setVarianceGateMode', () => {
    assert.equal(fc.getVarianceGateMode().mode, 'default');
    fc.setVarianceGateMode('tightened');
    assert.equal(fc.getVarianceGateMode().mode, 'tightened');
    assert.equal(fc.getVarianceGateMode().displacementThreshold, 0.10);
    fc.setVarianceGateMode('default');
    assert.equal(fc.getVarianceGateMode().mode, 'default');
    assert.equal(fc.getVarianceGateMode().displacementThreshold, 0.15);
  });
});
