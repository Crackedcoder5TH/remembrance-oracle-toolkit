const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('combinations', () => {
  it('should return all 2-combinations of [1,2,3]', () => {
    const result = combinations([1, 2, 3], 2);
    assert.deepStrictEqual(result, [[1, 2], [1, 3], [2, 3]]);
  });

  it('should return [[]] when k is 0', () => {
    assert.deepStrictEqual(combinations([1, 2, 3], 0), [[]]);
  });

  it('should return the full array when k equals array length', () => {
    assert.deepStrictEqual(combinations([1, 2, 3], 3), [[1, 2, 3]]);
  });

  it('should return [] when k > array length', () => {
    assert.deepStrictEqual(combinations([1, 2], 5), []);
  });

  it('should return correct count for C(5,3)', () => {
    const result = combinations([1, 2, 3, 4, 5], 3);
    assert.strictEqual(result.length, 10);
  });

  it('should return single-element combinations', () => {
    const result = combinations(['a', 'b', 'c'], 1);
    assert.deepStrictEqual(result, [['a'], ['b'], ['c']]);
  });
});
