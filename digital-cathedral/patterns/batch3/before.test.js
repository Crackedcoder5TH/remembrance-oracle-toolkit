const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// before is available via oracle sandbox concatenation

describe('before', () => {
  it('should invoke fn for the first n calls', () => {
    let count = 0;
    const fn = before(3, () => ++count);
    fn();
    fn();
    fn();
    assert.equal(count, 3);
  });

  it('should not invoke fn after n calls', () => {
    let count = 0;
    const fn = before(2, () => ++count);
    fn();
    fn();
    fn();
    fn();
    assert.equal(count, 2);
  });

  it('should return the last result after n calls', () => {
    const fn = before(2, (x) => x * 2);
    assert.equal(fn(3), 6);
    assert.equal(fn(5), 10);
    assert.equal(fn(99), 10); // returns last result
  });

  it('should pass arguments to fn', () => {
    const fn = before(1, (a, b) => a + b);
    assert.equal(fn(3, 4), 7);
  });

  it('should work with n=0 (never invokes)', () => {
    let count = 0;
    const fn = before(0, () => ++count);
    fn();
    fn();
    assert.equal(count, 0);
  });
});
