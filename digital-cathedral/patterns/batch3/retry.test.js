const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// retry is available via isolated sandbox concatenation

describe('retry', () => {
  it('should resolve on first attempt if fn succeeds', async () => {
    const result = await retry(() => Promise.resolve(42));
    assert.equal(result, 42);
  });

  it('should retry and eventually succeed', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      if (attempts < 3) return Promise.reject(new Error('fail'));
      return Promise.resolve('ok');
    };
    const result = await retry(fn, 3, 10);
    assert.equal(result, 'ok');
    assert.equal(attempts, 3);
  });

  it('should reject after maxAttempts failures', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      return Promise.reject(new Error('always fails'));
    };
    await assert.rejects(() => retry(fn, 2, 10), { message: 'always fails' });
    assert.equal(attempts, 2);
  });

  it('should default to 3 attempts', async () => {
    let attempts = 0;
    const fn = () => {
      attempts++;
      return Promise.reject(new Error('fail'));
    };
    await assert.rejects(() => retry(fn), { message: 'fail' });
    assert.equal(attempts, 3);
  });

  it('should work with synchronous functions that return values', async () => {
    const result = await retry(() => 'sync-ok');
    assert.equal(result, 'sync-ok');
  });
});
