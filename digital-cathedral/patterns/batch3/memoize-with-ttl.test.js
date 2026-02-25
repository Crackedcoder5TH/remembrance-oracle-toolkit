const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// memoizeWithTTL is available via oracle sandbox concatenation

describe('memoizeWithTTL', () => {
  it('should cache results', () => {
    let callCount = 0;
    const fn = memoizeWithTTL((x) => { callCount++; return x * 2; }, 1000);
    assert.equal(fn(5), 10);
    assert.equal(fn(5), 10);
    assert.equal(callCount, 1);
  });

  it('should differentiate by arguments', () => {
    let callCount = 0;
    const fn = memoizeWithTTL((x) => { callCount++; return x * 2; }, 1000);
    assert.equal(fn(5), 10);
    assert.equal(fn(10), 20);
    assert.equal(callCount, 2);
  });

  it('should expire cache after ttl', async () => {
    let callCount = 0;
    const fn = memoizeWithTTL((x) => { callCount++; return x * 2; }, 50);
    assert.equal(fn(5), 10);
    assert.equal(callCount, 1);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(fn(5), 10);
    assert.equal(callCount, 2);
  });

  it('should handle multiple arguments', () => {
    const fn = memoizeWithTTL((a, b) => a + b, 1000);
    assert.equal(fn(3, 4), 7);
    assert.equal(fn(3, 4), 7);
    assert.equal(fn(1, 2), 3);
  });

  it('should return fresh values after expiry', async () => {
    let counter = 0;
    const fn = memoizeWithTTL(() => ++counter, 30);
    assert.equal(fn(), 1);
    assert.equal(fn(), 1);
    await new Promise((r) => setTimeout(r, 40));
    assert.equal(fn(), 2);
  });
});
