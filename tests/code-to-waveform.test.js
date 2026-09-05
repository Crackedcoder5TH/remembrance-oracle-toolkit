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

test('codeToWaveform: all values in [0, 1]', () => {
  for (const c of FIXTURE.cases) {
    const wf = codeToWaveform(c.input);
    for (let i = 0; i < TARGET_LEN; i++) {
      assert.ok(wf[i] >= 0 && wf[i] <= 1, `out of range at [${i}]: ${wf[i]}`);
    }
  }
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
