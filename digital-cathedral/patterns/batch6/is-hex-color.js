/**
 * isHexColor - Validates whether a string is a valid hex color code.
 * Supports 3-char (#RGB), 4-char (#RGBA), 6-char (#RRGGBB), and 8-char (#RRGGBBAA) formats.
 * @param {string} str - The string to validate
 * @returns {boolean} True if the string is a valid hex color
 */
function isHexColor(str) {
  if (typeof str !== 'string') return false;
  const hexPattern = /^#([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;
  return hexPattern.test(str);
}

module.exports = isHexColor;
