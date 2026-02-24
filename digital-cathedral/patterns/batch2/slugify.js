/**
 * slugify - Converts a string into a URL-safe slug.
 * @param {string} str - The string to slugify.
 * @returns {string} A URL-safe slug.
 */
function slugify(str) {
  if (typeof str !== 'string') return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

module.exports = slugify;
