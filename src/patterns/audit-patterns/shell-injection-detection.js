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

  // Database handles also expose .exec() — a db handle running an
  // interpolated query is a SQL-injection question for the taint-aware
  // security checker, not a shell question for this detector. Claiming it
  // here double-reports the AST checker's territory with none of its
  // sanitizer awareness.
  const DB_RECEIVER = /(?:\b(?:db|database|sqlite|conn|connection|stmt|tx)\s*\.\s*)exec(?:Sync)?\s*\(/;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.trim().startsWith('//') || line.trim().startsWith('*')) continue;
    if (DB_RECEIVER.test(line)) continue;

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

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
detectShellInjection.atomicProperties = { charge: 0, valence: 1, mass: "heavy", spin: "even", phase: "liquid", reactivity: "medium", electronegativity: 1, group: 3, period: 3, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };
