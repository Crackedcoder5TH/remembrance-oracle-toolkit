const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('permutations', () => {
  it('should return all permutations of a 3-element array', () => {
    const result = permutations([1, 2, 3]);
    assert.strictEqual(result.length, 6);
    assert.deepStrictEqual(result, [
      [1, 2, 3], [1, 3, 2],
      [2, 1, 3], [2, 3, 1],
      [3, 1, 2], [3, 2, 1]
    ]);
  });

  it('should return [[]] for an empty array', () => {
    assert.deepStrictEqual(permutations([]), [[]]);
  });

  it('should return [[x]] for a single-element array', () => {
    assert.deepStrictEqual(permutations([42]), [[42]]);
  });

  it('should return 2 permutations for a 2-element array', () => {
    const result = permutations(['a', 'b']);
    assert.strictEqual(result.length, 2);
    assert.deepStrictEqual(result, [['a', 'b'], ['b', 'a']]);
  });

  it('should return 24 permutations for a 4-element array', () => {
    const result = permutations([1, 2, 3, 4]);
    assert.strictEqual(result.length, 24);
  });
});
