const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('shuffle', () => {
  it('returns an array of the same length', () => {
    const input = [1, 2, 3, 4, 5];
    const result = shuffle(input);
    assert.equal(result.length, input.length);
  });

  it('does not mutate the original array', () => {
    const input = [1, 2, 3, 4, 5];
    const copy = input.slice();
    shuffle(input);
    assert.deepEqual(input, copy);
  });

  it('contains all original elements', () => {
    const input = [10, 20, 30, 40, 50];
    const result = shuffle(input);
    const sortedResult = result.slice().sort((a, b) => a - b);
    const sortedInput = input.slice().sort((a, b) => a - b);
    assert.deepEqual(sortedResult, sortedInput);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(shuffle([]), []);
  });

  it('returns single-element array unchanged', () => {
    assert.deepEqual(shuffle([42]), [42]);
  });
});
