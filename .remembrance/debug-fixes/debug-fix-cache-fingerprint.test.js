// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; writes are tmpdir/fixture state
const { describe, it } = require('node:test');
const assert = require('node:assert');
const { computeCacheFingerprint } = require('/tmp/debug-fix-cache-fingerprint.js');

describe('cache fingerprint', () => {
  it('produces consistent fingerprint', () => {
    const patterns = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const fp1 = computeCacheFingerprint(patterns);
    const fp2 = computeCacheFingerprint(patterns);
    assert.strictEqual(fp1, fp2);
  });

  it('detects replacement with same count', () => {
    const original = [{ id: 'a' }, { id: 'b' }, { id: 'c' }];
    const replaced = [{ id: 'x' }, { id: 'y' }, { id: 'z' }];
    assert.notStrictEqual(
      computeCacheFingerprint(original),
      computeCacheFingerprint(replaced)
    );
  });

  it('handles empty array', () => {
    assert.strictEqual(computeCacheFingerprint([]), '0:::');
  });

  it('handles single element', () => {
    const fp = computeCacheFingerprint([{ id: 'solo' }]);
    assert.ok(fp.includes('solo'));
  });
});
