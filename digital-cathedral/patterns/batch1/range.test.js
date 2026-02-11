const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('range', () => {
  it('generates a range with default step of 1', () => {
    assert.deepEqual(range(0, 5), [0, 1, 2, 3, 4]);
  });

  it('generates a range with a custom step', () => {
    assert.deepEqual(range(0, 10, 2), [0, 2, 4, 6, 8]);
  });

  it('returns empty array when start equals end', () => {
    assert.deepEqual(range(5, 5), []);
  });

  it('generates a descending range with negative step', () => {
    assert.deepEqual(range(5, 0, -1), [5, 4, 3, 2, 1]);
  });

  it('auto-selects negative step when start > end and no step given', () => {
    assert.deepEqual(range(3, 0), [3, 2, 1]);
  });

  it('throws when step is zero', () => {
    assert.throws(() => range(0, 5, 0), RangeError);
  });
});
