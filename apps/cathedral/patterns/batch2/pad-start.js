/**
 * padStart - Pads a string from the start to a specified length.
 * @param {string} str - The string to pad.
 * @param {number} len - The desired total length.
 * @param {string} [char=' '] - The character to pad with (first char used if longer).
 * @returns {string} The padded string.
 */
function padStart(str, len, char = ' ') {
  if (typeof str !== 'string') return '';
  if (str.length >= len) return str;
  const padChar = char.charAt(0) || ' ';
  const needed = len - str.length;
  return padChar.repeat(needed) + str;
}

module.exports = padStart;
