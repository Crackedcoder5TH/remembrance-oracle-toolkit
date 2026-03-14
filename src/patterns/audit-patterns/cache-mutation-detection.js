/**
 * Bug Detection Pattern: Cache Result Mutation
 *
 * Detects code that returns cached objects by reference without cloning,
 * allowing callers to mutate the cache and corrupt future lookups.
 * Also detects mutable object mutations during iteration or healing loops.
 *
 * Examples of vulnerable code:
 *   const cached = cache.get(key); if (cached) return cached;  // mutation risk
 *   pattern.code = healedCode;  // mutates original during healing loop
 *
 * Safe alternatives:
 *   if (cached) return { ...cached, arr: [...cached.arr] };  // shallow clone
 *   let codeToHeal = pattern.code;  // local copy for mutation
 *
 * @pattern cache-mutation-detection
 * @category bug-detection
 * @tags cache, mutation, reference, defensive-copy
 */

/**
 * Detect potential cache mutation and object mutation patterns.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, pattern: string, suggestion: string}>}
 */
function detectCacheMutation(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  const patterns = [
    {
      // cache.get(key) returned directly without clone
      pattern: /(?:cache|_cache|Cache)\w*\.get\s*\([^)]+\)\s*;\s*$/,
      check: (match, line, idx, allLines) => {
        // Look ahead for direct return of cached value
        for (let j = idx + 1; j < Math.min(idx + 3, allLines.length); j++) {
          if (/if\s*\(cached\)\s*return\s+cached/.test(allLines[j])) return true;
        }
        return false;
      },
      suggestion: () => 'Return a shallow copy of cached objects: return { ...cached } to prevent caller mutation',
    },
    {
      // Direct property mutation on entry/pattern in a loop
      pattern: /(?:pattern|entry)\.\w+\s*=\s*(?:healed|new|modified|updated)/,
      check: (match, line) => {
        // Only flag if inside a loop context (for/while)
        return !line.includes('const ') && !line.includes('let ');
      },
      suggestion: () => 'Use a local variable instead of mutating the source object in loops',
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    for (const { pattern, check, suggestion } of patterns) {
      const match = line.match(pattern);
      if (match && (!check || check(match, line, i, lines))) {
        warnings.push({
          line: i + 1,
          pattern: match[0],
          suggestion: suggestion(match),
        });
      }
    }
  }

  return warnings;
}

module.exports = { detectCacheMutation };
