/**
 * before - Creates a function that only executes for the first n calls.
 * After n calls, returns the last successful result.
 * @param {number} n - Maximum number of times fn will execute
 * @param {Function} fn - Function to invoke
 * @returns {Function} Wrapped function
 */
function before(n, fn) {
  let count = 0;
  let lastResult;

  return function (...args) {
    count++;
    if (count <= n) {
      lastResult = fn.apply(this, args);
    }
    return lastResult;
  };
}

module.exports = { before };
