/**
 * Creates a new object with the specified keys omitted from the source object.
 * @param {Object} obj - The source object.
 * @param {string[]} keys - The keys to omit.
 * @returns {Object} A new object without the omitted keys.
 */
function omit(obj, keys) {
  const keysToOmit = new Set(keys);
  const result = {};
  const allKeys = Object.keys(obj);
  for (let i = 0; i < allKeys.length; i++) {
    const key = allKeys[i];
    if (!keysToOmit.has(key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

module.exports = omit;
