'use strict';
// @oracle-infrastructure — synthetic rows exist only inside isolated tests.
/**
 * whitening-reference — the resonance space every decoder cosine is taken in.
 *
 * Structural tests run everywhere; the substrate-backed test runs only where
 * the store is on the host (it says so when it skips — never a fabricated
 * reference).
 */
const test = require('node:test');
const assert = require('node:assert');
const path = require('node:path');
const fs = require('node:fs');
const REF = require('../src/core/whitening-reference');
const { fitLayers, whitenComposed, LAYER_DIM } = REF;

function synthRows(n, width, seed = 7) {
  let s = seed; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
  const rows = [];
  for (let i = 0; i < n; i++) {
    const v = new Float64Array(width);
    const base = r();                       // a shared direction — the cone
    for (let k = 0; k < width; k++) v[k] = 0.8 * base + 0.2 * r() + (k % LAYER_DIM === 3 ? 0.5 : 0);
    rows.push(v);
  }
  return rows;
}

test('per-layer fit: one 29×29 transform per whole block; whitened blocks decorrelate', () => {
  const rows = synthRows(400, 3 * LAYER_DIM);
  const layers = fitLayers(rows, 3 * LAYER_DIM);
  assert.strictEqual(layers.length, 3);
  for (const l of layers) { assert.strictEqual(l.d, LAYER_DIM); assert.strictEqual(l.W.length, LAYER_DIM); }
  const ref = { layers, width: 3 * LAYER_DIM };
  // the cone: raw rows all point the same way; whitened they do not
  const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return d / Math.sqrt(na * nb); };
  let raw = 0, wh = 0, n = 0;
  for (let i = 0; i < 40; i++) for (let j = i + 1; j < 40; j++) { raw += cos(rows[i], rows[j]); wh += Math.abs(cos(whitenComposed(rows[i], ref), whitenComposed(rows[j], ref))); n++; }
  assert.ok(raw / n > 0.9, `raw cone should read ~1 (got ${(raw / n).toFixed(3)})`);
  assert.ok(wh / n < 0.5, `whitened pairs should spread out (got ${(wh / n).toFixed(3)})`);
});

test('an all-zero block is padding and stays zero; a partial trailing block stays raw', () => {
  const rows = synthRows(200, 2 * LAYER_DIM);
  const ref = { layers: fitLayers(rows, 2 * LAYER_DIM), width: 2 * LAYER_DIM };
  const padded = new Float64Array(2 * LAYER_DIM);
  for (let i = 0; i < LAYER_DIM; i++) padded[i] = rows[0][i];       // depth 1 real, block 2 padding
  const w = whitenComposed(padded, ref);
  for (let i = LAYER_DIM; i < 2 * LAYER_DIM; i++) assert.strictEqual(w[i], 0);
  assert.notStrictEqual(w[0], padded[0]);
  const partial = Float64Array.from(rows[0].subarray(0, LAYER_DIM + 5));
  const wp = whitenComposed(partial, ref);
  for (let i = LAYER_DIM; i < LAYER_DIM + 5; i++) assert.strictEqual(wp[i], partial[i]);
});

test('WHITENING_REFERENCE=off gives the raw cone back and says so', () => {
  REF._reset({ disabled: true });
  try {
    assert.strictEqual(REF.reference(), null);
    assert.strictEqual(REF.status().mode, 'raw');
    const v = Float64Array.from({ length: LAYER_DIM }, (_, i) => i / LAYER_DIM);
    assert.deepStrictEqual(Array.from(whitenComposed(v)), Array.from(v));
  } finally { REF._reset({ disabled: false }); }
});

test('the live reference (when the store is on this host) is canonical-width and raises the participation ratio', (t) => {
  const { STORE } = require('../src/core/store-export');
  if (!fs.existsSync(STORE)) { t.skip('pattern store not on this host — no reference to check'); return; }
  const st = REF.status();
  assert.strictEqual(st.mode, 'whitened');
  assert.strictEqual(st.width % LAYER_DIM, 0);
  assert.notStrictEqual(st.width, 256);
  assert.strictEqual(st.layers, st.width / LAYER_DIM);
  assert.ok(st.fitted.store > 40000, `fitted on the store (${st.fitted.store} rows)`);
  if (st.pr) assert.ok(st.pr.whitened > st.pr.raw * 4, `whitening should raise the effective dimensionality (raw ${st.pr.raw}, whitened ${st.pr.whitened})`);
  assert.ok(fs.existsSync(REF.CACHE_PATH));
  assert.strictEqual(path.basename(REF.CACHE_PATH), 'whitening-reference.json');
});
