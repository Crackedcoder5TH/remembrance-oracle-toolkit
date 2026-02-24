const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isCreditCard', () => {
  it('should return true for valid Visa card numbers', () => {
    assert.strictEqual(isCreditCard('4539578763621486'), true);
  });

  it('should return true for valid MasterCard numbers', () => {
    assert.strictEqual(isCreditCard('5425233430109903'), true);
  });

  it('should handle spaces and dashes', () => {
    assert.strictEqual(isCreditCard('4539 5787 6362 1486'), true);
    assert.strictEqual(isCreditCard('4539-5787-6362-1486'), true);
  });

  it('should return false for numbers failing Luhn check', () => {
    assert.strictEqual(isCreditCard('1234567890123456'), false);
    assert.strictEqual(isCreditCard('0000000000000001'), false);
  });

  it('should return false for invalid inputs', () => {
    assert.strictEqual(isCreditCard(''), false);
    assert.strictEqual(isCreditCard('abcdefghijklmnop'), false);
    assert.strictEqual(isCreditCard('123'), false);
    assert.strictEqual(isCreditCard(null), false);
  });
});
