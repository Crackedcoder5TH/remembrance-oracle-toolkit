/**
 * curry - Returns a curried version of the given function.
 * Curried function can be called with any number of arguments
 * and returns a new function until all arguments are collected.
 * @param {Function} fn - Function to curry
 * @returns {Function} Curried function
 */
function curry(fn) {
  const arity = fn.length;

  function curried(...args) {
    if (args.length >= arity) {
      return fn.apply(this, args);
    }
    return function (...moreArgs) {
      return curried.apply(this, args.concat(moreArgs));
    };
  }

  return curried;
}

module.exports = { curry };
