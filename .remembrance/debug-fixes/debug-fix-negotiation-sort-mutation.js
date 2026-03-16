/**
 * Meta-Pattern 6 Fix: Array.sort() Mutates In-Place During Comparison
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "Array.sort() returns a new sorted array for use in the expression"
 * Reality:    "Array.sort() mutates the original array in-place, corrupting
 *              the `candidates` parameter for the caller"
 *
 * Bug class: State mutation — caller's data silently corrupted
 * Location:  src/cloud/negotiation.js:resolveConflict()
 * Severity:  HIGH — negotiateMulti() uses candidates after resolveConflict()
 *            returns, but the array is already mutated by sort()
 *
 * Fix: Copy before sorting to protect the caller's data.
 */

// Before (broken):
// function resolveConflict(candidates, strategy) {
//   let sorted;
//   sorted = candidates.sort((a, b) => ...);  // MUTATES candidates!
//   return { remote: sorted[0].remote, ... };
// }

// After (fixed):
function resolveConflict(candidates, strategy = 'highest-coherency') {
  if (candidates.length === 0) return null;
  if (candidates.length === 1) return { ...candidates[0], reason: 'only-candidate' };

  // Copy before sorting — never mutate the caller's array
  const sorted = [...candidates];

  switch (strategy) {
    case 'most-tested':
      sorted.sort((a, b) => (b.pattern.hasTests ? 1 : 0) - (a.pattern.hasTests ? 1 : 0)
        || (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
      break;
    case 'most-used':
      sorted.sort((a, b) => (b.pattern.usageCount || 0) - (a.pattern.usageCount || 0)
        || (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
      break;
    case 'newest':
      sorted.sort((a, b) => (b.pattern.codeHash || '').localeCompare(a.pattern.codeHash || '')
        || (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
      break;
    default:
      sorted.sort((a, b) => (b.pattern.coherency || 0) - (a.pattern.coherency || 0));
  }

  return { remote: sorted[0].remote, pattern: sorted[0].pattern, reason: strategy };
}

module.exports = { resolveConflict };
