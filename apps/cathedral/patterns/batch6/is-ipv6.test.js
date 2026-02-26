const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isIpv6', () => {
  it('should return true for valid full IPv6 addresses', () => {
    assert.strictEqual(isIpv6('2001:0db8:85a3:0000:0000:8a2e:0370:7334'), true);
    assert.strictEqual(isIpv6('fe80:0000:0000:0000:0000:0000:0000:0001'), true);
  });

  it('should return true for compressed IPv6 addresses', () => {
    assert.strictEqual(isIpv6('2001:db8::1'), true);
    assert.strictEqual(isIpv6('::1'), true);
    assert.strictEqual(isIpv6('::'), true);
    assert.strictEqual(isIpv6('fe80::1'), true);
  });

  it('should return false for multiple :: occurrences', () => {
    assert.strictEqual(isIpv6('2001::db8::1'), false);
  });

  it('should return false for invalid formats', () => {
    assert.strictEqual(isIpv6(''), false);
    assert.strictEqual(isIpv6('not-an-ipv6'), false);
    assert.strictEqual(isIpv6(null), false);
    assert.strictEqual(isIpv6('2001:db8:85a3:0000:0000:8a2e:0370'), false); // only 7 groups
  });
});
