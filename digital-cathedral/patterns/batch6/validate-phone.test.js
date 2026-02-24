const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isPhoneNumber', () => {
  it('should return true for valid international phone numbers', () => {
    assert.strictEqual(isPhoneNumber('+1234567890'), true);
    assert.strictEqual(isPhoneNumber('+44 20 7946 0958'), true);
    assert.strictEqual(isPhoneNumber('+1 (555) 123-4567'), true);
  });

  it('should return true for numbers without country code', () => {
    assert.strictEqual(isPhoneNumber('5551234567'), true);
    assert.strictEqual(isPhoneNumber('555-123-4567'), true);
  });

  it('should return false for too short numbers', () => {
    assert.strictEqual(isPhoneNumber('12345'), false);
    assert.strictEqual(isPhoneNumber('+123'), false);
  });

  it('should return false for too long numbers', () => {
    assert.strictEqual(isPhoneNumber('1234567890123456'), false);
  });

  it('should return false for invalid inputs', () => {
    assert.strictEqual(isPhoneNumber(''), false);
    assert.strictEqual(isPhoneNumber('not-a-phone'), false);
    assert.strictEqual(isPhoneNumber(null), false);
  });
});
