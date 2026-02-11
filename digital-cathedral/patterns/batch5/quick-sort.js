/**
 * quickSort - Sort an array using the quick sort algorithm.
 * @param {number[]} arr - The array to sort.
 * @returns {number[]} A new sorted array.
 */
function quickSort(arr) {
  if (arr.length <= 1) {
    return arr.slice();
  }

  const pivot = arr[Math.floor(arr.length / 2)];
  const left = [];
  const middle = [];
  const right = [];

  for (let i = 0; i < arr.length; i++) {
    if (arr[i] < pivot) {
      left.push(arr[i]);
    } else if (arr[i] === pivot) {
      middle.push(arr[i]);
    } else {
      right.push(arr[i]);
    }
  }

  return [...quickSort(left), ...middle, ...quickSort(right)];
}

module.exports = quickSort;
