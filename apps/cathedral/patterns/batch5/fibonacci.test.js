const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('fibonacci', () => {
  it('should return 0 for n=0', () => {
    assert.strictEqual(fibonacci(0), 0);
  });

  it('should return 1 for n=1', () => {
    assert.strictEqual(fibonacci(1), 1);
  });

  it('should return 1 for n=2', () => {
    assert.strictEqual(fibonacci(2), 1);
  });

  it('should return correct values for larger n', () => {
    assert.strictEqual(fibonacci(10), 55);
    assert.strictEqual(fibonacci(20), 6765);
  });

  it('should throw for negative input', () => {
    assert.throws(() => fibonacci(-1), { message: 'Input must be a non-negative integer' });
  });

  it('should handle the first several Fibonacci numbers', () => {
    const expected = [0, 1, 1, 2, 3, 5, 8, 13, 21, 34];
    for (let i = 0; i < expected.length; i++) {
      assert.strictEqual(fibonacci(i), expected[i]);
    }
  });
});
