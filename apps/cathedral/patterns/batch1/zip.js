/**
 * Zips two arrays into an array of pairs.
 * The result length equals the shorter array.
 * @param {Array} arr1 - The first array.
 * @param {Array} arr2 - The second array.
 * @returns {Array[]} An array of [a, b] pairs.
 */
function zip(arr1, arr2) {
  const len = Math.min(arr1.length, arr2.length);
  const result = [];
  for (let i = 0; i < len; i++) {
    result.push([arr1[i], arr2[i]]);
  }
  return result;
}

module.exports = zip;
