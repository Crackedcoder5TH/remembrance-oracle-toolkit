/**
 * Counter — count occurrences in an array, find most common elements
 * createCounter(array) → { counts (Map), get(item), mostCommon(n), entries() }
 */
function createCounter(array) {
  const counts = new Map();

  for (const item of array) {
    counts.set(item, (counts.get(item) || 0) + 1);
  }

  function get(item) {
    return counts.get(item) || 0;
  }

  function mostCommon(n) {
    const sorted = [...counts.entries()].sort((a, b) => b[1] - a[1]);
    return sorted.slice(0, n);
  }

  function entries() {
    return [...counts.entries()];
  }

  return { counts, get, mostCommon, entries };
}

module.exports = { createCounter };
