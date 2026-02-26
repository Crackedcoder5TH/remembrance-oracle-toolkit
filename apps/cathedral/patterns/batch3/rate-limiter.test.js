const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// createRateLimiter is available via isolated sandbox concatenation

describe('createRateLimiter', () => {
  it('should allow calls within the limit', () => {
    const limiter = createRateLimiter(3, 1000);
    assert.equal(limiter.tryCall(), true);
    assert.equal(limiter.tryCall(), true);
    assert.equal(limiter.tryCall(), true);
  });

  it('should reject calls exceeding the limit', () => {
    const limiter = createRateLimiter(2, 1000);
    assert.equal(limiter.tryCall(), true);
    assert.equal(limiter.tryCall(), true);
    assert.equal(limiter.tryCall(), false);
  });

  it('should allow calls again after window expires', async () => {
    const limiter = createRateLimiter(1, 50);
    assert.equal(limiter.tryCall(), true);
    assert.equal(limiter.tryCall(), false);
    await new Promise((r) => setTimeout(r, 60));
    assert.equal(limiter.tryCall(), true);
  });

  it('should handle high maxCalls', () => {
    const limiter = createRateLimiter(100, 1000);
    for (let i = 0; i < 100; i++) {
      assert.equal(limiter.tryCall(), true);
    }
    assert.equal(limiter.tryCall(), false);
  });

  it('should track calls independently within the window', async () => {
    const limiter = createRateLimiter(2, 50);
    assert.equal(limiter.tryCall(), true);
    await new Promise((r) => setTimeout(r, 30));
    assert.equal(limiter.tryCall(), true);
    // Both calls still within window, so third should fail
    assert.equal(limiter.tryCall(), false);
  });
});
