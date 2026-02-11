/**
 * LRU Cache — Least Recently Used cache with fixed capacity
 * createLRUCache(capacity) → { get, set, has, size }
 */
function createLRUCache(capacity) {
  const cache = new Map();

  function get(key) {
    if (!cache.has(key)) return undefined;
    const value = cache.get(key);
    // Move to end (most recently used)
    cache.delete(key);
    cache.set(key, value);
    return value;
  }

  function set(key, value) {
    if (cache.has(key)) {
      cache.delete(key);
    } else if (cache.size >= capacity) {
      // Evict the least recently used (first entry)
      const firstKey = cache.keys().next().value;
      cache.delete(firstKey);
    }
    cache.set(key, value);
  }

  function has(key) {
    return cache.has(key);
  }

  function size() {
    return cache.size;
  }

  return { get, set, has, size };
}

module.exports = { createLRUCache };
