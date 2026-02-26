/**
 * compose - Composes functions right to left.
 * compose(f, g, h)(x) === f(g(h(x)))
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 */
function compose(...fns) {
  if (fns.length === 0) return (x) => x;
  return function (...args) {
    let result = fns[fns.length - 1].apply(this, args);
    for (let i = fns.length - 2; i >= 0; i--) {
      result = fns[i](result);
    }
    return result;
  };
}

module.exports = { compose };
