/**
 * Converts a camelCase string to kebab-case.
 * @param {string} str - The camelCase string.
 * @returns {string} The kebab-case string.
 */
function camelToKebab(str) {
  return str.replace(/([a-z0-9])([A-Z])/g, '$1-$2').toLowerCase();
}

module.exports = camelToKebab;
