/**
 * Returns the arithmetic mean (average) of an array of numbers.
 * @param {number[]} array - The array of numbers.
 * @returns {number} The average value.
 */
function mean(array) {
  if (array.length === 0) {
    return NaN;
  }
  return array.reduce((acc, val) => acc + val, 0) / array.length;
}

module.exports = mean;
