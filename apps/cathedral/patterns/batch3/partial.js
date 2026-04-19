/**
 * partial - Partially applies arguments to a function.
 * @param {Function} fn - Function to partially apply
 * @param {...*} partialArgs - Arguments to pre-fill
 * @returns {Function} Partially applied function
 */
function partial(fn, ...partialArgs) {
  return function (...remainingArgs) {
    return fn.apply(this, partialArgs.concat(remainingArgs));
  };
}

module.exports = { partial };
