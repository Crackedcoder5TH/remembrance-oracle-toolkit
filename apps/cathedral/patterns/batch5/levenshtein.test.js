const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('levenshtein', () => {
  it('should return 0 for identical strings', () => {
    assert.strictEqual(levenshtein('hello', 'hello'), 0);
  });

  it('should return the length of the other string when one is empty', () => {
    assert.strictEqual(levenshtein('', 'hello'), 5);
    assert.strictEqual(levenshtein('hello', ''), 5);
  });

  it('should return 0 for two empty strings', () => {
    assert.strictEqual(levenshtein('', ''), 0);
  });

  it('should calculate distance for single-character difference', () => {
    assert.strictEqual(levenshtein('cat', 'car'), 1);
  });

  it('should calculate distance for kitten/sitting', () => {
    assert.strictEqual(levenshtein('kitten', 'sitting'), 3);
  });

  it('should calculate distance for completely different strings', () => {
    assert.strictEqual(levenshtein('abc', 'xyz'), 3);
  });
});
