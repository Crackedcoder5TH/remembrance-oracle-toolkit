const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('isUrl', () => {
  it('should return true for valid http URLs', () => {
    assert.strictEqual(isUrl('http://example.com'), true);
    assert.strictEqual(isUrl('https://example.com'), true);
    assert.strictEqual(isUrl('https://www.example.com/path?q=1#hash'), true);
  });

  it('should return true for URLs with ports and paths', () => {
    assert.strictEqual(isUrl('http://localhost:3000'), true);
    assert.strictEqual(isUrl('https://example.com:8080/api/v1'), true);
  });

  it('should return true for ftp URLs', () => {
    assert.strictEqual(isUrl('ftp://files.example.com/readme.txt'), true);
  });

  it('should return false for invalid URLs', () => {
    assert.strictEqual(isUrl(''), false);
    assert.strictEqual(isUrl('not a url'), false);
    assert.strictEqual(isUrl('example.com'), false);
    assert.strictEqual(isUrl('://missing.protocol'), false);
  });

  it('should return false for non-string inputs', () => {
    assert.strictEqual(isUrl(null), false);
    assert.strictEqual(isUrl(undefined), false);
    assert.strictEqual(isUrl(12345), false);
  });
});
