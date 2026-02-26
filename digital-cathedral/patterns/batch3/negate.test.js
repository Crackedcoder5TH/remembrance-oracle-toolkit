const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// negate is available via isolated sandbox concatenation

describe('negate', () => {
  it('should negate a truthy predicate', () => {
    const isEven = (n) => n % 2 === 0;
    const isOdd = negate(isEven);
    assert.equal(isOdd(3), true);
    assert.equal(isOdd(4), false);
  });

  it('should negate a falsy predicate', () => {
    const isEmpty = (arr) => arr.length === 0;
    const isNotEmpty = negate(isEmpty);
    assert.equal(isNotEmpty([]), false);
    assert.equal(isNotEmpty([1]), true);
  });

  it('should pass all arguments to the predicate', () => {
    const gt = (a, b) => a > b;
    const lte = negate(gt);
    assert.equal(lte(3, 5), true);
    assert.equal(lte(5, 3), false);
  });

  it('should work with Array.filter', () => {
    const isEven = (n) => n % 2 === 0;
    const odds = [1, 2, 3, 4, 5].filter(negate(isEven));
    assert.deepEqual(odds, [1, 3, 5]);
  });

  it('should handle predicates returning truthy/falsy (not just booleans)', () => {
    const identity = (x) => x;
    const isFalsy = negate(identity);
    assert.equal(isFalsy(0), true);
    assert.equal(isFalsy(''), true);
    assert.equal(isFalsy('hello'), false);
  });
});
