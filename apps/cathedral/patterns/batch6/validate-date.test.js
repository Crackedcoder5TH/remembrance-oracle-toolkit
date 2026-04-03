const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isValidDate', () => {
  it('should return true for valid dates', () => {
    assert.strictEqual(isValidDate(2024, 1, 15), true);
    assert.strictEqual(isValidDate(2024, 12, 31), true);
    assert.strictEqual(isValidDate(2024, 6, 30), true);
  });

  it('should handle leap years correctly', () => {
    assert.strictEqual(isValidDate(2024, 2, 29), true);  // leap year
    assert.strictEqual(isValidDate(2023, 2, 29), false);  // not leap year
    assert.strictEqual(isValidDate(2000, 2, 29), true);   // century leap year
    assert.strictEqual(isValidDate(1900, 2, 29), false);  // century non-leap
  });

  it('should return false for invalid months', () => {
    assert.strictEqual(isValidDate(2024, 0, 1), false);
    assert.strictEqual(isValidDate(2024, 13, 1), false);
  });

  it('should return false for invalid days', () => {
    assert.strictEqual(isValidDate(2024, 1, 32), false);
    assert.strictEqual(isValidDate(2024, 4, 31), false);  // April has 30 days
    assert.strictEqual(isValidDate(2024, 1, 0), false);
  });

  it('should return false for non-integer inputs', () => {
    assert.strictEqual(isValidDate(2024.5, 1, 1), false);
    assert.strictEqual(isValidDate('2024', '1', '1'), false);
    assert.strictEqual(isValidDate(null, null, null), false);
  });
});
