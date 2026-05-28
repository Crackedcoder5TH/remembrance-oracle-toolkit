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

test('offline queue: queue() persists and sync() retains when unreachable, flushes nothing extra', async () => {
  const fs = require('node:fs');
  const os = require('node:os');
  const path = require('node:path');
  const qp = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'field-q-')), 'queue.jsonl');
  const field = new Field({ url: 'http://127.0.0.1:1/mcp', timeoutMs: 200, queuePath: qp });

  // queue requires a source and a queue path
  assert.strictEqual(field.queue({ coherence: 0.5 }).ok, false);

  // queue two observations offline (no network)
  assert.strictEqual(field.queue({ coherence: 0.8, source: 'q:a' }).queued, true);
  assert.strictEqual(field.queue({ coherence: 0.6, source: 'q:b' }).queued, true);
  assert.strictEqual(fs.readFileSync(qp, 'utf8').trim().split('\n').length, 2);

  // contribute auto-queues on failure when a queue is configured
  const c = await field.contribute({ coherence: 0.7, source: 'q:c' });
  assert.strictEqual(c.ok, false);
  assert.strictEqual(c.queued, true);
  assert.strictEqual(fs.readFileSync(qp, 'utf8').trim().split('\n').length, 3);

  // sync against an unreachable field keeps everything queued (best-effort)
  const r = await field.sync();
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.synced, 0);
  assert.strictEqual(r.remaining, 3);
});

test('Field.sync returns an error when no queue path is configured', async () => {
  const field = new Field({ url: 'http://127.0.0.1:1/mcp', timeoutMs: 200 });
  const r = await field.sync();
  assert.strictEqual(r.ok, false);
});
