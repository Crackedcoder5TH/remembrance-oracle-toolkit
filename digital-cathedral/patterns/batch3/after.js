/**
 * after - Creates a function that only executes after being called n times.
 * Before n calls, returns undefined.
 * @param {number} n - Number of calls before fn executes
 * @param {Function} fn - Function to invoke after n calls
 * @returns {Function} Wrapped function
 */
function after(n, fn) {
  let count = 0;

  return function (...args) {
    count++;
    if (count >= n) {
      return fn.apply(this, args);
    }
    return undefined;
  };
}

module.exports = { after };
