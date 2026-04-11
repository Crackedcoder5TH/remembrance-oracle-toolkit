const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('zip', () => {
  it('zips two equal-length arrays', () => {
    assert.deepEqual(zip([1, 2, 3], ['a', 'b', 'c']), [[1, 'a'], [2, 'b'], [3, 'c']]);
  });

  it('truncates to the shorter array', () => {
    assert.deepEqual(zip([1, 2], ['a', 'b', 'c']), [[1, 'a'], [2, 'b']]);
  });

  it('returns empty array when one input is empty', () => {
    assert.deepEqual(zip([], [1, 2, 3]), []);
  });

  it('returns empty array when both inputs are empty', () => {
    assert.deepEqual(zip([], []), []);
  });

  it('handles mixed types', () => {
    assert.deepEqual(zip([true, false], [1, 0]), [[true, 1], [false, 0]]);
  });
});
