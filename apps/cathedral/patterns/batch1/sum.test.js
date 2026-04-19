const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('sum', () => {
  it('sums positive numbers', () => {
    assert.equal(sum([1, 2, 3, 4]), 10);
  });

  it('sums negative numbers', () => {
    assert.equal(sum([-1, -2, -3]), -6);
  });

  it('sums mixed positive and negative numbers', () => {
    assert.equal(sum([10, -5, 3, -2]), 6);
  });

  it('returns 0 for empty array', () => {
    assert.equal(sum([]), 0);
  });

  it('handles a single element', () => {
    assert.equal(sum([42]), 42);
  });
});
