/**
 * isJson - Validates whether a string is valid JSON.
 * Uses JSON.parse internally with proper error handling.
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is valid JSON
 */
function isJson(str) {
  if (typeof str !== 'string') return false;
  if (str.trim().length === 0) return false;
  try {
    JSON.parse(str);
    return true;
  } catch (e) {
    return false;
  }
}

module.exports = isJson;
