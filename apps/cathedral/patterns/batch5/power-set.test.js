const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('powerSet', () => {
  it('should return all subsets of [1,2,3]', () => {
    const result = powerSet([1, 2, 3]);
    assert.strictEqual(result.length, 8);
    assert.deepStrictEqual(result, [
      [], [1], [2], [1, 2], [3], [1, 3], [2, 3], [1, 2, 3]
    ]);
  });

  it('should return [[]] for an empty array', () => {
    assert.deepStrictEqual(powerSet([]), [[]]);
  });

  it('should return [[], [x]] for a single-element array', () => {
    assert.deepStrictEqual(powerSet([5]), [[], [5]]);
  });

  it('should return 4 subsets for a 2-element array', () => {
    const result = powerSet(['a', 'b']);
    assert.strictEqual(result.length, 4);
    assert.deepStrictEqual(result, [[], ['a'], ['b'], ['a', 'b']]);
  });

  it('should return 16 subsets for a 4-element array', () => {
    const result = powerSet([1, 2, 3, 4]);
    assert.strictEqual(result.length, 16);
  });
});
