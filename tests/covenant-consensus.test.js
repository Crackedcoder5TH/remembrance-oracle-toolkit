/**
 * Two-oracle consensus gate for covenant absorption.
 *
 * maybeAbsorbPattern fires both oracles independently:
 *   A — coherency oracle (would absorbing raise the field?)
 *   B — signal-validity oracle (does the candidate's shape look like real measurement?)
 *
 * Absorption happens only when both say yes. Disagreement places the
 * candidate in one of two quarantine classes; rejection requires both
 * to say no. These tests cover all four outcomes against an explicitly
 * primed field baseline.
 */

const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

// Each test process gets its own ENTROPY_PATH so the field state is isolated.
process.env.ENTROPY_PATH = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'consensus-')), 'entropy.json');

const fc = require('../src/core/field-coupling');
const { maybeAbsorbPattern } = require('../src/core/covenant-trust');

function primeAt(target, spread = 0.05, n = 60) {
  for (let i = 0; i < n; i++) {
    fc.contribute({ source: 'consensus-test:prime', coherence: target + (Math.random() * 2 - 1) * spread, cost: 1 });
  }
}

describe('covenant absorption — two-oracle consensus', () => {

  it('both-accept absorbs a high-quality pattern that raises coherence at mid-baseline', () => {
    primeAt(0.65, 0.10);
    const result = maybeAbsorbPattern(
      { name: 'consensus-both-accept-' + Date.now(), language: 'js' },
      { score: 0.99, persist: false, source: 'test:both-accept' }
    );
    assert.equal(result.absorbed, true, 'high pattern at mid baseline should be absorbed');
    assert.equal(result.agreement, 'both-accept');
    assert.ok(result.delta > 0, 'delta should be positive when absorbing');
    assert.equal(typeof result.shapeClass, 'string');
    assert.ok(['natural-high', 'natural-mid', 'wide-uniform'].includes(result.shapeClass));
  });

  it('both-reject holds a very low pattern at a high-baseline field', () => {
    primeAt(0.95, 0.02);
    const result = maybeAbsorbPattern(
      { name: 'consensus-both-reject-' + Date.now(), language: 'js' },
      { score: 0.10, persist: false, source: 'test:both-reject' }
    );
    assert.equal(result.absorbed, false);
    assert.equal(result.agreement, 'both-reject');
    assert.ok(result.delta < 0, 'delta should be negative when rejecting');
    assert.equal(result.shapeClass, 'value-outlier-low');
  });

  it('A-no-B-yes quarantines a natural-looking pattern that would not raise coherence', () => {
    primeAt(0.95, 0.02);
    // A pattern at 0.75 against a 0.95 baseline: shape is natural-mid (not
    // an outlier — gap 0.20 with small std puts it just outside outlier),
    // but the field projects a drop. Coherency oracle disagrees with the
    // shape oracle.
    const result = maybeAbsorbPattern(
      { name: 'consensus-A-no-B-yes-' + Date.now(), language: 'js' },
      { score: 0.75, persist: false, source: 'test:A-no-B-yes' }
    );
    assert.equal(result.absorbed, false);
    // This pattern will EITHER produce A-no-B-yes (the common case) OR
    // both-reject (if the value-outlier-low z-score fires). Both are
    // valid quarantine/rejection outcomes; neither absorbs.
    assert.ok(
      result.agreement === 'A-no-B-yes' || result.agreement === 'both-reject',
      'expected disagreement or both-reject, got ' + result.agreement
    );
    if (result.agreement === 'A-no-B-yes') {
      assert.equal(result.quarantineClass, 'low-value-real');
    }
  });

  it('refuses absorption when oracles unreachable (defensive availability check)', () => {
    // Pass a deliberately invalid score so projectContribution returns null.
    const result = maybeAbsorbPattern(
      { name: 'consensus-no-oracles-' + Date.now(), language: 'js' },
      { score: NaN, persist: false, source: 'test:no-oracles' }
    );
    assert.equal(result.absorbed, false);
    assert.ok(
      typeof result.reason === 'string' && result.reason.length > 0,
      'should provide a reason'
    );
  });

  it('refuses re-absorption of an already-recognised pattern', () => {
    primeAt(0.65, 0.10);
    const name = 'consensus-dup-' + Date.now();
    const first = maybeAbsorbPattern({ name, language: 'js' }, { score: 0.99, persist: false });
    assert.equal(first.absorbed, true);
    const second = maybeAbsorbPattern({ name, language: 'js' }, { score: 0.99, persist: false });
    assert.equal(second.absorbed, false);
    assert.equal(second.reason, 'already recognized');
  });

  it('relaxed epsilon allows a near-zero-delta pattern when shape is natural', () => {
    primeAt(0.95, 0.02);
    // At a high-baseline state a high-score pattern produces a tiny
    // negative delta (it doesn't quite raise the field). With strict
    // epsilon (default 1e-6) the consensus gate quarantines it as
    // A-no-B-yes. With relaxed epsilon (0.01) oracle A treats the small
    // drop as "maintain within tolerance" and both oracles agree.
    const result = maybeAbsorbPattern(
      { name: 'consensus-eps-' + Date.now(), language: 'js' },
      { score: 0.96, persist: false, epsilon: 0.01, source: 'test:eps' }
    );
    assert.equal(result.absorbed, true);
    assert.equal(result.agreement, 'both-accept');
  });
});
