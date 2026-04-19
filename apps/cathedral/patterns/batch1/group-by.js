/**
 * Groups array elements by the result of a key function.
 * @param {Array} array - The array to group.
 * @param {Function} keyFn - A function that returns the group key for each element.
 * @returns {Object} An object mapping keys to arrays of elements.
 */
function groupBy(array, keyFn) {
  const result = {};
  for (let i = 0; i < array.length; i++) {
    const key = keyFn(array[i]);
    if (!result[key]) {
      result[key] = [];
    }
    result[key].push(array[i]);
  }
  return result;
}

module.exports = groupBy;
