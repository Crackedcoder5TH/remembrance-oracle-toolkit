/**
 * Bug Detection Pattern: Falsy Zero Coercion
 *
 * Detects code that uses || to provide defaults for numeric values,
 * which silently treats 0 as missing. Common in config parsing,
 * threshold values, and version numbers.
 *
 * Examples of vulnerable code:
 *   parseInt(args.version) || undefined     // version 0 becomes undefined
 *   parseFloat(args.threshold) || 0.85      // threshold 0 becomes 0.85
 *   context.coherencyBefore || null         // coherency 0 becomes null
 *   node.value || node.name || ''           // value 0 is silently dropped
 *
 * Safe alternatives:
 *   args.version != null ? parseInt(args.version) : undefined
 *   args.threshold != null ? parseFloat(args.threshold) : 0.85
 *   context.coherencyBefore ?? null
 *   node.value != null ? String(node.value) : (node.name || '')
 *
 * @pattern falsy-zero-coercion
 * @category bug-detection
 * @tags type-coercion, falsy-zero, numeric-default, operator-misuse
 */

/**
 * Detect falsy-zero coercion patterns in code.
 * Returns an array of warnings with line numbers and suggestions.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, pattern: string, suggestion: string}>}
 */
function detectFalsyZeroCoercion(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  const patterns = [
    {
      // parseInt/parseFloat(...) || default
      pattern: /(?:parseInt|parseFloat)\s*\([^)]*\)\s*\|\|\s*(?:\d|undefined|null|'[^']*'|"[^"]*")/,
      suggestion: (match) => `Use ternary with != null check instead of || to preserve zero: val != null ? parse(val) : default`,
    },
    {
      // .property || null/0/default (where property could be numeric)
      pattern: /(?:coherency|score|count|total|version|threshold|weight|rate|index)\w*\s*\|\|\s*(?:null|0|undefined|\d+)/i,
      suggestion: () => `Use ?? (nullish coalescing) instead of || for numeric properties that can legitimately be 0`,
    },
    {
      // node.value || node.name || '' (AST value loss)
      pattern: /\.value\s*\|\|\s*\w+\.(?:name|label|text)\s*\|\|\s*['"]{2}/,
      suggestion: () => `Use: node.value != null ? String(node.value) : (node.name || '')`,
    },
  ];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    for (const { pattern, suggestion } of patterns) {
      const match = line.match(pattern);
      if (match) {
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

module.exports = { detectFalsyZeroCoercion };
