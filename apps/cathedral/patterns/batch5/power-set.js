/**
 * powerSet - Generate all subsets (the power set) of an array.
 * @param {Array} arr - The input array.
 * @returns {Array<Array>} An array of all subsets.
 */
function powerSet(arr) {
  const result = [[]];

  for (let i = 0; i < arr.length; i++) {
    const len = result.length;
    for (let j = 0; j < len; j++) {
      result.push([...result[j], arr[i]]);
    }
  }

  return result;
}

module.exports = powerSet;
