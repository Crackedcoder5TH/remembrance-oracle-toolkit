/**
 * Bug Detection Pattern: Shell Injection via String Interpolation
 *
 * Detects code that interpolates user input into shell command strings
 * via execSync, exec, or similar APIs. This is one of the most dangerous
 * security vulnerabilities.
 *
 * Examples of vulnerable code:
 *   execSync(`git diff ${range}`)           // range from user input
 *   execSync(args.join(' '))                 // args array joined into shell string
 *   execSync(`command "${userInput}"`)       // quoted but still injectable
 *   require('${path}')  inside shell script // path injection in generated scripts
 *
 * Safe alternatives:
 *   execFileSync('git', ['diff', range])     // no shell invocation
 *   validate range against /^[\w.~^/]+$/     // input validation
 *   JSON.stringify(path) in generated code   // proper escaping
 *
 * @pattern shell-injection-detection
 * @category bug-detection
 * @tags security, shell-injection, command-injection, execSync
 */

/**
 * Detect potential shell injection patterns in code.
 *
 * @param {string} code - Source code to analyze
 * @returns {Array<{line: number, pattern: string, suggestion: string}>}
 */
function detectShellInjection(code) {
  if (!code || typeof code !== 'string') return [];

  const warnings = [];
  const lines = code.split('\n');

  const patterns = [
    {
      // execSync with template literal containing interpolation
      pattern: /exec(?:Sync)?\s*\(\s*`[^`]*\$\{/,
      suggestion: () => 'Use execFileSync with argument array instead of execSync with template literals',
    },
    {
      // execSync with string concatenation
      pattern: /exec(?:Sync)?\s*\([^)]*\+[^)]*\)/,
      suggestion: () => 'Use execFileSync with argument array instead of string concatenation in shell commands',
    },
    {
      // args.join(' ') passed to execSync
      pattern: /exec(?:Sync)?\s*\(\s*\w+\.join\s*\(\s*['"] ['"]?\s*\)/,
      suggestion: () => 'Use execFileSync(cmd, args) instead of execSync(args.join(" "))',
    },
    {
      // require('${path}') inside template literal (generated scripts)
      pattern: /require\s*\(\s*'\$\{/,
      suggestion: () => 'Use JSON.stringify(path) for paths in generated code to prevent injection',
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

module.exports = { detectShellInjection };
