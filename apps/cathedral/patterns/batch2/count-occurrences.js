/**
 * countOccurrences - Counts the number of non-overlapping occurrences of a substring in a string.
 * @param {string} str - The string to search in.
 * @param {string} substr - The substring to count.
 * @returns {number} The number of occurrences.
 */
function countOccurrences(str, substr) {
  if (typeof str !== 'string' || typeof substr !== 'string') return 0;
  if (substr.length === 0) return 0;
  let count = 0;
  let pos = 0;
  while (true) {
    const idx = str.indexOf(substr, pos);
    if (idx === -1) break;
    count++;
    pos = idx + substr.length;
  }
  return count;
}

module.exports = countOccurrences;
