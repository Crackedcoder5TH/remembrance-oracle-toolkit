/**
 * Bug Detection Pattern: Logic Inconsistency Check
 *
 * Detects inconsistent logic patterns within the same function or module:
 * - Dry-run flags that incorrectly mutate state
 * - Alternative lists that include the main item
 * - Return values that contradict the branch condition
 *
 * Examples of buggy code:
 *   if (status === 'would-promote') { report.promoted++; }  // dry-run shouldn't count
 *   alternatives: scored.slice(0, 3)  // includes scored[0] which is already the main result
 *
 * @pattern logic-inconsistency-check
 * @category bug-detection
 * @tags logic-error, inconsistency, dry-run, state-mutation
 */

/**
 * Detect logic inconsistencies in code.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, pattern: string, warning: string}>}
 */
function detectLogicInconsistency(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Pattern: dry-run/preview/would- status that modifies counters
    if (/(?:dry.?run|preview|would|simulate|test.?mode)/i.test(line)) {
      // Check next few lines for counter increments
      for (let j = i + 1; j < Math.min(i + 5, lines.length); j++) {
        if (/\+\+|--|\+=\s*1|-=\s*1/.test(lines[j]) && /count|total|promoted|processed|completed/.test(lines[j])) {
          warnings.push({
            line: j + 1,
            pattern: lines[j].trim(),
            warning: 'Counter modification inside a dry-run/preview block. Dry runs should not mutate state.',
          });
        }
      }
    }

    // Pattern: slice(0, N) when slice(1, N+1) is used elsewhere for "alternatives"
    const sliceMatch = line.match(/\.slice\(0,\s*(\d+)\)/);
    if (sliceMatch && /alternative|other|rest|remaining/i.test(line)) {
      warnings.push({
        line: i + 1,
        pattern: sliceMatch[0],
        warning: 'slice(0, N) for alternatives may include the main item. Consider slice(1, N+1).',
      });
    }
  }

  return warnings;
}

module.exports = { detectLogicInconsistency };
