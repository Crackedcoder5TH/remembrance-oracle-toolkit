/**
 * pipe - Composes functions left to right.
 * pipe(f, g, h)(x) === h(g(f(x)))
 * @param {...Function} fns - Functions to compose
 * @returns {Function} Composed function
 */
function pipe(...fns) {
  if (fns.length === 0) return (x) => x;
  return function (...args) {
    let result = fns[0].apply(this, args);
    for (let i = 1; i < fns.length; i++) {
      result = fns[i](result);
    }
    return result;
  };
}

module.exports = { pipe };
