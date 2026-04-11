/**
 * Creates a new object with only the specified keys from the source object.
 * @param {Object} obj - The source object.
 * @param {string[]} keys - The keys to pick.
 * @returns {Object} A new object containing only the picked keys.
 */
function pick(obj, keys) {
  const result = {};
  for (let i = 0; i < keys.length; i++) {
    const key = keys[i];
    if (Object.prototype.hasOwnProperty.call(obj, key)) {
      result[key] = obj[key];
    }
  }
  return result;
}

module.exports = pick;
