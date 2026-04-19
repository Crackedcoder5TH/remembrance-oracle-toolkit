const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('median', () => {
  it('returns the middle value for odd-length array', () => {
    assert.equal(median([3, 1, 2]), 2);
  });

  it('returns the average of two middle values for even-length array', () => {
    assert.equal(median([4, 1, 3, 2]), 2.5);
  });

  it('returns the single element for single-element array', () => {
    assert.equal(median([5]), 5);
  });

  it('returns NaN for empty array', () => {
    assert.equal(Number.isNaN(median([])), true);
  });

  it('does not mutate the original array', () => {
    const input = [3, 1, 2];
    median(input);
    assert.deepEqual(input, [3, 1, 2]);
  });
});
