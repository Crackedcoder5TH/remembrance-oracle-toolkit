/**
 * truncate - Truncates a string to a maximum length, appending a suffix if truncated.
 * @param {string} str - The string to truncate.
 * @param {number} maxLen - The maximum length of the output string (including suffix).
 * @param {string} [suffix='...'] - The suffix to append when truncated.
 * @returns {string} The truncated string.
 */
function truncate(str, maxLen, suffix = '...') {
  if (typeof str !== 'string') return '';
  if (str.length <= maxLen) return str;
  const end = maxLen - suffix.length;
  if (end < 0) return suffix.slice(0, maxLen);
  return str.slice(0, end) + suffix;
}

module.exports = truncate;
