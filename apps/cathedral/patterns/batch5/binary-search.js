/**
 * binarySearch - Find the index of a target value in a sorted array.
 * @param {number[]} sortedArr - A sorted array of numbers.
 * @param {number} target - The value to search for.
 * @returns {number} The index of the target, or -1 if not found.
 */
function binarySearch(sortedArr, target) {
  let left = 0;
  let right = sortedArr.length - 1;

  while (left <= right) {
    const mid = Math.floor((left + right) / 2);
    if (sortedArr[mid] === target) {
      return mid;
    } else if (sortedArr[mid] < target) {
      left = mid + 1;
    } else {
      right = mid - 1;
    }
  }

  return -1;
}

module.exports = binarySearch;
