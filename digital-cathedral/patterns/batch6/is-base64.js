/**
 * isBase64 - Validates whether a string is valid Base64 encoded.
 * Checks for proper character set [A-Za-z0-9+/] with optional = padding.
 * Length must be a multiple of 4 (with padding).
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is valid Base64
 */
function isBase64(str) {
  if (typeof str !== 'string') return false;
  if (str.length === 0) return false;
  // Base64 must have length divisible by 4
  if (str.length % 4 !== 0) return false;
  const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
  if (!base64Pattern.test(str)) return false;
  // Padding validation: = can only appear at the end
  const paddingIndex = str.indexOf('=');
  if (paddingIndex !== -1) {
    const afterPadding = str.substring(paddingIndex);
    if (!/^={1,2}$/.test(afterPadding)) return false;
  }
  return true;
}

module.exports = isBase64;
