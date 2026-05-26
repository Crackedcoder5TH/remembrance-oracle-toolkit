'use strict';

const test = require('node:test');
const assert = require('node:assert');
const { VoidClient, confirm } = require('../src/index');

test('VoidClient.coherence is best-effort against an unreachable Void', async () => {
  const v = new VoidClient({ url: 'http://127.0.0.1:1', timeoutMs: 300 });
  const res = await v.coherence('some text');
  assert.strictEqual(res.ok, false); // unreachable -> error object, never throws
});

test('submitPattern requires agent_id', async () => {
  const v = new VoidClient({ url: 'http://127.0.0.1:1', agentId: '', timeoutMs: 300 });
  const res = await v.submitPattern({ name: 'x', code: 'a'.repeat(40) });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /agent_id/);
});

test('submitPattern enforces a minimum code length', async () => {
  const v = new VoidClient({ url: 'http://127.0.0.1:1', agentId: 'tester', timeoutMs: 300 });
  const res = await v.submitPattern({ name: 'x', code: 'short' });
  assert.strictEqual(res.ok, false);
  assert.match(res.error, /20 characters/);
});

test('confirm honors --yes / --no without prompting', async () => {
  assert.strictEqual(await confirm('q', { force: true }), true);
  assert.strictEqual(await confirm('q', { force: false }), false);
});

test('confirm defaults to NO when non-interactive (privacy-safe)', async () => {
  // In the test runner stdin is not a TTY, so this resolves the default.
  assert.strictEqual(await confirm('q', { defaultValue: false }), false);
});
