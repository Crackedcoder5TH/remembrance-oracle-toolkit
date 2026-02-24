/**
 * buildQueryString - Builds a URL query string from a key-value object.
 * Encodes both keys and values. Skips undefined and null values.
 * @param {Object} obj - The key-value pairs to encode
 * @returns {string} The encoded query string (without leading ?)
 */
function buildQueryString(obj) {
  if (obj === null || typeof obj !== 'object' || Array.isArray(obj)) return '';
  const pairs = [];
  const keys = Object.keys(obj);
  for (const key of keys) {
    const value = obj[key];
    if (value === undefined || value === null) continue;
    const encodedKey = encodeURIComponent(key);
    const encodedValue = encodeURIComponent(String(value));
    pairs.push(encodedKey + '=' + encodedValue);
  }
  return pairs.join('&');
}

module.exports = buildQueryString;
