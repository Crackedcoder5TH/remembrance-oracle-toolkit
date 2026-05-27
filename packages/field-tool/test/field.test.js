'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { toWaveform, coherency, coherencyOf, Field, DIM } = require('../src/index');

test('toWaveform returns a 256-D vector in [0,1]', () => {
  const wf = toWaveform('hello world');
  assert.strictEqual(wf.length, DIM);
  for (const v of wf) assert.ok(v >= 0 && v <= 1);
});

test('empty input -> all zeros', () => {
  const wf = toWaveform('');
  assert.strictEqual(wf.length, DIM);
  assert.ok(wf.every((v) => v === 0));
});

test('coherency of identical inputs is 1', () => {
  assert.ok(Math.abs(coherencyOf('abc123', 'abc123') - 1) < 1e-12);
});

test('coherency is symmetric and in range', () => {
  const a = 'function add(a,b){return a+b}';
  const b = 'def add(a, b):\n    return a + b';
  const ab = coherencyOf(a, b), ba = coherencyOf(b, a);
  assert.ok(Math.abs(ab - ba) < 1e-12);
  assert.ok(ab >= -1 && ab <= 1);
});

test('coherency against the zero vector is 0', () => {
  assert.strictEqual(coherency(toWaveform('x'), new Float64Array(DIM)), 0);
});

test('Field.contribute requires a source and never throws', async () => {
  const field = new Field({ url: 'http://127.0.0.1:9' /* unused: no source */ });
  const bad = await field.contribute({ coherence: 0.9 });
  assert.strictEqual(bad.ok, false);
});

test('Field.contribute is best-effort against an unreachable field', async () => {
  const field = new Field({ url: 'http://127.0.0.1:1/mcp', timeoutMs: 300 });
  const res = await field.contribute({ coherence: 0.9, source: 'test:offline' });
  assert.strictEqual(res.ok, false); // unreachable -> error, but did not throw
});
