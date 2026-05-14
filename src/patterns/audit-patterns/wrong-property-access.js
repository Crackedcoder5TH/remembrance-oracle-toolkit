/**
 * Bug Detection Pattern: Wrong Property Name Access
 *
 * Detects code that accesses properties that don't match the actual
 * return type of a function or API. Often caused by API changes or
 * assumptions about return shapes.
 *
 * Examples of buggy code:
 *   result.improved           // actual property: result.reflection.improvement
 *   response.data.items       // actual property: response.data.results
 *   config.timeout            // actual property: config.timeoutMs
 *
 * Detection strategy:
 * - Track function return types via JSDoc @returns or explicit return statements
 * - Flag property accesses that don't match known return shapes
 * - Especially dangerous after refactoring when return types change
 *
 * @pattern wrong-property-access
 * @category bug-detection
 * @tags property-access, api-mismatch, refactoring-bug
 */

/**
 * Detect potential wrong property accesses by comparing
 * what a function returns vs how its result is used.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, access: string, warning: string}>}
 */
function detectWrongPropertyAccess(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  // Common patterns of wrong property access
  const suspiciousPatterns = [
    // Accessing .improved on reflection result (should be .reflection.improvement)
    { pattern: /\.improved\b/, context: /reflection|refine|heal/, warning: 'Possibly wrong: .improved may be .reflection.improvement' },
    // Accessing .data without checking if the response has data
    { pattern: /\.data\./, context: /response|result|res/, warning: 'Verify .data exists in the response shape' },
    // Negation check on a number (should use <= 0 or === 0)
    { pattern: /!\w+\.(?:improvement|score|count|total)\b/, context: /if\s*\(/, warning: 'Negating a number property — use <= 0 or === 0 for clarity' },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    for (const { pattern, context, warning } of suspiciousPatterns) {
      if (pattern.test(line) && context.test(line)) {
        warnings.push({ line: i + 1, access: line.trim(), warning });
      }
    }
  }

  return warnings;
}

module.exports = { detectWrongPropertyAccess };
