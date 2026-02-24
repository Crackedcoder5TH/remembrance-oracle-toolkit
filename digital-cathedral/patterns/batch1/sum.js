/**
 * Returns the sum of all numbers in an array.
 * @param {number[]} array - The array of numbers.
 * @returns {number} The total sum.
 */
function sum(array) {
  return array.reduce((acc, val) => acc + val, 0);
}

module.exports = sum;
