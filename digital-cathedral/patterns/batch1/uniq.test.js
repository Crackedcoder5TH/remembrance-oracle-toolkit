// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('uniq', () => {
  it('removes duplicate numbers', () => {
    assert.deepEqual(uniq([1, 2, 2, 3, 3, 3]), [1, 2, 3]);
  });

  it('removes duplicate strings', () => {
    assert.deepEqual(uniq(['a', 'b', 'a', 'c']), ['a', 'b', 'c']);
  });

  it('preserves order of first occurrence', () => {
    assert.deepEqual(uniq([3, 1, 2, 1, 3]), [3, 1, 2]);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(uniq([]), []);
  });

  it('returns same array when all elements are unique', () => {
    assert.deepEqual(uniq([1, 2, 3]), [1, 2, 3]);
  });
});
