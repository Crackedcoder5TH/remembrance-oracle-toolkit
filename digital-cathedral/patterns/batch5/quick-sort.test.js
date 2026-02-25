const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('quickSort', () => {
  it('should sort an unsorted array', () => {
    assert.deepStrictEqual(quickSort([5, 3, 8, 1, 2]), [1, 2, 3, 5, 8]);
  });

  it('should return a new array (not mutate the original)', () => {
    const original = [3, 1, 2];
    const sorted = quickSort(original);
    assert.deepStrictEqual(sorted, [1, 2, 3]);
    assert.deepStrictEqual(original, [3, 1, 2]);
  });

  it('should handle an already sorted array', () => {
    assert.deepStrictEqual(quickSort([1, 2, 3, 4, 5]), [1, 2, 3, 4, 5]);
  });

  it('should handle an empty array', () => {
    assert.deepStrictEqual(quickSort([]), []);
  });

  it('should handle duplicates', () => {
    assert.deepStrictEqual(quickSort([4, 2, 4, 1, 2]), [1, 2, 2, 4, 4]);
  });

  it('should handle negative numbers', () => {
    assert.deepStrictEqual(quickSort([-5, 3, -1, 0, 2]), [-5, -1, 0, 2, 3]);
  });
});
