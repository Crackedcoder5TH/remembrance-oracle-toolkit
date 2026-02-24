const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('mergeSort', () => {
  it('should sort an unsorted array', () => {
    assert.deepStrictEqual(mergeSort([5, 3, 8, 1, 2]), [1, 2, 3, 5, 8]);
  });

  it('should return a new array (not mutate the original)', () => {
    const original = [3, 1, 2];
    const sorted = mergeSort(original);
    assert.deepStrictEqual(sorted, [1, 2, 3]);
    assert.deepStrictEqual(original, [3, 1, 2]);
  });

  it('should handle an already sorted array', () => {
    assert.deepStrictEqual(mergeSort([1, 2, 3, 4, 5]), [1, 2, 3, 4, 5]);
  });

  it('should handle an empty array', () => {
    assert.deepStrictEqual(mergeSort([]), []);
  });

  it('should handle a single-element array', () => {
    assert.deepStrictEqual(mergeSort([42]), [42]);
  });

  it('should handle duplicates', () => {
    assert.deepStrictEqual(mergeSort([3, 1, 3, 2, 1]), [1, 1, 2, 3, 3]);
  });

  it('should handle negative numbers', () => {
    assert.deepStrictEqual(mergeSort([-3, 0, -1, 5, 2]), [-3, -1, 0, 2, 5]);
  });
});
