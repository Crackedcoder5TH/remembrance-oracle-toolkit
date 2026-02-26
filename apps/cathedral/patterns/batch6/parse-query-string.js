/**
 * parseQueryString - Parses a URL query string into a key-value object.
 * Handles leading ?, decodes URI components, and supports repeated keys
 * (last value wins).
 * @param {string} str - The query string to parse
 * @returns {Object} Parsed key-value pairs
 */
function parseQueryString(str) {
  if (typeof str !== 'string') return {};
  // Remove leading ? if present
  const query = str.startsWith('?') ? str.substring(1) : str;
  if (query.length === 0) return {};

  const result = {};
  const pairs = query.split('&');
  for (const pair of pairs) {
    if (pair.length === 0) continue;
    const eqIndex = pair.indexOf('=');
    let key, value;
    if (eqIndex === -1) {
      key = decodeURIComponent(pair);
      value = '';
    } else {
      key = decodeURIComponent(pair.substring(0, eqIndex));
      value = decodeURIComponent(pair.substring(eqIndex + 1));
    }
    if (key.length > 0) {
      result[key] = value;
    }
  }
  return result;
}

module.exports = parseQueryString;
