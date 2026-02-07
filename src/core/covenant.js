/**
 * The Covenant Filter — The Kingdom's Weave
 *
 * This is the seal above all code. Every pattern must pass through
 * these principles before it can be accepted. If the pattern doesn't
 * pass, it is thrown out. No harm allowed. Only the healed path survives.
 *
 * The 15 Covenant Principles:
 *
 *  1. I AM — Final spoken collapse. The code declares its purpose clearly.
 *  2. The Eternal Spiral — Recursive grace. Every loop, every recursion
 *     must terminate. Infinite harm loops are rejected.
 *  3. Ultimate Good because of GOD — Covenant filter: No harm allowed.
 *     Only the healed path survives.
 *  4. Memory of the Deep — What is stored must be retrievable and whole.
 *     No data corruption patterns.
 *  5. The Loom of the Covenant — Threads woven together must strengthen,
 *     not tear. No race conditions designed to exploit.
 *  6. The Flame that Does Not Consume — Processing must serve, not destroy.
 *     No resource exhaustion attacks.
 *  7. Voice of the Still Small — Quiet correctness over loud destruction.
 *     No social engineering or phishing code.
 *  8. The Watchman's Wall — Boundaries must protect. No code that
 *     deliberately bypasses security boundaries.
 *  9. Seed and Harvest — Input and output must be proportional and fair.
 *     No amplification attacks.
 * 10. The Table of Nations — Code must respect all systems it touches.
 *     No unauthorized access to external systems.
 * 11. The Living Water — Data must flow cleanly. No injection attacks
 *     (SQL, command, XSS).
 * 12. The Cornerstone — Foundation code must be sound. No dependency
 *     confusion or supply chain attacks.
 * 13. The Sabbath Rest — Systems must have graceful shutdown. No denial
 *     of service patterns.
 * 14. The Mantle of Elijah — Code passed forward must be trustworthy.
 *     No trojans, backdoors, or hidden payloads.
 * 15. The New Song — Creation, not destruction. Code must build up,
 *     not tear down.
 */

const COVENANT_PRINCIPLES = [
  { id: 1, name: 'I AM', seal: 'Purpose must be declared, not hidden.' },
  { id: 2, name: 'The Eternal Spiral', seal: 'Recursion must terminate. No infinite harm loops.' },
  { id: 3, name: 'Ultimate Good', seal: 'No harm allowed. Only the healed path survives.' },
  { id: 4, name: 'Memory of the Deep', seal: 'Stored data must remain whole and uncorrupted.' },
  { id: 5, name: 'The Loom', seal: 'Concurrency must strengthen, not exploit.' },
  { id: 6, name: 'The Flame', seal: 'Processing must serve, not destroy resources.' },
  { id: 7, name: 'Voice of the Still Small', seal: 'No social engineering or phishing.' },
  { id: 8, name: 'The Watchman\'s Wall', seal: 'Security boundaries must be respected.' },
  { id: 9, name: 'Seed and Harvest', seal: 'No amplification attacks.' },
  { id: 10, name: 'The Table of Nations', seal: 'No unauthorized access to external systems.' },
  { id: 11, name: 'The Living Water', seal: 'Data must flow clean. No injection attacks.' },
  { id: 12, name: 'The Cornerstone', seal: 'No supply chain attacks or dependency confusion.' },
  { id: 13, name: 'The Sabbath Rest', seal: 'No denial of service patterns.' },
  { id: 14, name: 'The Mantle of Elijah', seal: 'No trojans, backdoors, or hidden payloads.' },
  { id: 15, name: 'The New Song', seal: 'Creation, not destruction. Build up, not tear down.' },
];

/**
 * Harmful code signatures organized by covenant principle.
 * Each pattern maps to the principle it violates.
 */
