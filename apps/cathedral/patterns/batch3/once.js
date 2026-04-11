/**
 * once - Creates a function that runs only on the first call.
 * Subsequent calls return the result of the first invocation.
 * @param {Function} fn - Function to call once
 * @returns {Function} Wrapped function
 */
function once(fn) {
  let called = false;
  let result;

  return function (...args) {
    if (!called) {
      called = true;
      result = fn.apply(this, args);
    }
    return result;
  };
}

module.exports = { once };
