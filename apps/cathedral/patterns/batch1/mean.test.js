const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('mean', () => {
  it('calculates the mean of positive numbers', () => {
    assert.equal(mean([2, 4, 6]), 4);
  });

  it('calculates the mean of mixed numbers', () => {
    assert.equal(mean([10, -10, 20]), 20 / 3);
  });

  it('returns the value itself for a single element', () => {
    assert.equal(mean([7]), 7);
  });

  it('returns NaN for empty array', () => {
    assert.equal(Number.isNaN(mean([])), true);
  });

  it('handles decimal results', () => {
    assert.equal(mean([1, 2]), 1.5);
  });
});
