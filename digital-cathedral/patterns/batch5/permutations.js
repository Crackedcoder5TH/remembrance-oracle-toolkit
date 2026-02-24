/**
 * permutations - Generate all permutations of an array.
 * @param {Array} arr - The input array.
 * @returns {Array<Array>} An array of all permutations.
 */
function permutations(arr) {
  if (arr.length === 0) return [[]];
  if (arr.length === 1) return [[arr[0]]];

  const result = [];

  for (let i = 0; i < arr.length; i++) {
    const current = arr[i];
    const remaining = [...arr.slice(0, i), ...arr.slice(i + 1)];
    const perms = permutations(remaining);

    for (const perm of perms) {
      result.push([current, ...perm]);
    }
  }

  return result;
}

module.exports = permutations;
