/**
 * combinations - Generate all k-combinations of an array.
 * @param {Array} arr - The input array.
 * @param {number} k - The size of each combination.
 * @returns {Array<Array>} An array of all k-combinations.
 */
function combinations(arr, k) {
  if (k < 0 || k > arr.length) return [];
  if (k === 0) return [[]];
  if (k === arr.length) return [arr.slice()];

  const result = [];

  function backtrack(start, current) {
    if (current.length === k) {
      result.push(current.slice());
      return;
    }

    for (let i = start; i < arr.length; i++) {
      current.push(arr[i]);
      backtrack(i + 1, current);
      current.pop();
    }
  }

  backtrack(0, []);
  return result;
}

module.exports = combinations;
