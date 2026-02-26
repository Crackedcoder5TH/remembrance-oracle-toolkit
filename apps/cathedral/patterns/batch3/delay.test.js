const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// delay is available via isolated sandbox concatenation

describe('delay', () => {
  it('should return a promise', () => {
    const result = delay(10);
    assert.ok(result instanceof Promise);
  });

  it('should resolve after approximately the given time', async () => {
    const start = Date.now();
    await delay(50);
    const elapsed = Date.now() - start;
    assert.ok(elapsed >= 40, `Expected at least 40ms, got ${elapsed}ms`);
  });

  it('should resolve with undefined', async () => {
    const result = await delay(10);
    assert.equal(result, undefined);
  });

  it('should handle zero delay', async () => {
    const start = Date.now();
    await delay(0);
    const elapsed = Date.now() - start;
    assert.ok(elapsed < 50, 'Zero delay should resolve quickly');
  });
});
