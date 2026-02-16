/**
 * Shared store helpers — utility functions used by both
 * PatternLibrary, VerifiedHistoryStore, and SQLiteStore.
 */

/**
 * Count items grouped by a key field.
 * @param {Array<Object>} items
 * @param {string} key
 * @returns {Object} Map of key values to counts
 */
function countBy(items, key) {
  const counts = {};
  for (const item of items) {
    const val = item[key] || 'unknown';
    counts[val] = (counts[val] || 0) + 1;
  }
  return counts;
}

/**
 * Get top tags by frequency (case-insensitive).
 * @param {Array<Object>} entries - Items with `.tags` arrays
 * @param {number} limit - Max results
 * @returns {Array<{tag: string, count: number}>}
 */
function getTopTags(entries, limit) {
  const counts = {};
  for (const entry of entries) {
    for (const tag of entry.tags) {
      const normalized = tag.toLowerCase();
      counts[normalized] = (counts[normalized] || 0) + 1;
    }
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([tag, count]) => ({ tag, count }));
}

module.exports = { countBy, getTopTags };
