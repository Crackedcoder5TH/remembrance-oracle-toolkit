'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const {
  codeToWaveform, TARGET_LEN,
  byteCodeToWaveform, BYTE_TARGET_LEN,
} = require('../src/core/code-to-waveform');

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

// ─── Legacy byte-stretch (still exposed for binary / non-text inputs) ────
// The byte-stretch encoder is what Void's to_waveform.py implements
// (contracts C-49/C-50). Its degenerate-case behavior and cross-language
// parity are still pinned by these tests against `byteCodeToWaveform`.

test('byteCodeToWaveform: output length is always 256', () => {
  for (const input of ['', 'a', 'def f(): pass', '🌌']) {
    const wf = byteCodeToWaveform(input);
    assert.strictEqual(wf.length, BYTE_TARGET_LEN);
  }
});

test('byteCodeToWaveform: single char → all 0.5 (degenerate)', () => {
  const wf = byteCodeToWaveform('a');
  for (let i = 0; i < BYTE_TARGET_LEN; i++) assert.strictEqual(wf[i], 0.5);
});

test('byteCodeToWaveform: constant input → all 0.5 (degenerate)', () => {
  const wf = byteCodeToWaveform('A'.repeat(31));
  for (let i = 0; i < BYTE_TARGET_LEN; i++) assert.strictEqual(wf[i], 0.5);
});

test('byteCodeToWaveform: cross-language byte-identical to Python reference', () => {
  for (const c of FIXTURE.cases) {
    const wf = byteCodeToWaveform(c.input);
    for (let i = 0; i < 5; i++) {
      assert.ok(
        Math.abs(wf[i] - c.first_5[i]) < FIXTURE._tolerance,
        `first_5[${i}] mismatch for ${JSON.stringify(c.input.slice(0, 30))}: js=${wf[i]} py=${c.first_5[i]}`,
      );
    }
    for (let i = 0; i < 5; i++) {
      const wfIdx = BYTE_TARGET_LEN - 5 + i;
      assert.ok(
        Math.abs(wf[wfIdx] - c.last_5[i]) < FIXTURE._tolerance,
        `last_5[${i}] mismatch for ${JSON.stringify(c.input.slice(0, 30))}: js=${wf[wfIdx]} py=${c.last_5[i]}`,
      );
    }
  }
});
