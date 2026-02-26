const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// curry is available via isolated sandbox concatenation

describe('curry', () => {
  it('should curry a two-argument function', () => {
    const add = curry((a, b) => a + b);
    assert.equal(add(1)(2), 3);
  });

  it('should allow passing all arguments at once', () => {
    const add = curry((a, b) => a + b);
    assert.equal(add(1, 2), 3);
  });

  it('should curry a three-argument function', () => {
    const sum3 = curry((a, b, c) => a + b + c);
    assert.equal(sum3(1)(2)(3), 6);
    assert.equal(sum3(1, 2)(3), 6);
    assert.equal(sum3(1)(2, 3), 6);
    assert.equal(sum3(1, 2, 3), 6);
  });

  it('should handle zero-argument functions', () => {
    const fn = curry(() => 42);
    assert.equal(fn(), 42);
  });

  it('should return a function when partially applied', () => {
    const add = curry((a, b) => a + b);
    const add10 = add(10);
    assert.equal(typeof add10, 'function');
    assert.equal(add10(5), 15);
    assert.equal(add10(20), 30);
  });
});