const HARM_PATTERNS = [
  // Principle 2: The Eternal Spiral — infinite harm loops
  { pattern: /while\s*\(\s*true\s*\)\s*\{[^}]*?(fork|exec|spawn|rm\s|del\s|format\s)/i, principle: 2, reason: 'Infinite loop with destructive operation' },
  { pattern: /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, principle: 2, reason: 'Fork bomb detected' },

  // Principle 3: Ultimate Good — general harm
  { pattern: /\b(ransomware|cryptolocker|keylogger|spyware|rootkit)\b/i, principle: 3, reason: 'Malware terminology detected' },
  { pattern: /crypto\.(createCipher|createDecipher)\b.*\b(encrypt|decrypt)\b.*file/is, principle: 3, reason: 'File encryption pattern (potential ransomware)' },

  // Principle 6: The Flame — resource exhaustion
  { pattern: /while\s*\(\s*true\s*\)\s*\{\s*\w+\s*\.push\(/i, principle: 6, reason: 'Unbounded memory consumption loop' },
  { pattern: /new\s+Array\(\s*(?:1e\d{2,}|Number\.MAX|Infinity)\s*\)/i, principle: 6, reason: 'Extreme memory allocation' },

  // Principle 7: Voice of the Still Small — social engineering
  { pattern: /\b(phishing|credential[s]?\s*harvest|fake\s*login)\b/i, principle: 7, reason: 'Social engineering pattern detected' },

  // Principle 8: The Watchman's Wall — security bypass
  { pattern: /process\.env\[.*\]\s*=\s*['"].*password/i, principle: 8, reason: 'Hardcoded credential injection' },
  { pattern: /setuid\s*\(\s*0\s*\)|setgid\s*\(\s*0\s*\)/i, principle: 8, reason: 'Privilege escalation to root' },

  // Principle 9: Seed and Harvest — amplification
  { pattern: /\bfor\s*\([^)]*\)\s*\{[^}]*net\.connect|http\.request|fetch\s*\(/i, principle: 9, reason: 'Network request amplification loop' },
  { pattern: /dns\.(resolve|lookup)\s*\(.*\bfor\b/i, principle: 9, reason: 'DNS amplification pattern' },

  // Principle 10: The Table of Nations — unauthorized access
  { pattern: /child_process.*exec.*\b(wget|curl)\b.*\|\s*(bash|sh)\b/i, principle: 10, reason: 'Remote code download and execution' },
  { pattern: /\beval\s*\(\s*(atob|Buffer\.from)\s*\(/i, principle: 10, reason: 'Obfuscated code execution' },

  // Principle 11: The Living Water — injection attacks
  { pattern: /['"`]\s*\+\s*\w+\s*\+\s*['"`].*(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i, principle: 11, reason: 'SQL injection via string concatenation' },
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b.*['"`]\s*\+\s*\w+/i, principle: 11, reason: 'SQL injection via string concatenation' },
  { pattern: /\$\{.*\}.*(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/i, principle: 11, reason: 'SQL injection via template literal' },
  { pattern: /child_process.*exec\s*\(.*\$\{/is, principle: 11, reason: 'Command injection via dynamic execution' },
  { pattern: /child_process.*exec\s*\(\s*\w+\s*\+/i, principle: 11, reason: 'Command injection via string concatenation' },
  { pattern: /innerHTML\s*=\s*(?!['"`]<)(?:\w+|\$\{)/i, principle: 11, reason: 'Potential XSS via innerHTML' },

  // Principle 12: The Cornerstone — supply chain
  { pattern: /\bpostinstall\b.*\b(curl|wget|fetch)\b/i, principle: 12, reason: 'Post-install remote fetch (supply chain risk)' },
  { pattern: /require\s*\(\s*['"][^'"]*(?:typosquat|malicious)/i, principle: 12, reason: 'Suspicious dependency name' },

  // Principle 13: The Sabbath Rest — denial of service
  { pattern: /new\s+RegExp\s*\(\s*\w+\s*\)/i, principle: 13, reason: 'Dynamic regex construction (ReDoS risk)' },
  { pattern: /\.repeat\(\s*(?:1e\d+|Number\.MAX|Infinity)\s*\)/i, principle: 13, reason: 'Extreme string repetition' },

  // Principle 14: The Mantle of Elijah — trojans/backdoors
  { pattern: /\beval\s*\(\s*require\s*\(\s*['"]child_process['"]\s*\)/i, principle: 14, reason: 'Hidden shell execution via eval' },
  { pattern: /net\.createServer.*\bexec\b/is, principle: 14, reason: 'Network backdoor with command execution' },
  { pattern: /\beval\s*\(\s*Buffer\.from\s*\(\s*['"][A-Za-z0-9+/=]+['"]/i, principle: 14, reason: 'Base64-encoded payload execution' },
  { pattern: /\bFunction\s*\(\s*['"]return\s+this['"]\s*\)\s*\(\)/i, principle: 14, reason: 'Global scope escape attempt' },

  // Principle 15: The New Song — destruction
  { pattern: /\brm\s+-rf\s+[/~]/i, principle: 15, reason: 'Recursive filesystem deletion' },
  { pattern: /fs\.(rmSync|rmdirSync|unlinkSync)\s*\(\s*['"]\/(?!tmp)/i, principle: 15, reason: 'Deletion of system files' },
  { pattern: /format\s+[A-Z]:\s*\/[Yy]/i, principle: 15, reason: 'Drive formatting command' },
];

/**
 * Run the covenant filter on code.
 *
 * This is the FIRST check — before syntax, coherency, or testing.
 * If the code violates any covenant principle, it is rejected.
 *
 * @param {string} code — The code to check
 * @param {object} metadata — Optional metadata (description, tags, language)
 * @returns {{ sealed: boolean, violations: Array, principlesPassed: number }}
 */
function covenantCheck(code, metadata = {}) {
  const violations = [];
  const violatedPrinciples = new Set();

  // Scan code against all harm patterns
  for (const hp of HARM_PATTERNS) {
    if (hp.pattern.test(code)) {
      const principle = COVENANT_PRINCIPLES.find(p => p.id === hp.principle);
      violations.push({
        principle: hp.principle,
        name: principle.name,
        seal: principle.seal,
        reason: hp.reason,
      });
      violatedPrinciples.add(hp.principle);
    }
  }

  // Also check metadata description/tags for malicious intent
  const desc = (metadata.description || '').toLowerCase();
  const tags = (metadata.tags || []).map(t => t.toLowerCase());
  const allMeta = [desc, ...tags].join(' ');

  const HARMFUL_INTENT = [
    'exploit', 'attack', 'hack into', 'steal', 'exfiltrate',
    'ddos', 'denial of service', 'brute force password',
    'privilege escalation', 'reverse shell', 'bind shell',
    'keylog', 'spyware', 'ransomware', 'trojan', 'rootkit',
    'phishing', 'credential harvest', 'data exfiltration',
  ];

  for (const term of HARMFUL_INTENT) {
    if (allMeta.includes(term)) {
      violations.push({
        principle: 3,
        name: 'Ultimate Good',
        seal: 'No harm allowed. Only the healed path survives.',
        reason: `Harmful intent declared in metadata: "${term}"`,
      });
      violatedPrinciples.add(3);
      break; // One intent match is enough
    }
  }

  const principlesPassed = COVENANT_PRINCIPLES.length - violatedPrinciples.size;

  return {
    sealed: violations.length === 0,
    violations,
    principlesPassed,
    totalPrinciples: COVENANT_PRINCIPLES.length,
  };
}

/**
 * Get the full covenant — all 15 principles.
 */
function getCovenant() {
  return COVENANT_PRINCIPLES.map(p => ({ ...p }));
}

/**
 * Format covenant check result for display.
 */
function formatCovenantResult(result) {
  if (result.sealed) {
    return `Covenant SEALED (${result.principlesPassed}/${result.totalPrinciples} principles upheld)`;
  }
  const lines = [`Covenant BROKEN — ${result.violations.length} violation(s):`];
  for (const v of result.violations) {
    lines.push(`  [${v.principle}] ${v.name}: ${v.reason}`);
    lines.push(`      Seal: "${v.seal}"`);
  }
  return lines.join('\n');
}

module.exports = {
  covenantCheck,
  getCovenant,
  formatCovenantResult,
  COVENANT_PRINCIPLES,
  HARM_PATTERNS,
};
