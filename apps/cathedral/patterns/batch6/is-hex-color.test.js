const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isHexColor', () => {
  it('should return true for valid 6-char hex colors', () => {
    assert.strictEqual(isHexColor('#FF5733'), true);
    assert.strictEqual(isHexColor('#000000'), true);
    assert.strictEqual(isHexColor('#ffffff'), true);
  });

  it('should return true for valid 3-char hex colors', () => {
    assert.strictEqual(isHexColor('#FFF'), true);
    assert.strictEqual(isHexColor('#abc'), true);
  });

  it('should return true for 8-char hex colors (with alpha)', () => {
    assert.strictEqual(isHexColor('#FF573380'), true);
  });

  it('should return true for 4-char hex colors (with alpha)', () => {
    assert.strictEqual(isHexColor('#F00A'), true);
  });

  it('should return false for invalid hex colors', () => {
    assert.strictEqual(isHexColor('FF5733'), false);   // missing #
    assert.strictEqual(isHexColor('#GGG'), false);      // invalid chars
    assert.strictEqual(isHexColor('#12345'), false);    // wrong length
    assert.strictEqual(isHexColor(''), false);
    assert.strictEqual(isHexColor(null), false);
  });
});
