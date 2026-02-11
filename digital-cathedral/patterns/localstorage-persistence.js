// localStorage-persistence — capped array storage with error handling
// Safe read/write to localStorage with JSON parse, max length cap

function loadArray(key, maxLength) {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(key);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.slice(0, maxLength || arr.length) : [];
  } catch {
    return [];
  }
}

function saveArray(key, entries, maxLength) {
  try {
    const capped = maxLength ? entries.slice(0, maxLength) : entries;
    localStorage.setItem(key, JSON.stringify(capped));
    return true;
  } catch {
    return false;
  }
}

function prependToArray(key, newEntry, existing, maxLength) {
  const next = [newEntry, ...existing].slice(0, maxLength);
  saveArray(key, next, maxLength);
  return next;
}

function clearArray(key) {
  try { localStorage.removeItem(key); return true; } catch { return false; }
}

module.exports = { loadArray, saveArray, prependToArray, clearArray };
