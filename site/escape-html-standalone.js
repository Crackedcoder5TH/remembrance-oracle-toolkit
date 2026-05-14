function escapeHtml(str) {
  if (typeof str !== 'string') return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// Export for Node consumers (tests, build tooling). Browser users still
// pick up the function via a plain <script> include in the global scope.
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { escapeHtml };
}
