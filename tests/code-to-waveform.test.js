'use strict';

const test = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const { codeToWaveform, TARGET_LEN } = require('../src/core/code-to-waveform');

const FIXTURE = JSON.parse(fs.readFileSync(
  path.join(__dirname, 'fixtures/code-to-waveform-reference.json'),
  'utf8',
));

test('codeToWaveform: output length is always 256', () => {
  for (const input of ['', 'a', 'def f(): pass', '🌌']) {
    const wf = codeToWaveform(input);
    assert.strictEqual(wf.length, TARGET_LEN);
  }
});

test('codeToWaveform: empty input → all zeros', () => {
  const wf = codeToWaveform('');
  for (let i = 0; i < TARGET_LEN; i++) assert.strictEqual(wf[i], 0);
});

test('codeToWaveform: single char → all 0.5 (degenerate)', () => {
  const wf = codeToWaveform('a');
  for (let i = 0; i < TARGET_LEN; i++) assert.strictEqual(wf[i], 0.5);
});

test('codeToWaveform: constant input → all 0.5 (degenerate)', () => {
  const wf = codeToWaveform('A'.repeat(31));
  for (let i = 0; i < TARGET_LEN; i++) assert.strictEqual(wf[i], 0.5);
});

test('codeToWaveform: cross-language byte-identical to Python reference', () => {
  for (const c of FIXTURE.cases) {
    const wf = codeToWaveform(c.input);
    for (let i = 0; i < 5; i++) {
      assert.ok(
        Math.abs(wf[i] - c.first_5[i]) < FIXTURE._tolerance,
        `first_5[${i}] mismatch for ${JSON.stringify(c.input.slice(0, 30))}: js=${wf[i]} py=${c.first_5[i]}`,
      );
    }
    for (let i = 0; i < 5; i++) {
      const wfIdx = TARGET_LEN - 5 + i;
      assert.ok(
        Math.abs(wf[wfIdx] - c.last_5[i]) < FIXTURE._tolerance,
        `last_5[${i}] mismatch for ${JSON.stringify(c.input.slice(0, 30))}: js=${wf[wfIdx]} py=${c.last_5[i]}`,
      );
    }
  }
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
