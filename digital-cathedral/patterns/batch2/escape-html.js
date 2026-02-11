/**
 * escapeHtml - Escapes HTML special characters in a string.
 * @param {string} str - The string to escape.
 * @returns {string} The HTML-escaped string.
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  };
  return str.replace(/[&<>"']/g, (ch) => map[ch]);
}

module.exports = escapeHtml;
