/**
 * SHA-256 Cache Key — Collision Prevention Pattern
 *
 * Replaces text.slice(0, N) cache keys with SHA-256 hashes
 * to prevent false cache hits for texts sharing common prefixes.
 *
 * Pattern: Use crypto hash for cache keys instead of truncation.
 * Tags: cache, sha256, collision-prevention, performance, crypto
 */
const crypto = require('crypto');

function cacheKey(text) {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 24);
}

class SafeCache {
  constructor(maxSize = 500) {
    this.cache = new Map();
    this.maxSize = maxSize;
  }

  get(text) {
    const key = cacheKey(text);
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    entry.lastAccess = Date.now();
    return entry.value;
  }

  set(text, value) {
    if (this.cache.size >= this.maxSize) {
      this._evictOldest();
    }
    const key = cacheKey(text);
    this.cache.set(key, { value, lastAccess: Date.now() });
  }

  has(text) {
    return this.cache.has(cacheKey(text));
  }

  clear() {
    this.cache.clear();
  }

  get size() {
    return this.cache.size;
  }

  _evictOldest() {
    let oldestKey = null;
    let oldestTime = Infinity;
    for (const [key, entry] of this.cache) {
      if (entry.lastAccess < oldestTime) {
        oldestTime = entry.lastAccess;
        oldestKey = key;
      }
    }
    if (oldestKey) this.cache.delete(oldestKey);
  }
}

module.exports = { cacheKey, SafeCache };
