/**
 * Creates a deep copy of a value.
 * Uses structuredClone if available, otherwise falls back to manual recursion.
 * @param {*} obj - The value to deep clone.
 * @returns {*} A deep copy of the input.
 */
function deepClone(obj) {
  if (typeof structuredClone === 'function') {
    return structuredClone(obj);
  }
  return manualClone(obj);
}

function manualClone(obj) {
  if (obj === null || typeof obj !== 'object') {
    return obj;
  }
  if (obj instanceof Date) {
    return new Date(obj.getTime());
  }
  if (obj instanceof RegExp) {
    return new RegExp(obj.source, obj.flags);
  }
  if (Array.isArray(obj)) {
    return obj.map(manualClone);
  }
  const result = {};
  const keys = Object.keys(obj);
  for (let i = 0; i < keys.length; i++) {
    result[keys[i]] = manualClone(obj[keys[i]]);
  }
  return result;
}

module.exports = deepClone;
