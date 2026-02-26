const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// partial is available via isolated sandbox concatenation

describe('partial', () => {
  it('should partially apply the first argument', () => {
    const add = (a, b) => a + b;
    const add5 = partial(add, 5);
    assert.equal(add5(3), 8);
  });

  it('should partially apply multiple arguments', () => {
    const sum3 = (a, b, c) => a + b + c;
    const sum10And = partial(sum3, 4, 6);
    assert.equal(sum10And(5), 15);
  });

  it('should work with no partial arguments', () => {
    const add = (a, b) => a + b;
    const same = partial(add);
    assert.equal(same(2, 3), 5);
  });

  it('should work with all arguments pre-filled', () => {
    const add = (a, b) => a + b;
    const precomputed = partial(add, 10, 20);
    assert.equal(precomputed(), 30);
  });

  it('should pass extra arguments through', () => {
    const fn = (...args) => args;
    const p = partial(fn, 1, 2);
    assert.deepEqual(p(3, 4), [1, 2, 3, 4]);
  });
});
