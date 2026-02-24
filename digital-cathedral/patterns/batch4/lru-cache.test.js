const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

describe('createLRUCache', () => {
  it('should store and retrieve values', () => {
    const cache = createLRUCache(3);
    cache.set('a', 1);
    cache.set('b', 2);
    assert.strictEqual(cache.get('a'), 1);
    assert.strictEqual(cache.get('b'), 2);
  });

  it('should evict least recently used when capacity exceeded', () => {
    const cache = createLRUCache(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.set('c', 3); // evicts 'a'
    assert.strictEqual(cache.get('a'), undefined);
    assert.strictEqual(cache.get('b'), 2);
    assert.strictEqual(cache.get('c'), 3);
  });

  it('should refresh item on get', () => {
    const cache = createLRUCache(2);
    cache.set('a', 1);
    cache.set('b', 2);
    cache.get('a'); // refresh 'a'
    cache.set('c', 3); // should evict 'b', not 'a'
    assert.strictEqual(cache.get('a'), 1);
    assert.strictEqual(cache.get('b'), undefined);
    assert.strictEqual(cache.get('c'), 3);
  });

  it('should report has and size correctly', () => {
    const cache = createLRUCache(3);
    cache.set('x', 10);
    assert.strictEqual(cache.has('x'), true);
    assert.strictEqual(cache.has('y'), false);
    assert.strictEqual(cache.size(), 1);
  });

  it('should update existing key without increasing size', () => {
    const cache = createLRUCache(2);
    cache.set('a', 1);
    cache.set('a', 100);
    assert.strictEqual(cache.size(), 1);
    assert.strictEqual(cache.get('a'), 100);
  });
});
