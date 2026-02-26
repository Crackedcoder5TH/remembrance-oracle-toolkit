const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('maskString', () => {
  it('masks a credit card number with default settings', () => {
    assert.strictEqual(maskString('4111111111111111'), '************1111');
  });

  it('uses custom visible characters count', () => {
    assert.strictEqual(maskString('secret-password', 6), '*********ssword');
  });

  it('uses custom mask character', () => {
    assert.strictEqual(maskString('1234567890', 4, '#'), '######7890');
  });

  it('returns original string when shorter than visibleChars', () => {
    assert.strictEqual(maskString('abc', 4), 'abc');
  });

  it('handles empty string', () => {
    assert.strictEqual(maskString(''), '');
  });
});
