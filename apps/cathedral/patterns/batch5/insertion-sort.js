/**
 * insertionSort - Sort an array using the insertion sort algorithm.
 * @param {number[]} arr - The array to sort.
 * @returns {number[]} A new sorted array.
 */
function insertionSort(arr) {
  const result = arr.slice();

  for (let i = 1; i < result.length; i++) {
    const current = result[i];
    let j = i - 1;

    while (j >= 0 && result[j] > current) {
      result[j + 1] = result[j];
      j--;
    }

    result[j + 1] = current;
  }

  return result;
}

module.exports = insertionSort;
