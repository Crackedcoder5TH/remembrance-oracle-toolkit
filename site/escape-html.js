// @oracle-infrastructure — experiment/example/app scaffolding, not substrate periodic-table elements
/**
 * Escape HTML special characters to prevent XSS.
 * @param {string} str - Raw string
 * @returns {string} Escaped string safe for HTML insertion
 */
function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

module.exports = escapeHtml;
