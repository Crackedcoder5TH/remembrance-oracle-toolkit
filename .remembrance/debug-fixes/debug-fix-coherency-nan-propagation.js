/**
 * Meta-Pattern 11 Fix: NaN Propagation in Coherency Scoring
 * (PATTERN ASSUMPTION MISMATCH)
 *
 * Assumption: "historicalReliability is always a valid number between 0 and 1"
 * Reality:    "When usage_count is 0 and success_count is 0,
 *              successCount / usageCount = 0/0 = NaN, which propagates
 *              through the weighted sum and produces NaN coherency"
 *
 * Bug class: Type — NaN is not a number but infects all arithmetic
 * Location:  src/store/sqlite.js:recordPatternUsage() line 933
 *            const historicalReliability = successCount / usageCount;
 *            Also: refreshAllCoherency() line 988 has the same pattern
 * Severity:  HIGH — NaN coherency breaks all comparisons (NaN < 0.7 is false,
 *            NaN > 0.7 is false, NaN === NaN is false), making patterns
 *            invisible to search and immune to pruning
 *
 * Additionally: The coverage map's avgCoherency calculation divides by
 *   count, which could be 0 for empty domains.
 *
 * Fix: Guard all divisions and default NaN to a safe value.
 */

// Before (broken):
// const historicalReliability = successCount / usageCount;  // 0/0 = NaN

// After (fixed):
function safeHistoricalReliability(successCount, usageCount, fallback = 0.5) {
  if (usageCount === 0 || !Number.isFinite(usageCount)) return fallback;
  const ratio = successCount / usageCount;
  return Number.isFinite(ratio) ? Math.max(0, Math.min(1, ratio)) : fallback;
}

function safeAverage(sum, count, fallback = 0) {
  if (count === 0 || !Number.isFinite(count)) return fallback;
  const avg = sum / count;
  return Number.isFinite(avg) ? avg : fallback;
}

module.exports = { safeHistoricalReliability, safeAverage };
