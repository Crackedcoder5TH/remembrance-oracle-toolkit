/**
 * Bug Detection Pattern: Database/Store Query Inside Loop
 *
 * Detects code that performs expensive queries (getAllPatterns, getAll,
 * database queries) inside loops, creating O(N*M) performance bugs.
 *
 * Examples of vulnerable code:
 *   for (const d of deltas) {
 *     const patterns = store.getAllPatterns();  // called per-delta!
 *     const pattern = patterns.find(p => p.id === d.id);
 *   }
 *
 * Safe alternatives:
 *   const patterns = store.getAllPatterns();  // once
 *   const map = new Map(patterns.map(p => [p.id, p]));
 *   for (const d of deltas) {
 *     const pattern = map.get(d.id);
 *   }
 *
 * @pattern loop-query-detection
 * @category bug-detection
 * @tags performance, n-plus-one, query-in-loop, optimization
 */

/**
 * Detect queries inside loops.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, pattern: string, suggestion: string}>}
 */
function detectLoopQuery(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  const queryPatterns = /\.getAll\w*\(\)|\.find\w*\(\)|\.query\(\)|\.select\(\)|\.fetch\(\)/;
  let loopDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Count opening braces that follow loop statements on the same line
    const loopMatch = /\bfor\s*\(|\bwhile\s*\(|\.forEach\s*\(|\.map\s*\(/.test(line);
    if (loopMatch) loopDepth++;

    // Count all closing braces for depth tracking (not just at line start)
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;
    const netClose = closes - opens;
    // If net closing braces, decrease loop depth (but not below 0)
    if (netClose > 0) {
      loopDepth = Math.max(0, loopDepth - netClose);
    }

    if (loopDepth > 0 && queryPatterns.test(line)) {
      const match = line.match(queryPatterns);
      warnings.push({
        line: i + 1,
        pattern: match ? match[0] : line.trim(),
        suggestion: 'Move query outside loop and use a Map for O(1) lookups',
      });
    }
  }

  return warnings;
}

module.exports = { detectLoopQuery };
