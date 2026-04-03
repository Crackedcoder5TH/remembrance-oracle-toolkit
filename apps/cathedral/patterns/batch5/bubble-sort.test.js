const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('bubbleSort', () => {
  it('should sort an unsorted array', () => {
    assert.deepStrictEqual(bubbleSort([5, 3, 8, 1, 2]), [1, 2, 3, 5, 8]);
  });

  it('should return a new array (not mutate the original)', () => {
    const original = [3, 1, 2];
    const sorted = bubbleSort(original);
    assert.deepStrictEqual(sorted, [1, 2, 3]);
    assert.deepStrictEqual(original, [3, 1, 2]);
  });

  it('should handle an already sorted array', () => {
    assert.deepStrictEqual(bubbleSort([1, 2, 3, 4, 5]), [1, 2, 3, 4, 5]);
  });

  it('should handle an empty array', () => {
    assert.deepStrictEqual(bubbleSort([]), []);
  });

  it('should handle negative numbers', () => {
    assert.deepStrictEqual(bubbleSort([-2, 5, -8, 3, 0]), [-8, -2, 0, 3, 5]);
  });
});
