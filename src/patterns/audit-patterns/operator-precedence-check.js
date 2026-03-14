/**
 * Bug Detection Pattern: Operator Precedence Errors
 *
 * Detects expressions where operator precedence may produce unexpected results.
 * Multiplication/division bind tighter than addition/subtraction, causing
 * common bugs in mathematical expressions.
 *
 * Examples of buggy code:
 *   Math.round(1 - x - y * 100) / 100    // * binds to y only, not (1 - x - y)
 *   total + count * rate / 100             // * and / bind before +
 *   value - offset * scale + bias          // * binds to offset only
 *
 * Safe alternatives:
 *   Math.round((1 - x - y) * 100) / 100   // explicit grouping
 *   total + (count * rate) / 100            // or: (total + count * rate) / 100
 *
 * @pattern operator-precedence-check
 * @category bug-detection
 * @tags operator-precedence, math-bug, parentheses
 */

/**
 * Detect potential operator precedence issues in expressions.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, expression: string, warning: string}>}
 */
function detectPrecedenceIssues(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Pattern: Math.round(expr1 +/- expr2 * number) / number
    // where the * should apply to (expr1 +/- expr2) but doesn't
    const mathRoundBug = line.match(/Math\.round\s*\(([^)]*[\+\-][^)]*\*\s*\d+)\s*\)\s*\/\s*\d+/);
    if (mathRoundBug) {
      const inner = mathRoundBug[1];
      // Check if there are parentheses around the + or - operands
      // Check if parens are absent, or if existing parens come before +/- operators
      const lastParen = inner.lastIndexOf('(');
      const lastPlus = inner.lastIndexOf('+');
      const lastMinus = inner.lastIndexOf('-');
      if (!inner.includes('(') || (lastParen < lastPlus || lastParen < lastMinus)) {
        warnings.push({
          line: i + 1,
          expression: mathRoundBug[0],
          warning: 'Potential precedence bug: * binds tighter than +/- inside Math.round(). Consider adding parentheses.',
        });
      }
    }

    // Pattern: mixed +/- and * without parentheses in assignments
    const mixedOps = line.match(/=\s*([^;]*(?:\+|-)\s*\w+\s*\*\s*\w+[^;]*);/);
    if (mixedOps && !mixedOps[1].includes('(')) {
      // Only warn if it looks like a computation, not a string concat
      if (!/['"`]/.test(mixedOps[1])) {
        warnings.push({
          line: i + 1,
          expression: mixedOps[0],
          warning: 'Mixed +/- and * without parentheses. Verify operator precedence is intentional.',
        });
      }
    }
  }

  return warnings;
}

module.exports = { detectPrecedenceIssues };
