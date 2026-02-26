const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('countOccurrences', () => {
  it('counts multiple occurrences', () => {
    assert.strictEqual(countOccurrences('banana', 'an'), 2);
  });

  it('returns 0 when substring is not found', () => {
    assert.strictEqual(countOccurrences('hello', 'xyz'), 0);
  });

  it('returns 0 for empty substring', () => {
    assert.strictEqual(countOccurrences('hello', ''), 0);
  });

  it('counts single character occurrences', () => {
    assert.strictEqual(countOccurrences('mississippi', 's'), 4);
  });

  it('handles non-overlapping counting', () => {
    assert.strictEqual(countOccurrences('aaa', 'aa'), 1);
  });
});
