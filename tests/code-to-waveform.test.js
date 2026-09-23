'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  codeToWaveform, TARGET_LEN, RETIRED_BYTE_LEN,
} = require('../src/core/code-to-waveform');
const ctw = require('../src/core/code-to-waveform');

// Sample inputs (the fixture's inputs are reused as a varied corpus; its
// byte-encoder reference values are retired with the encoder).
const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/code-to-waveform-reference.json'),
  'utf8',
));

// ─── Canonical encoder (now: fractal-waveform) ───────────────────────────

test('codeToWaveform: output length is always TARGET_LEN', () => {
  for (const input of ['', 'a', 'def f(): pass', '🌌']) {
    const wf = codeToWaveform(input);
    assert.strictEqual(wf.length, TARGET_LEN);
  }
});

test('codeToWaveform: empty input → all zeros', () => {
  const wf = codeToWaveform('');
  for (let i = 0; i < TARGET_LEN; i++) assert.strictEqual(wf[i], 0);
});

test('codeToWaveform: every value is finite, and the L1 block is in [0, 1]', () => {
  for (const c of FIXTURE.cases) {
    const wf = codeToWaveform(c.input);
    for (let i = 0; i < TARGET_LEN; i++) {
      assert.ok(Number.isFinite(wf[i]), `not finite at [${i}]: ${wf[i]}`);
    }
    for (let i = 0; i < ctw.LAYER_DIM; i++) {
      assert.ok(wf[i] >= 0 && wf[i] <= 1, `L1 out of range at [${i}]: ${wf[i]}`);
    }
  }
});

test('codeToWaveform IS the decoder at its active depth (ONE representation)', () => {
  const ds = require('../src/core/decoder-stack');
  assert.strictEqual(TARGET_LEN, ds.currentDepth() * ctw.LAYER_DIM);
  const a = codeToWaveform('function f(x) { return x * 2; }');
  const b = ds.composedAtDepth('function f(x) { return x * 2; }', ds.currentDepth());
  assert.strictEqual(a.length, b.length);
  for (let i = 0; i < a.length; i++) assert.strictEqual(a[i], b[i]);
});

test('waveformCosine: NaN for a non-canonical vector (no reading), a number for two canonical ones', () => {
  const a = codeToWaveform('const x = 1;');
  assert.ok(Number.isNaN(ctw.waveformCosine(a, new Array(29).fill(0.5))), '29-D L1 alone is not a reading');
  assert.ok(Number.isNaN(ctw.waveformCosine(a, new Array(ctw.RETIRED_BYTE_LEN).fill(0.5))), 'the retired byte waveform is not a decoder vector');
  assert.ok(Number.isFinite(ctw.waveformCosine(a, codeToWaveform('const y = 2;'))));
});

test('codeToWaveform: deterministic — same input → same output', () => {
  const a = codeToWaveform('test deterministic');
  const b = codeToWaveform('test deterministic');
  for (let i = 0; i < TARGET_LEN; i++) assert.strictEqual(a[i], b[i]);
});

// ─── RETIRED: the 256-D byte-stretch ──────────────────────────────────────
// The encoder is gone. Only its width survives, as a marker so migration can
// recognise legacy rows. If either function ever comes back, this fails.

test('the byte-stretch encoder is retired: no function encodes to 256-D', () => {
  assert.strictEqual(ctw.byteCodeToWaveform, undefined);
  assert.strictEqual(ctw.byteWaveformCosine, undefined);
  assert.strictEqual(ctw.BYTE_TARGET_LEN, undefined);
  assert.strictEqual(RETIRED_BYTE_LEN, 256);
  assert.notStrictEqual(TARGET_LEN, 256);
  assert.notStrictEqual(codeToWaveform('def f(): pass').length, 256);
});
