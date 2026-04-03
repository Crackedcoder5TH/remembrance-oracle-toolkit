/**
 * unescapeHtml - Unescapes HTML entities back to their original characters.
 * @param {string} str - The HTML-escaped string to unescape.
 * @returns {string} The unescaped string.
 */
function unescapeHtml(str) {
  if (typeof str !== 'string') return '';
  const map = {
    '&amp;': '&',
    '&lt;': '<',
    '&gt;': '>',
    '&quot;': '"',
    '&#39;': "'"
  };
  return str.replace(/&amp;|&lt;|&gt;|&quot;|&#39;/g, (entity) => map[entity]);
}

module.exports = unescapeHtml;
