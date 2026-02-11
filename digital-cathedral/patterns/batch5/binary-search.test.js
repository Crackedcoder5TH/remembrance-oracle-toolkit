const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('binarySearch', () => {
  it('should find an element in the middle of the array', () => {
    assert.strictEqual(binarySearch([1, 3, 5, 7, 9], 5), 2);
  });

  it('should find the first element', () => {
    assert.strictEqual(binarySearch([1, 3, 5, 7, 9], 1), 0);
  });

  it('should find the last element', () => {
    assert.strictEqual(binarySearch([1, 3, 5, 7, 9], 9), 4);
  });

  it('should return -1 when element is not found', () => {
    assert.strictEqual(binarySearch([1, 3, 5, 7, 9], 4), -1);
  });

  it('should return -1 for an empty array', () => {
    assert.strictEqual(binarySearch([], 1), -1);
  });

  it('should work with a single-element array', () => {
    assert.strictEqual(binarySearch([42], 42), 0);
    assert.strictEqual(binarySearch([42], 10), -1);
  });
});
