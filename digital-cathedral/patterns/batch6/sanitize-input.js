/**
 * sanitizeInput - Strips dangerous characters from input strings.
 * Removes HTML tags, script injections, and encodes special characters
 * to prevent XSS and injection attacks.
 * @param {string} str - The input string to sanitize
 * @returns {string} The sanitized string
 */
function sanitizeInput(str) {
  if (typeof str !== 'string') return '';
  return str
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Encode ampersands
    .replace(/&/g, '&amp;')
    // Encode less-than
    .replace(/</g, '&lt;')
    // Encode greater-than
    .replace(/>/g, '&gt;')
    // Encode double quotes
    .replace(/"/g, '&quot;')
    // Encode single quotes
    .replace(/'/g, '&#x27;')
    // Remove null bytes
    .replace(/\0/g, '')
    // Remove backslash escapes often used in injections
    .replace(/\\/g, '&#x5C;')
    .trim();
}

module.exports = sanitizeInput;
