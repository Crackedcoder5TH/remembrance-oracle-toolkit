/**
 * Bug Detection Pattern: Null/Undefined Property Access Guard
 *
 * Detects code that accesses properties on potentially null/undefined values
 * without defensive checks. Common crash source in production.
 *
 * Examples of vulnerable code:
 *   item.name.toLowerCase()        // crashes if name is null
 *   result.code.slice(0, 100)      // crashes if code is undefined
 *   entry.tags.join(', ')          // crashes if tags is null
 *   row.field.method()             // crashes if field is undefined
 *
 * Safe alternatives:
 *   (item.name || '').toLowerCase()
 *   (result.code || '').slice(0, 100)
 *   (entry.tags || []).join(', ')
 *   row.field?.method() ?? fallback
 *
 * @pattern null-property-access-guard
 * @category bug-detection
 * @tags null-guard, defensive-programming, crash-prevention
 */

/**
 * Detect potential null property access patterns in code.
 * Returns an array of warnings with line numbers and suggestions.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, pattern: string, suggestion: string}>}
 */
function detectNullPropertyAccess(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  // Patterns that commonly crash on null/undefined
  const dangerousChains = [
    // .property.method() without optional chaining or guard
    {
      pattern: /(\w+)\.(\w+)\.(toLowerCase|toUpperCase|trim|slice|split|join|map|filter|reduce|forEach|includes|indexOf|startsWith|endsWith|match|replace|toString|toFixed)\s*\(/,
      check: (match, line) => {
        // Skip if preceded by optional chaining or null check
        if (line.includes(`${match[1]}?.${match[2]}`) || line.includes(`${match[1]} && ${match[1]}.${match[2]}`)) return false;
        // Skip if wrapped in (x || default)
        if (line.includes(`(${match[1]}.${match[2]} || `)) return false;
        // Skip if the method call itself uses optional chaining
        if (line.includes(`${match[2]}?.`)) return false;
        // Skip ternary guards: x.y ? x.y.method() : fallback
        if (new RegExp(`${match[1]}\\.${match[2]}\\s*\\?`).test(line)) return false;
        return true;
      },
      suggestion: (match) => `Consider: (${match[1]}.${match[2]} || '').${match[3]}() or ${match[1]}.${match[2]}?.${match[3]}()`,
    },
    // Direct iteration over potentially null array
    {
      pattern: /for\s*\(\s*(?:const|let|var)\s+\w+\s+of\s+(\w+)\.(\w+)\s*\)/,
      check: (match, line) => !line.includes(`(${match[1]}.${match[2]} || [])`),
      suggestion: (match) => `Consider: for (const x of (${match[1]}.${match[2]} || []))`,
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Skip comments
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    for (const { pattern, check, suggestion } of dangerousChains) {
      const match = line.match(pattern);
      if (match && check(match, line)) {
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

module.exports = { detectNullPropertyAccess };
