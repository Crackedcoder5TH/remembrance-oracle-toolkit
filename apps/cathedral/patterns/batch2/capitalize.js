/**
 * capitalize - Capitalizes the first letter of a string.
 * @param {string} str - The string to capitalize.
 * @returns {string} The string with the first letter uppercase.
 */
function capitalize(str) {
  if (typeof str !== 'string' || str.length === 0) return '';
  return str.charAt(0).toUpperCase() + str.slice(1);
}

module.exports = capitalize;
