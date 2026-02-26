const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// timeoutPromise is available via isolated sandbox concatenation

describe('timeoutPromise', () => {
  it('should resolve if promise settles before timeout', async () => {
    const fast = new Promise((resolve) => setTimeout(() => resolve('done'), 10));
    const result = await timeoutPromise(fast, 500);
    assert.equal(result, 'done');
  });

  it('should reject if promise takes longer than timeout', async () => {
    const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 5000));
    await assert.rejects(() => timeoutPromise(slow, 50), {
      message: 'Timed out after 50ms'
    });
  });

  it('should propagate the original rejection', async () => {
    const failing = Promise.reject(new Error('original error'));
    await assert.rejects(() => timeoutPromise(failing, 500), {
      message: 'original error'
    });
  });

  it('should resolve immediately with already-resolved promise', async () => {
    const result = await timeoutPromise(Promise.resolve(99), 100);
    assert.equal(result, 99);
  });

  it('should handle non-promise values', async () => {
    const result = await timeoutPromise(Promise.resolve('hello'), 100);
    assert.equal(result, 'hello');
  });
});
