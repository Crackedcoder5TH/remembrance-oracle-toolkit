/**
 * Returns a new array with duplicate values removed.
 * Preserves the order of first occurrence.
 * @param {Array} array - The array to deduplicate.
 * @returns {Array} A new array with unique values.
 */
function uniq(array) {
  return [...new Set(array)];
}

module.exports = uniq;
