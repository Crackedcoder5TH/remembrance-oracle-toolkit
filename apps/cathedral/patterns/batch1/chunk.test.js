const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('chunk', () => {
  it('chunks an array into pairs', () => {
    assert.deepEqual(chunk([1, 2, 3, 4], 2), [[1, 2], [3, 4]]);
  });

  it('handles a remainder chunk', () => {
    assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  });

  it('returns whole array as single chunk when size >= length', () => {
    assert.deepEqual(chunk([1, 2, 3], 5), [[1, 2, 3]]);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(chunk([], 3), []);
  });

  it('throws for invalid size', () => {
    assert.throws(() => chunk([1, 2], 0), RangeError);
    assert.throws(() => chunk([1, 2], -1), RangeError);
  });
});
