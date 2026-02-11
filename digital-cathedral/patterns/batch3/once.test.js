const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// once is available via oracle sandbox concatenation

describe('once', () => {
  it('should call the function only once', () => {
    let count = 0;
    const fn = once(() => ++count);
    fn();
    fn();
    fn();
    assert.equal(count, 1);
  });

  it('should return the first call result on subsequent calls', () => {
    const fn = once((x) => x * 2);
    assert.equal(fn(5), 10);
    assert.equal(fn(100), 10);
  });

  it('should pass arguments to the first call', () => {
    const fn = once((a, b) => a + b);
    assert.equal(fn(3, 4), 7);
  });

  it('should handle functions that return undefined', () => {
    let count = 0;
    const fn = once(() => { count++; });
    fn();
    fn();
    assert.equal(count, 1);
    assert.equal(fn(), undefined);
  });

  it('should handle functions that return falsy values', () => {
    const fn = once(() => 0);
    assert.equal(fn(), 0);
    assert.equal(fn(), 0);
  });
});
