/**
 * bubbleSort - Sort an array using the bubble sort algorithm.
 * @param {number[]} arr - The array to sort.
 * @returns {number[]} A new sorted array.
 */
function bubbleSort(arr) {
  const result = arr.slice();
  let swapped;

  do {
    swapped = false;
    for (let i = 0; i < result.length - 1; i++) {
      if (result[i] > result[i + 1]) {
        const temp = result[i];
        result[i] = result[i + 1];
        result[i + 1] = temp;
        swapped = true;
      }
    }
  } while (swapped);

  return result;
}

module.exports = bubbleSort;
