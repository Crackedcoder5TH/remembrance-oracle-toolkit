/**
 * throttle - Creates a throttled function that only invokes fn at most
 * once per every `wait` milliseconds.
 * @param {Function} fn - Function to throttle
 * @param {number} wait - Minimum time between invocations in ms
 * @returns {Function} Throttled function
 */
function throttle(fn, wait) {
  let lastCallTime = 0;
  let lastResult;

  return function (...args) {
    const now = Date.now();
    if (now - lastCallTime >= wait) {
      lastCallTime = now;
      lastResult = fn.apply(this, args);
    }
    return lastResult;
  };
}

module.exports = { throttle };
