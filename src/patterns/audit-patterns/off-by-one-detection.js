/**
 * Bug Detection Pattern: Off-by-One Errors
 *
 * Detects common off-by-one patterns in loops, array access, and
 * retry/counter logic.
 *
 * Examples of buggy code:
 *   if (retries + 1 >= MAX)    // inconsistent with retries >= MAX elsewhere
 *   for (i = 0; i <= arr.length; i++)  // should be < not <=
 *   arr.slice(0, 3) vs arr.slice(1, 4) // inconsistent slicing in same context
 *
 * @pattern off-by-one-detection
 * @category bug-detection
 * @tags off-by-one, loop-bounds, counter-errors
 */

/**
 * Detect potential off-by-one errors in code.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, pattern: string, warning: string}>}
 */
function detectOffByOne(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;

    // Pattern: i <= array.length (should usually be <)
    const arrayBound = line.match(/(\w+)\s*<=\s*(\w+)\.length\b/);
    if (arrayBound && /for\s*\(/.test(line)) {
      warnings.push({
        line: i + 1,
        pattern: arrayBound[0],
        warning: `Array bounds: ${arrayBound[1]} <= ${arrayBound[2]}.length may cause out-of-bounds access. Use < instead.`,
      });
    }

    // Pattern: x + 1 >= MAX inconsistent with x >= MAX nearby
    const plusOneCompare = line.match(/(\w+)\s*\+\s*1\s*>=\s*(\w+)/);
    if (plusOneCompare) {
      // Look in nearby lines for the same variable compared without +1
      const varName = plusOneCompare[1];
      const maxName = plusOneCompare[2];
      const context = lines.slice(Math.max(0, i - 10), Math.min(lines.length, i + 10)).join('\n');
      const directCompare = new RegExp(`${varName}\\s*>=\\s*${maxName}(?!\\.)`, 'g');
      if (directCompare.test(context)) {
        warnings.push({
          line: i + 1,
          pattern: plusOneCompare[0],
          warning: `Inconsistent comparison: "${varName} + 1 >= ${maxName}" found near "${varName} >= ${maxName}". One may be off by one.`,
        });
      }
    }
  }

  return warnings;
}

module.exports = { detectOffByOne };
