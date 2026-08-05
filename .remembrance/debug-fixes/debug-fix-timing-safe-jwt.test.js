// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { timingSafeCompare } = require('/tmp/debug-fix-timing-safe-jwt.js');

describe('timing-safe JWT comparison', () => {
  it('returns true for matching strings', () => {
    assert.strictEqual(timingSafeCompare('abc123', 'abc123'), true);
  });

  it('returns false for mismatched strings', () => {
    assert.strictEqual(timingSafeCompare('abc123', 'abc124'), false);
  });

  it('returns false for different length strings', () => {
    assert.strictEqual(timingSafeCompare('short', 'longer_string'), false);
  });
});
