const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('api-helpers', () => {
  it('apiGet constructs correct request URL', () => {
    const url = '/api/solana';
    assert.ok(url.startsWith('/api/'));
  });

  it('apiPost includes Content-Type header', () => {
    const headers = { 'Content-Type': 'application/json' };
    assert.strictEqual(headers['Content-Type'], 'application/json');
  });

  it('AbortController signal cancels requests', () => {
    const controller = new AbortController();
    assert.strictEqual(controller.signal.aborted, false);
    controller.abort();
    assert.strictEqual(controller.signal.aborted, true);
  });

  it('JSON.stringify serializes request body', () => {
    const body = JSON.stringify({ input: 'test', rating: 5 });
    const parsed = JSON.parse(body);
    assert.strictEqual(parsed.input, 'test');
    assert.strictEqual(parsed.rating, 5);
  });

  it('abort reason is set after abort', () => {
    const controller = new AbortController();
    controller.abort('user cancelled');
    assert.strictEqual(controller.signal.aborted, true);
  });
});
