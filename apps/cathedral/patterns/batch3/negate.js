/**
 * negate - Creates a function that negates the result of a predicate function.
 * @param {Function} predFn - Predicate function to negate
 * @returns {Function} Negated predicate
 */
function negate(predFn) {
  return function (...args) {
    return !predFn.apply(this, args);
  };
}

module.exports = { negate };
