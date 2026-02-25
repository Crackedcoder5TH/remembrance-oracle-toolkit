/**
 * memoizeWithTTL - Memoizes a function with a time-to-live cache.
 * Cached results expire after ttl milliseconds.
 * @param {Function} fn - Function to memoize
 * @param {number} ttl - Time-to-live for cache entries in milliseconds
 * @returns {Function} Memoized function
 */
function memoizeWithTTL(fn, ttl) {
  const cache = new Map();

  return function (...args) {
    const key = JSON.stringify(args);
    const now = Date.now();

    if (cache.has(key)) {
      const entry = cache.get(key);
      if (now - entry.timestamp < ttl) {
        return entry.value;
      }
      cache.delete(key);
    }

    const value = fn.apply(this, args);
    cache.set(key, { value, timestamp: now });
    return value;
  };
}

module.exports = { memoizeWithTTL };
