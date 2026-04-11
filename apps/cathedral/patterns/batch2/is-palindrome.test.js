const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isPalindrome', () => {
  it('returns true for a simple palindrome', () => {
    assert.strictEqual(isPalindrome('racecar'), true);
  });

  it('returns true for a palindrome with mixed case', () => {
    assert.strictEqual(isPalindrome('RaceCar'), true);
  });

  it('returns true for a phrase palindrome ignoring spaces and punctuation', () => {
    assert.strictEqual(isPalindrome('A man, a plan, a canal: Panama'), true);
  });

  it('returns false for a non-palindrome', () => {
    assert.strictEqual(isPalindrome('hello'), false);
  });

  it('returns false for non-string input', () => {
    assert.strictEqual(isPalindrome(null), false);
  });
});
