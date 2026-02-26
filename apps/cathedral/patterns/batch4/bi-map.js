/**
 * BiMap — bidirectional map (bijection between keys and values)
 * createBiMap() → { set, getByKey, getByValue, deleteByKey, deleteByValue, size }
 */
function createBiMap() {
  const forward = new Map();  // key → value
  const reverse = new Map();  // value → key

  function set(key, value) {
    // Remove existing mappings if they conflict
    if (forward.has(key)) {
      const oldValue = forward.get(key);
      reverse.delete(oldValue);
    }
    if (reverse.has(value)) {
      const oldKey = reverse.get(value);
      forward.delete(oldKey);
    }
    forward.set(key, value);
    reverse.set(value, key);
  }

  function getByKey(key) {
    return forward.get(key);
  }

  function getByValue(value) {
    return reverse.get(value);
  }

  function deleteByKey(key) {
    if (!forward.has(key)) return false;
    const value = forward.get(key);
    forward.delete(key);
    reverse.delete(value);
    return true;
  }

  function deleteByValue(value) {
    if (!reverse.has(value)) return false;
    const key = reverse.get(value);
    reverse.delete(value);
    forward.delete(key);
    return true;
  }

  function size() {
    return forward.size;
  }

  return { set, getByKey, getByValue, deleteByKey, deleteByValue, size };
}

module.exports = { createBiMap };
