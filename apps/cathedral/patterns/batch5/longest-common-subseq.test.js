const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('lcs', () => {
  it('should find the longest common subsequence', () => {
    // 'ABCBDAB' and 'BDCAB' have LCS length 4 (e.g. BDAB or BCAB)
    const result = lcs('ABCBDAB', 'BDCAB');
    assert.strictEqual(result.length, 4);
  });

  it('should return empty string when no common subsequence', () => {
    assert.strictEqual(lcs('ABC', 'XYZ'), '');
  });

  it('should return empty string when one string is empty', () => {
    assert.strictEqual(lcs('', 'ABC'), '');
    assert.strictEqual(lcs('ABC', ''), '');
  });

  it('should return the full string when both are identical', () => {
    assert.strictEqual(lcs('HELLO', 'HELLO'), 'HELLO');
  });

  it('should handle single character matches', () => {
    assert.strictEqual(lcs('A', 'A'), 'A');
    assert.strictEqual(lcs('A', 'B'), '');
  });

  it('should handle classic ABCDEF / AEBDF example', () => {
    assert.strictEqual(lcs('ABCDEF', 'AEBDF'), 'ABDF');
  });
});
