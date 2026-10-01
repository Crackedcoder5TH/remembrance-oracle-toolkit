'use strict';
// The JS and Python engines are entangled by the instrument's own sealed
// readings: the same fixture must land both on the same state, and the
// divergence judge must see any term that moves apart.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const E = require('../scripts/engine-entanglement-ratchet');

const VOID = process.env.VOID_DIR || path.join(__dirname, '..', '..', 'Void-Data-Compressor');
const hasVoid = fs.existsSync(path.join(VOID, 'living_remembrance.py'));

test('the fixture is built from real sealed readings and exercises every gate branch', () => {
  const readings = E.fixtureFromCoins();
  if (!readings.length) return;
  assert.ok(readings.every((r) => typeof r.coherence === 'number' && r.coherence >= 0 && r.coherence <= 1));
  assert.ok(readings.some((r) => r.seal && r.seal.sig), 'valid seals present');
  assert.ok(readings.some((r) => r.source === 'forged'), 'a forged seal is exercised');
  assert.ok(readings.some((r) => r.source === 'legacy'), 'an unsealed contribution is exercised');
  assert.ok(readings.some((r) => typeof r.void === 'number'), 'a measured void term is exercised');
});

test('the judge sees a divergent term, and none when the states agree', () => {
  const a = { coherence: 0.5, coherenceIntegral: 2, globalEntropy: 2, updateCount: 3, sources: { x: { count: 3, lastInput: 0.5, lastSealed: true } } };
  assert.deepEqual(E.diverge(a, JSON.parse(JSON.stringify(a))), []);
  const b = JSON.parse(JSON.stringify(a)); b.coherence += 1e-6; b.sources.x.lastSealed = false;
  const d = E.diverge(a, b);
  assert.equal(d.length, 2, d.join(' | '));
});

test('JS and Python agree to 1e-9 on the same sealed readings', { skip: !hasVoid && 'Void not on this host' }, () => {
  const readings = E.fixtureFromCoins();
  if (readings.length < 4) return;
  const js = E.driveJs(readings);
  const py = E.drivePy(readings);
  assert.deepEqual(E.diverge(js, py), []);
  assert.equal(js.updateCount, readings.length);
  assert.equal(js.sources.forged.lastSealed, false);
  assert.equal(js.sources.weighted.lastSealed, true);
});
