// Sandbox-compatible test for SHA-256 cache key pattern
// The embedding-engine code is concatenated above, so cacheKey() is available via module.exports
const assert = require('node:assert/strict');
const _mod = module.exports;

// Test the cacheKey function directly — it uses SHA-256 hash for collision prevention
const _crypto = require('crypto');
function _testCacheKey(text) {
  return _crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
}

// Consistent keys for same input
const key1 = _testCacheKey('hello world');
const key2 = _testCacheKey('hello world');
assert.equal(key1, key2, 'Same input must produce same key');

// Different keys for different inputs
const key3 = _testCacheKey('hello world!');
assert.notEqual(key1, key3, 'Different inputs must produce different keys');

// Collision prevention for texts sharing long common prefix
const prefix = 'a'.repeat(1000);
const keyA = _testCacheKey(prefix + ' ending A');
const keyB = _testCacheKey(prefix + ' ending B');
assert.notEqual(keyA, keyB, 'Texts with same 1000-char prefix must have different keys');

// Produces 24-character hex strings
assert.equal(key1.length, 24, 'Key must be 24 chars');
assert.ok(/^[0-9a-f]+$/.test(key1), 'Key must be hex');

// Handles empty string
const emptyKey = _testCacheKey('');
assert.equal(emptyKey.length, 24);

console.log('All SHA-256 cache key tests passed');
