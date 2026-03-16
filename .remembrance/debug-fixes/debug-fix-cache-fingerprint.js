/**
 * Meta-Pattern 1 Fix: Cache Invalidation by Count Only (Separation from Wholeness)
 *
 * Bug: Coverage cache validates only by pattern count. If patterns are replaced
 * with same count, stale cache is returned. The cache forgets the WHOLE
 * (identity of patterns) and only checks a PART (count).
 *
 * Root cause: Separation from Wholeness — local view (count) misses global
 * reality (actual pattern identities changed).
 *
 * Fix: Use a fingerprint combining count + IDs of first/middle/last patterns.
 * Detects replacements without expensive full-hash computation.
 */

function computeCacheFingerprint(patterns) {
  const mid = Math.floor(patterns.length / 2);
  return `${patterns.length}:${patterns[0]?.id || ''}:${patterns[mid]?.id || ''}:${patterns[patterns.length - 1]?.id || ''}`;
}

module.exports = { computeCacheFingerprint };
