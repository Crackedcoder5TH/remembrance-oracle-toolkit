/**
 * Sorted Array — array that maintains sort order on insert
 * createSortedArray(compareFn?) → { insert, remove, indexOf, toArray, size }
 */
function createSortedArray(compareFn) {
  const compare = compareFn || ((a, b) => (a < b ? -1 : a > b ? 1 : 0));
  const items = [];

  function binarySearch(value) {
    let lo = 0;
    let hi = items.length;
    while (lo < hi) {
      const mid = (lo + hi) >>> 1;
      if (compare(items[mid], value) < 0) {
        lo = mid + 1;
      } else {
        hi = mid;
      }
    }
    return lo;
  }

  function insert(value) {
    const index = binarySearch(value);
    items.splice(index, 0, value);
  }

  function remove(value) {
    const index = binarySearch(value);
    if (index < items.length && compare(items[index], value) === 0) {
      items.splice(index, 1);
      return true;
    }
    return false;
  }

  function indexOf(value) {
    const index = binarySearch(value);
    if (index < items.length && compare(items[index], value) === 0) {
      return index;
    }
    return -1;
  }

  function toArray() {
    return items.slice();
  }

  function size() {
    return items.length;
  }

  return { insert, remove, indexOf, toArray, size };
}

module.exports = { createSortedArray };
