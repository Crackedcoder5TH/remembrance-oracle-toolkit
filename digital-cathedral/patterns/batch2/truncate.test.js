const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('truncate', () => {
  it('truncates a long string with default suffix', () => {
    assert.strictEqual(truncate('Hello, World!', 8), 'Hello...');
  });

  it('returns the original string when within maxLen', () => {
    assert.strictEqual(truncate('Hi', 10), 'Hi');
  });

  it('uses a custom suffix', () => {
    assert.strictEqual(truncate('abcdefghij', 7, '~~'), 'abcde~~');
  });

  it('handles empty string', () => {
    assert.strictEqual(truncate('', 5), '');
  });

  it('handles maxLen shorter than suffix', () => {
    assert.strictEqual(truncate('Hello, World!', 2, '...'), '..');
  });
});
