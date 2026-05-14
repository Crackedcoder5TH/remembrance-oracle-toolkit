/**
 * Bug Detection Pattern: Security Scan False Positives from Raw Code
 *
 * Detects security scanners that check raw code (including string
 * literals and comments) instead of stripping them first. This causes
 * false positives when strings contain security-related keywords.
 *
 * Examples of vulnerable code:
 *   code.match(dangerPattern)            // matches strings and comments too
 *   if (test.test(code)) findings.push   // code has string literals
 *
 * Safe alternatives:
 *   const stripped = stripStringsAndComments(code);
 *   stripped.match(dangerPattern)         // only matches actual code
 *
 * @pattern security-scan-bypass
 * @category bug-detection
 * @tags security, false-positive, static-analysis, string-stripping
 */

/**
 * Detect security scan patterns that operate on raw code without stripping strings.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, pattern: string, suggestion: string}>}
 */
function detectSecurityScanBypass(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  // Look for functions that scan code for security patterns
  // Track function boundaries via brace depth so we reset at function end
  let inSecurityScanFn = false;
  let hasStripCall = false;
  let fnBraceDepth = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (/(?:function\s+|const\s+|let\s+|var\s+)\w*(?:[Ss]ecurity|[Ss]can|[Aa]udit|[Vv]alidat|[Cc]heck|[Dd]etect|[Aa]nalyz)\w*/.test(line)) {
      inSecurityScanFn = true;
      hasStripCall = false;
      fnBraceDepth = 0;
    }

    if (inSecurityScanFn) {
      // Track brace depth to detect function boundary end
      fnBraceDepth += (line.match(/\{/g) || []).length;
      fnBraceDepth -= (line.match(/\}/g) || []).length;

      if (/strip(?:Strings|Comments|Literals)|removeComments|cleanCode/.test(line)) {
        hasStripCall = true;
      }
      // Check for pattern matching on raw code parameter
      if (/code\.match\(|\.test\(code\)/.test(line) && !hasStripCall) {
        warnings.push({
          line: i + 1,
          pattern: line.trim().slice(0, 80),
          suggestion: 'Strip string literals and comments before security pattern matching to avoid false positives',
        });
      }

      // Reset when function body closes
      if (fnBraceDepth <= 0) {
        inSecurityScanFn = false;
      }
    }
  }

  return warnings;
}

module.exports = { detectSecurityScanBypass };
