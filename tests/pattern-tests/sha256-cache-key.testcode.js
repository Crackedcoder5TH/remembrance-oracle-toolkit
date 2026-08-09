const assert = require('node:assert/strict');
const _exports = module.exports;

// Test cacheKey consistency
const _k1 = _exports.cacheKey('hello world');
const _k2 = _exports.cacheKey('hello world');
assert.equal(_k1, _k2, 'Same input must produce same key');

// Test cacheKey uniqueness
const _k3 = _exports.cacheKey('hello world!');
assert.notEqual(_k1, _k3, 'Different inputs must produce different keys');

// Test collision prevention for texts sharing long common prefix
const _prefix = 'a'.repeat(1000);
const _kA = _exports.cacheKey(_prefix + ' ending A');
const _kB = _exports.cacheKey(_prefix + ' ending B');
assert.notEqual(_kA, _kB, 'Texts with same 1000-char prefix must have different keys');

// Test format
assert.equal(_k1.length, 24, 'Key must be 24 chars');
assert.ok(/^[0-9a-f]+$/.test(_k1), 'Key must be hex');

// Test SafeCache
const _cache = new _exports.SafeCache(3);
_cache.set('text1', 'value1');
_cache.set('text2', 'value2');
_cache.set('text3', 'value3');
assert.equal(_cache.get('text1'), 'value1');
assert.equal(_cache.get('text2'), 'value2');
assert.equal(_cache.size, 3);

// Test eviction
_cache.set('text4', 'value4');
assert.equal(_cache.size, 3, 'Should evict oldest to stay at max size');
assert.equal(_cache.get('text4'), 'value4');

// Test has
assert.ok(_cache.has('text4'));
assert.ok(!_cache.has('nonexistent'));

// Test clear
_cache.clear();
assert.equal(_cache.size, 0);

console.log('All SHA-256 cache key tests passed');
