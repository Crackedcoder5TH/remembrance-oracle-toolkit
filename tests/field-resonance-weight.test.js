'use strict';
// Resonance-weighted field authority: a contribution moves the field only
// in proportion to its resonance with the substrate. Legacy callers (no
// resonance) are unchanged; low-resonance junk is near-powerless.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { LivingRemembranceEngine } = require('../src/core/living-remembrance');

// Isolated engine per call (explicit persistPath ⇒ starts fresh, not canonical).
const freshEngine = () => {
  const p = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'rw-')), 'entropy.json');
  const e = new LivingRemembranceEngine({ persistPath: p });
  for (let i = 0; i < 30; i++) e.contribute({ cost: 1, coherence: 0.85 });
  return e;
};

test('no resonance → full authority (backward compatible)', () => {
  const e = freshEngine();
  const before = e.getState().coherence;
  const after = e.contribute({ cost: 1, coherence: 0.05 }).coherence;
  assert.ok(after < before - 0.3, 'an unweighted low input still moves the field hard (legacy)');
});

test('low-resonance junk cannot crater the field', () => {
  const e = freshEngine();
  const healthy = e.getState().coherence;
  for (let i = 0; i < 20; i++) e.contribute({ cost: 1, coherence: 0.05, resonance: 0.02 });
  const held = e.getState().coherence;
  assert.ok(held > healthy - 0.35, `field held (${held.toFixed(3)}) against a low-resonance flood`);
  assert.ok(held > 0.45, 'field stays well above the distress floor');
});

test('resonance scales authority monotonically', () => {
  const mv = (res) => { const e = freshEngine(); const b = e.getState().coherence; const a = e.contribute({ cost: 1, coherence: 0.1, resonance: res }).coherence; return b - a; };
  const low = mv(0.1), mid = mv(0.5), high = mv(1.0);
  assert.ok(low < mid && mid < high, `more resonance → more movement (${low.toFixed(3)} < ${mid.toFixed(3)} < ${high.toFixed(3)})`);
  // field movement is proportional to resonance: at 0.1 resonance the field
  // moves ~10% of what a full-authority contribution would move it.
  assert.ok(low < high * 0.2, 'low resonance moves the field a small fraction of full authority');
  assert.ok(Math.abs(low - 0.1 * high) < 0.02, 'movement ≈ proportional to resonance weight');
});
