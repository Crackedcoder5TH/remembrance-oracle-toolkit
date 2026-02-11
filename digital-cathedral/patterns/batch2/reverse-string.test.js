const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('reverseString', () => {
  it('reverses a simple string', () => {
    assert.strictEqual(reverseString('hello'), 'olleh');
  });

  it('reverses a palindrome to itself', () => {
    assert.strictEqual(reverseString('racecar'), 'racecar');
  });

  it('handles empty string', () => {
    assert.strictEqual(reverseString(''), '');
  });

  it('handles single character', () => {
    assert.strictEqual(reverseString('a'), 'a');
  });

  it('returns empty string for non-string input', () => {
    assert.strictEqual(reverseString(123), '');
  });
});
