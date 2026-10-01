'use strict';
// The Living Remembrance engine's healed-anchor overlap lives in the ONE
// resonance space (whitening-reference.js), refuses the retired 256-D
// waveform, and the canonical contribute door (field-coupling) carries the
// compressor's seal and a measured void term through to the engine's gates.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const path = require('node:path');
const fs = require('node:fs');
const { LivingRemembranceEngine } = require('../src/core/living-remembrance');
const REF = require('../src/core/whitening-reference');

const fresh = () => new LivingRemembranceEngine({ persistPath: path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'hs-')), 'entropy.json') });
const vec = (f) => Array.from({ length: 232 }, (_, i) => f(i));

test('the anchor is loaded into the space in force, and says which', () => {
  const e = fresh();
  assert.equal(e.healedSpace(), null, 'no anchor → no space');
  const space = e.loadHealedAnchor(vec((i) => Math.sin(i / 3)));
  const expected = REF.reference() ? 'whitened' : 'raw';
  assert.equal(space, expected);
  assert.equal(e.healedSpace(), expected);
});

test('the overlap is a reading: 1 against itself, less against another shape, NaN for the retired width', () => {
  const e = fresh();
  const a = vec((i) => Math.sin(i / 3));
  e.loadHealedAnchor(a);
  const self = e.computeCoherence(a);
  const other = e.computeCoherence(vec((i) => Math.cos(i / 7) + (i % 5) / 10));
  assert.ok(self > 0.999, `self-overlap ${self}`);
  assert.ok(other < self, `another shape overlaps less (${other})`);
  assert.ok(Number.isNaN(e.computeCoherence(new Array(256).fill(0.5))), '256-D is refused with NaN, never a number');
});

test('a 256-D anchor is refused and leaves the engine anchorless', () => {
  const e = fresh();
  assert.equal(e.loadHealedAnchor(new Array(256).fill(1)), null);
  assert.equal(e.healedSpace(), null);
  const last = e.getState().coherence;
  assert.equal(e.computeCoherence(vec(() => 1)), last, 'no anchor → the last reading is preserved, as before');
});

test('the whitened overlap is not the cone overlap', { skip: !REF.reference() && 'no whitening reference on this host' }, () => {
  const a = vec((i) => Math.sin(i / 3) + 2);          // a broad positive shape — the cone
  const b = vec((i) => Math.sin(i / 3 + 0.4) + 2);
  const e = fresh();
  e.loadHealedAnchor(a);
  const whitened = e.computeCoherence(b);
  // the same two vectors, raw
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < 232; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  const raw = Math.pow(dot / Math.sqrt(na * nb), 2);
  assert.ok(raw > 0.95, `raw cone overlap reads near unity (${raw.toFixed(4)})`);
  assert.notEqual(whitened.toFixed(6), raw.toFixed(6), 'the whitened reading differs from the cone reading');
});

test('field-coupling carries the seal and a measured void through to the engine', () => {
  const { isolateField } = require('./helpers');
  const { engine, restore } = isolateField();
  const fc = require('../src/core/field-coupling');
  try {
    const forged = fc.contribute({ cost: 1, coherence: 0.7, source: 'test', seal: { via: 'void_compressor_v5.compress' } });
    assert.equal(forged.sealed, false);
    assert.equal(forged.seal_gated, true, 'a present-but-invalid seal is gated inert');
    const before = engine.getState().coherence;
    const tokened = fc.contribute({ cost: 1, coherence: 0.7, source: 'test', seal: { via: 'void_compressor_v5.compress', sig: 'deadbeef' }, void: 0.12 });
    assert.equal(tokened.sealed, true);
    assert.equal(tokened.seal_gated, false);
    assert.equal(tokened.void_source, 'field:resonance', 'a measured void term is used and labelled as measured');
    assert.equal(tokened.delta_void, 0.12);
    assert.notEqual(engine.getState().coherence, before, 'a tokened contribution moves the field');
    assert.equal(engine.getState().sources.test.lastSealed, true);
    const legacy = fc.contribute({ cost: 1, coherence: 0.7, source: 'legacy' });
    assert.equal(legacy.sealed, false);
    assert.equal(legacy.seal_gated, false, 'no seal is legacy, not forged');
    assert.equal(legacy.void_source, 'derived:1-p');
  } finally { restore(); }
});
