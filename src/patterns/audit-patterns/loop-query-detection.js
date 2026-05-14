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

  // Track brace depth to know when loop bodies end
  // loopStack stores { depth, braceless } for each active loop
  let braceDepth = 0;
  const loopStack = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Pop braceless loops after their single statement line
    for (let s = loopStack.length - 1; s >= 0; s--) {
      if (loopStack[s].braceless && loopStack[s].bodyStarted) {
        loopStack.splice(s, 1);
      }
    }

    // Check if line starts a loop — push current brace depth onto stack
    const isLoop = /\bfor\s*\(|\bwhile\s*\(|\.forEach\s*\(|\.map\s*\(/.test(line);
    if (isLoop) {
      // Check if this line contains an opening brace (braced loop body)
      const hasBrace = line.includes('{');
      loopStack.push({ depth: braceDepth, braceless: !hasBrace, bodyStarted: false });
    }

    // Count braces on this line
    const opens = (line.match(/\{/g) || []).length;
    const closes = (line.match(/\}/g) || []).length;

    // Check for query while inside a loop
    if (loopStack.length > 0 && queryPatterns.test(line)) {
      const match = line.match(queryPatterns);
      warnings.push({
        line: i + 1,
        pattern: match ? match[0] : line.trim(),
        suggestion: 'Move query outside loop and use a Map for O(1) lookups',
      });
    }

    // Update brace depth
    braceDepth += opens - closes;

    // Mark braceless loops as body-started (next iteration will pop them)
    for (const entry of loopStack) {
      if (entry.braceless && !entry.bodyStarted) {
        entry.bodyStarted = true;
      }
    }

    // Pop braced loops whose body has closed (braceDepth returned to loop start level)
    while (loopStack.length > 0 && !loopStack[loopStack.length - 1].braceless &&
           braceDepth <= loopStack[loopStack.length - 1].depth) {
      loopStack.pop();
    }
  }

  return warnings;
}

module.exports = { detectLoopQuery };
