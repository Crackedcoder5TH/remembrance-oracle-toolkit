/**
 * wordCount - Counts the number of words in a string.
 * @param {string} str - The string to count words in.
 * @returns {number} The number of words.
 */
function wordCount(str) {
  if (typeof str !== 'string') return 0;
  const trimmed = str.trim();
  if (trimmed.length === 0) return 0;
  return trimmed.split(/\s+/).length;
}

module.exports = wordCount;
