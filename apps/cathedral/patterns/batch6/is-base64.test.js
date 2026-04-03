const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isBase64', () => {
  it('should return true for valid Base64 strings', () => {
    assert.strictEqual(isBase64('SGVsbG8gV29ybGQ='), true); // "Hello World"
    assert.strictEqual(isBase64('dGVzdA=='), true); // "test"
    assert.strictEqual(isBase64('YQ=='), true); // "a"
  });

  it('should return true for Base64 without padding', () => {
    assert.strictEqual(isBase64('SGVs'), true); // length divisible by 4
  });

  it('should return false for strings with invalid length', () => {
    assert.strictEqual(isBase64('abc'), false); // not multiple of 4
    assert.strictEqual(isBase64('a'), false);
  });

  it('should return false for strings with invalid characters', () => {
    assert.strictEqual(isBase64('SGVs!!!o'), false);
    assert.strictEqual(isBase64('has space'), false);
  });

  it('should return false for non-string and empty inputs', () => {
    assert.strictEqual(isBase64(''), false);
    assert.strictEqual(isBase64(null), false);
    assert.strictEqual(isBase64(undefined), false);
  });
});
