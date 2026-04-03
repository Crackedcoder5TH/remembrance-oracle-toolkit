/**
 * selectionSort - Sort an array using the selection sort algorithm.
 * @param {number[]} arr - The array to sort.
 * @returns {number[]} A new sorted array.
 */
function selectionSort(arr) {
  const result = arr.slice();

  for (let i = 0; i < result.length - 1; i++) {
    let minIndex = i;

    for (let j = i + 1; j < result.length; j++) {
      if (result[j] < result[minIndex]) {
        minIndex = j;
      }
    }

    if (minIndex !== i) {
      const temp = result[i];
      result[i] = result[minIndex];
      result[minIndex] = temp;
    }
  }

  return result;
}

module.exports = selectionSort;
