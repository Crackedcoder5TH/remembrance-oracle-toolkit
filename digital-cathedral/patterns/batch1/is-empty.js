/**
 * Checks whether a value is empty.
 * Returns true for null, undefined, empty string, empty array, and empty object.
 * @param {*} val - The value to check.
 * @returns {boolean} True if the value is empty.
 */
function isEmpty(val) {
  if (val === null || val === undefined) {
    return true;
  }
  if (typeof val === 'string' || Array.isArray(val)) {
    return val.length === 0;
  }
  if (typeof val === 'object') {
    return Object.keys(val).length === 0;
  }
  return false;
}

module.exports = isEmpty;
