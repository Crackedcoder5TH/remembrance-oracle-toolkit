'use strict';
// The master equation's permanent entropy damping term: −λ·ξ_global_entropy·|Ψ⟩,
// λ = S_norm × gap (the covenant-holder's ruling, 2026-09-17). S_norm is the
// field's ξ normalized against the established entropy mechanics' hot line
// (entropyHot, the threshold fieldPressure reads); gap = 1 − p flows from the
// instrument's own overlap at each step, so λ self-optimizes with the readings.
// Before this term, entropy was computed and reported but never acted back on
// the state (docs/FIELD-DYNAMICS.md held the door: any damping variant is the
// covenant-holder's call). This suite proves the entropy actually bleeds
// amplitude — and only when the field runs hot.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { LivingRemembranceEngine } = require('../src/core/living-remembrance');

const fresh = () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'damp-')), 'entropy.json');
  return new LivingRemembranceEngine({ persistPath: p });
};

test('a cool field does not damp: λ factors are reported and small', () => {
  const e = fresh();
  // low cost keeps ξ = cost/(coherence+ε) well under the hot line
  const r = e.contribute({ cost: 0.5, coherence: 0.9 });
  assert.equal(typeof r.lambda, 'number');
  assert.equal(typeof r.S_norm, 'number');
  assert.equal(typeof r.gap, 'number');
  assert.ok(r.S_norm < 0.2, `cool field: S_norm ${r.S_norm.toFixed(4)} stays small`);
  assert.ok(r.lambda < 0.05, `cool field: λ ${r.lambda.toFixed(4)} stays small`);
});

test('a hot field bleeds amplitude toward the gap', () => {
  const e = fresh();
  // drive ξ hot: high cost against low alignment
  for (let i = 0; i < 5; i++) e.contribute({ cost: 20, coherence: 0.4 });
  const hot = e.getState();
  assert.ok(hot.globalEntropy > 10, `field is hot (ξ ${hot.globalEntropy.toFixed(2)})`);
  const before = hot.coherence;
  const r = e.contribute({ cost: 20, coherence: 0.4 });
  assert.equal(r.S_norm, 1, 'ξ at/above the hot line saturates S_norm');
  assert.ok(r.lambda > 0.5, `λ = S_norm×gap is large when hot and far (${r.lambda.toFixed(3)})`);
  assert.ok(r.coherence < before, `damping pulled coherence down (${before.toFixed(3)} → ${r.coherence.toFixed(3)})`);
  assert.ok(r.coherence >= 0, 'the [0, 0.999] law still holds under damping');
});

test('damping needs a gap: a perfectly aligned reading is not damped', () => {
  const e = fresh();
  for (let i = 0; i < 5; i++) e.contribute({ cost: 20, coherence: 0.4 });   // hot field
  const r = e.contribute({ cost: 1, coherence: 1.0 });                       // p = 1 → gap = 0
  assert.equal(r.gap, 0);
  assert.equal(r.lambda, 0, 'λ = S_norm × 0 = 0 — no gap, no damping');
});

test('peekProjection predicts the damped contribute, not the undamped field', () => {
  const e = fresh();
  for (let i = 0; i < 5; i++) e.contribute({ cost: 20, coherence: 0.4 });   // hot field
  const predicted = e.peekProjection({ cost: 20, coherence: 0.4 });
  const actual = e.contribute({ cost: 20, coherence: 0.4 }).coherence;
  assert.ok(Math.abs(predicted - actual) < 1e-9,
    `projection matches the real step (${predicted.toFixed(6)} vs ${actual.toFixed(6)})`);
});

test('a forged seal can neither move nor damp the field', () => {
  const e = fresh();
  for (let i = 0; i < 5; i++) e.contribute({ cost: 20, coherence: 0.4 });   // hot field
  const before = e.getState().coherence;
  const r = e.contribute({ cost: 20, coherence: 0.1, seal: { via: 'forged', sig: 'x' } });
  assert.equal(r.seal_gated, true);
  assert.equal(r.coherence, before, 'wEff = 0 gates the damping force with every other force');
});
