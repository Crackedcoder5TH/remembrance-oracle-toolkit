/**
 * titleCase - Converts a string so that each word starts with an uppercase letter.
 * @param {string} str - The string to title-case.
 * @returns {string} The title-cased string.
 */
function titleCase(str) {
  if (typeof str !== 'string') return '';
  return str.replace(/\b\w/g, (char) => char.toUpperCase());
}

module.exports = titleCase;
