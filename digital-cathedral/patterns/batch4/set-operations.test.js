const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('set operations', () => {
  it('should compute union', () => {
    assert.deepStrictEqual(union([1, 2, 3], [3, 4, 5]), [1, 2, 3, 4, 5]);
  });

  it('should compute intersection', () => {
    assert.deepStrictEqual(intersection([1, 2, 3, 4], [3, 4, 5, 6]), [3, 4]);
  });

  it('should compute difference', () => {
    assert.deepStrictEqual(difference([1, 2, 3, 4], [3, 4, 5]), [1, 2]);
  });

  it('should compute symmetric difference', () => {
    assert.deepStrictEqual(symmetricDifference([1, 2, 3], [3, 4, 5]), [1, 2, 4, 5]);
  });

  it('should handle empty arrays', () => {
    assert.deepStrictEqual(union([], [1, 2]), [1, 2]);
    assert.deepStrictEqual(intersection([], [1, 2]), []);
    assert.deepStrictEqual(difference([1, 2], []), [1, 2]);
    assert.deepStrictEqual(symmetricDifference([], []), []);
  });

  it('should deduplicate within input arrays', () => {
    assert.deepStrictEqual(union([1, 1, 2], [2, 3, 3]), [1, 2, 3]);
    assert.deepStrictEqual(intersection([1, 1, 2], [1, 2, 2]), [1, 2]);
  });
});
