/**
 * isUrl - Validates whether a string is a well-formed URL.
 * Supports http, https, ftp protocols with optional port, path, query, and fragment.
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is a valid URL
 */
function isUrl(str) {
  if (typeof str !== 'string' || str.length === 0) return false;
  const pattern = /^(https?|ftp):\/\/[^\s/$.?#].[^\s]*$/i;
  try {
    const hasProtocol = /^https?:\/\//i.test(str) || /^ftp:\/\//i.test(str);
    if (!hasProtocol) return false;
    // Check for basic structure: protocol://host
    const afterProtocol = str.replace(/^(https?|ftp):\/\//i, '');
    if (afterProtocol.length === 0) return false;
    // Must have at least a dot in the host or be localhost
    const hostPart = afterProtocol.split(/[/?#]/)[0];
    if (hostPart.includes('.') || hostPart.startsWith('localhost')) {
      return pattern.test(str);
    }
    return false;
  } catch (e) {
    return false;
  }
}

module.exports = isUrl;
