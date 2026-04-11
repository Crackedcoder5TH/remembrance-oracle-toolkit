const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('insertionSort', () => {
  it('should sort an unsorted array', () => {
    assert.deepStrictEqual(insertionSort([5, 3, 8, 1, 2]), [1, 2, 3, 5, 8]);
  });

  it('should return a new array (not mutate the original)', () => {
    const original = [3, 1, 2];
    const sorted = insertionSort(original);
    assert.deepStrictEqual(sorted, [1, 2, 3]);
    assert.deepStrictEqual(original, [3, 1, 2]);
  });

  it('should handle an already sorted array', () => {
    assert.deepStrictEqual(insertionSort([1, 2, 3, 4, 5]), [1, 2, 3, 4, 5]);
  });

  it('should handle an empty array', () => {
    assert.deepStrictEqual(insertionSort([]), []);
  });

  it('should handle duplicates', () => {
    assert.deepStrictEqual(insertionSort([2, 3, 2, 1, 3]), [1, 2, 2, 3, 3]);
  });
});
