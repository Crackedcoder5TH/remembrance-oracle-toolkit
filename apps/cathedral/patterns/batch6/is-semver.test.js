const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isSemver', () => {
  it('should return true for valid semver strings', () => {
    assert.strictEqual(isSemver('1.0.0'), true);
    assert.strictEqual(isSemver('0.1.0'), true);
    assert.strictEqual(isSemver('12.34.56'), true);
  });

  it('should return true for semver with pre-release', () => {
    assert.strictEqual(isSemver('1.0.0-alpha'), true);
    assert.strictEqual(isSemver('1.0.0-alpha.1'), true);
    assert.strictEqual(isSemver('1.0.0-0.3.7'), true);
  });

  it('should return true for semver with build metadata', () => {
    assert.strictEqual(isSemver('1.0.0+build.123'), true);
    assert.strictEqual(isSemver('1.0.0-alpha+001'), true);
  });

  it('should return false for invalid semver strings', () => {
    assert.strictEqual(isSemver('1.0'), false);
    assert.strictEqual(isSemver('1'), false);
    assert.strictEqual(isSemver('v1.0.0'), false);
    assert.strictEqual(isSemver('01.0.0'), false); // leading zero
    assert.strictEqual(isSemver('1.0.0.0'), false);
  });

  it('should return false for non-string inputs', () => {
    assert.strictEqual(isSemver(null), false);
    assert.strictEqual(isSemver(undefined), false);
    assert.strictEqual(isSemver(100), false);
  });
});
