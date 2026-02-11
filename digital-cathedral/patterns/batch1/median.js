/**
 * Returns the median value of an array of numbers.
 * For even-length arrays, returns the average of the two middle values.
 * @param {number[]} array - The array of numbers.
 * @returns {number} The median value.
 */
function median(array) {
  if (array.length === 0) {
    return NaN;
  }
  const sorted = array.slice().sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

module.exports = median;
