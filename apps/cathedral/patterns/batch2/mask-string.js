/**
 * maskString - Masks a string, leaving only the last N characters visible.
 * @param {string} str - The string to mask.
 * @param {number} [visibleChars=4] - Number of characters to leave visible at the end.
 * @param {string} [maskChar='*'] - The character to use for masking.
 * @returns {string} The masked string.
 */
function maskString(str, visibleChars = 4, maskChar = '*') {
  if (typeof str !== 'string') return '';
  if (str.length <= visibleChars) return str;
  const masked = maskChar.charAt(0).repeat(str.length - visibleChars);
  return masked + str.slice(-visibleChars);
}

module.exports = maskString;
