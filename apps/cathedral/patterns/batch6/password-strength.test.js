const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('passwordStrength', () => {
  it('should return score 0 for very weak passwords', () => {
    const result = passwordStrength('abc');
    assert.strictEqual(result.score, 0);
    assert.ok(result.feedback.length > 0);
  });

  it('should return low score for short passwords', () => {
    const result = passwordStrength('abcdef');
    assert.ok(result.score <= 2);
  });

  it('should return high score for strong passwords', () => {
    const result = passwordStrength('MyStr0ng!Pass#2024');
    assert.ok(result.score >= 3);
  });

  it('should penalize common patterns', () => {
    const result = passwordStrength('password123');
    assert.ok(result.feedback.some(f => f.includes('common')));
  });

  it('should provide feedback for missing character types', () => {
    const result = passwordStrength('alllowercase');
    assert.ok(result.feedback.some(f => f.includes('uppercase') || f.includes('numbers') || f.includes('special')));
  });

  it('should handle non-string input', () => {
    const result = passwordStrength(null);
    assert.strictEqual(result.score, 0);
  });
});
