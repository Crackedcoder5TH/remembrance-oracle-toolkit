const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isIpv4', () => {
  it('should return true for valid IPv4 addresses', () => {
    assert.strictEqual(isIpv4('192.168.1.1'), true);
    assert.strictEqual(isIpv4('0.0.0.0'), true);
    assert.strictEqual(isIpv4('255.255.255.255'), true);
    assert.strictEqual(isIpv4('127.0.0.1'), true);
  });

  it('should return false for octets out of range', () => {
    assert.strictEqual(isIpv4('256.0.0.1'), false);
    assert.strictEqual(isIpv4('192.168.1.999'), false);
  });

  it('should return false for leading zeros', () => {
    assert.strictEqual(isIpv4('192.168.01.1'), false);
    assert.strictEqual(isIpv4('01.01.01.01'), false);
  });

  it('should return false for wrong format', () => {
    assert.strictEqual(isIpv4('192.168.1'), false);
    assert.strictEqual(isIpv4('192.168.1.1.1'), false);
    assert.strictEqual(isIpv4(''), false);
    assert.strictEqual(isIpv4(null), false);
  });
});
