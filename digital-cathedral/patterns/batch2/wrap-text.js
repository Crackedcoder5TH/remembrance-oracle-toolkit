/**
 * wrapText - Wraps text to a specified width by inserting newlines between words.
 * @param {string} str - The text to wrap.
 * @param {number} width - The maximum line width.
 * @returns {string} The wrapped text with newline characters.
 */
function wrapText(str, width) {
  if (typeof str !== 'string') return '';
  if (width <= 0) return str;
  const words = str.split(/\s+/).filter(Boolean);
  if (words.length === 0) return '';
  const lines = [];
  let currentLine = words[0];
  for (let i = 1; i < words.length; i++) {
    if (currentLine.length + 1 + words[i].length <= width) {
      currentLine += ' ' + words[i];
    } else {
      lines.push(currentLine);
      currentLine = words[i];
    }
  }
  lines.push(currentLine);
  return lines.join('\n');
}

module.exports = wrapText;
