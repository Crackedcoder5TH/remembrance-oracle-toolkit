/**
 * kebabToCamel - Converts a kebab-case string to camelCase.
 * @param {string} str - The kebab-case string to convert.
 * @returns {string} The camelCase version of the input string.
 */
function kebabToCamel(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/-([a-z])/g, (_, char) => char.toUpperCase());
}

module.exports = kebabToCamel;
