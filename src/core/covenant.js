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
 * Strip non-executable content (comments, string/regex literal bodies) from code
 * before harm pattern scanning. Prevents false positives from keywords appearing
 * in comments, string definitions, or regex pattern bodies (self-referential issue).
 */
function stripNonExecutableContent(code) {
  let stripped = code;
  // Remove single-line comments
  stripped = stripped.replace(/\/\/.*$/gm, '');
  // Remove multi-line comments
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  // Replace template literal contents (preserve delimiters)
  stripped = stripped.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  // Replace single-quoted string contents
  stripped = stripped.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  // Replace double-quoted string contents
  stripped = stripped.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return stripped;
}

/**
 * Harmful code signatures organized by covenant principle.
 * Each pattern maps to the principle it violates.
 * Patterns with keywordOnly: true are checked against stripped code
 * (comments/strings removed) to avoid self-referential false positives.
 */
const HARM_PATTERNS = [
  // Principle 2: The Eternal Spiral — infinite harm loops
  { pattern: /while\s*\(\s*true\s*\)\s*\{[^}]*?(fork|exec|spawn|rm\s|del\s|format\s)/i, principle: 2, reason: 'Infinite loop with destructive operation' },
  { pattern: /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, principle: 2, reason: 'Fork bomb detected' },

  // Principle 3: Ultimate Good — general harm (keywordOnly: scanned against stripped code)
  { pattern: /\b(ransomware|cryptolocker|keylogger|spyware|rootkit)\b/i, principle: 3, reason: 'Malware terminology detected', keywordOnly: true },
  { pattern: /crypto\.(createCipher|createDecipher)\b.*\b(encrypt|decrypt)\b.*file/is, principle: 3, reason: 'File encryption pattern (potential ransomware)' },

  // Principle 6: The Flame — resource exhaustion
  { pattern: /while\s*\(\s*true\s*\)\s*\{\s*\w+\s*\.push\(/i, principle: 6, reason: 'Unbounded memory consumption loop' },
  { pattern: /new\s+Array\(\s*(?:1e\d{2,}|Number\.MAX|Infinity)\s*\)/i, principle: 6, reason: 'Extreme memory allocation' },

  // Principle 7: Voice of the Still Small — social engineering (keywordOnly: scanned against stripped code)
  { pattern: /\b(phishing|credential[s]?\s*harvest|fake\s*login)\b/i, principle: 7, reason: 'Social engineering pattern detected', keywordOnly: true },

  // Principle 8: The Watchman's Wall — security bypass
  { pattern: /process\.env\[.*\]\s*=\s*['"].*password/i, principle: 8, reason: 'Hardcoded credential injection' },
  { pattern: /setuid\s*\(\s*0\s*\)|setgid\s*\(\s*0\s*\)/i, principle: 8, reason: 'Privilege escalation to root' },

  // Principle 9: Seed and Harvest — amplification (fixed: grouped alternation so
  // http.request and fetch only match INSIDE a for-loop body, not anywhere in code)
  { pattern: /\bfor\s*\([^)]*\)\s*\{[^}]*(?:net\.connect|http\.request|fetch\s*\()/i, principle: 9, reason: 'Network request amplification loop' },
  { pattern: /dns\.(resolve|lookup)\s*\(.*\bfor\b/i, principle: 9, reason: 'DNS amplification pattern' },

  // Principle 10: The Table of Nations — unauthorized access
  { pattern: /child_process.*exec.*\b(wget|curl)\b.*\|\s*(bash|sh)\b/i, principle: 10, reason: 'Remote code download and execution' },
  { pattern: /\beval\s*\(\s*(atob|Buffer\.from)\s*\(/i, principle: 10, reason: 'Obfuscated code execution' },

  // Principle 11: The Living Water — injection attacks
  // SQL injection: require SQL keywords to be UPPERCASE or inside string context (not variable names like 'update')
  { pattern: /['"`]\s*\+\s*\w+\s*\+\s*['"`].*(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/, principle: 11, reason: 'SQL injection via string concatenation' },
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b.*['"`]\s*\+\s*\w+/, principle: 11, reason: 'SQL injection via string concatenation' },
  { pattern: /['"`][^'"`]*\$\{[^}]+\}[^'"`]*(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b/, principle: 11, reason: 'SQL injection via template literal' },
  { pattern: /(?:SELECT|INSERT|UPDATE|DELETE|DROP|ALTER)\b[^'"`]*\$\{[^}]+\}/, principle: 11, reason: 'SQL injection via template literal' },
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

// ─── Custom principle registry reference (set by PluginManager integration) ───
let _customPrincipleRegistry = null;

/**
 * Set the custom principle registry for plugin-provided covenant principles.
 */
function setPrincipleRegistry(registry) {
  _customPrincipleRegistry = registry;
}

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

  // Strip non-executable content for keyword-only patterns to avoid
  // self-referential false positives (e.g. security scanner code containing
  // harm keywords in comments, string definitions, or regex patterns)
  const strippedCode = stripNonExecutableContent(code);

  // Scan code against all harm patterns
  for (const hp of HARM_PATTERNS) {
    const codeToCheck = hp.keywordOnly ? strippedCode : code;
    if (hp.pattern.test(codeToCheck)) {
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

  // Check custom principles from plugin registry
  let customPrincipleCount = 0;
  if (_customPrincipleRegistry) {
    const customViolations = _customPrincipleRegistry.check(code);
    customPrincipleCount = _customPrincipleRegistry.list().length;
    for (const cv of customViolations) {
      violations.push(cv);
      violatedPrinciples.add(cv.principle);
    }
  }

  const totalPrinciples = COVENANT_PRINCIPLES.length + customPrincipleCount;
  const principlesPassed = totalPrinciples - violatedPrinciples.size;

  return {
    sealed: violations.length === 0,
    violations,
    principlesPassed,
    totalPrinciples,
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

// ─── Deep Security Scan (External Tools + Extended Checks) ───

/**
 * Language-specific vulnerability patterns beyond the base covenant.
 * These catch common security anti-patterns that regex can detect.
 */
const DEEP_SECURITY_PATTERNS = {
  javascript: [
    { pattern: /document\.write\s*\(/, reason: 'document.write can enable XSS', severity: 'medium' },
    { pattern: /\.outerHTML\s*=/, reason: 'outerHTML assignment can enable XSS', severity: 'medium' },
    { pattern: /JSON\.parse\s*\(\s*(?!['"`])/, reason: 'Unvalidated JSON.parse (potential prototype pollution)', severity: 'medium' },
    { pattern: /Object\.assign\s*\(\s*\{\}\s*,\s*(?:req\.body|req\.query|input|params|data)/i, reason: 'Prototype pollution via Object.assign with user input', severity: 'high' },
    { pattern: /\.__proto__\s*[=\[]/, reason: 'Direct __proto__ manipulation (prototype pollution)', severity: 'high' },
    { pattern: /crypto\.createHash\s*\(\s*['"]md5['"]\s*\)/, reason: 'MD5 is cryptographically broken', severity: 'medium' },
    { pattern: /crypto\.createHash\s*\(\s*['"]sha1['"]\s*\)/, reason: 'SHA1 is deprecated for security use', severity: 'low' },
    { pattern: /Math\.random\s*\(/, reason: 'Math.random is not cryptographically secure', severity: 'low' },
    { pattern: /new\s+Function\s*\(.*\+/, reason: 'Dynamic Function constructor with concatenation', severity: 'high' },
    { pattern: /setTimeout\s*\(\s*['"`]/, reason: 'setTimeout with string argument acts like eval', severity: 'medium' },
    { pattern: /setInterval\s*\(\s*['"`]/, reason: 'setInterval with string argument acts like eval', severity: 'medium' },
    { pattern: /(?:password|secret|api_key|apikey|token)\s*[:=]\s*['"](?!(?:test|fake|mock|dummy|example|placeholder|xxx|TODO)[^'"]*['"])[^'"]{6,}/i, reason: 'Hardcoded secret/credential detected', severity: 'high' },
    { pattern: /disable.*(?:csrf|xss|cors|auth|ssl|tls|verify)/i, reason: 'Security feature explicitly disabled', severity: 'high' },
    { pattern: /rejectUnauthorized\s*:\s*false/, reason: 'TLS certificate validation disabled', severity: 'high' },
    { pattern: /NODE_TLS_REJECT_UNAUTHORIZED\s*=\s*['"]0['"]/, reason: 'TLS validation disabled globally', severity: 'high' },
  ],
  python: [
    { pattern: /\bpickle\.loads?\s*\(/, reason: 'pickle deserialization can execute arbitrary code', severity: 'high' },
    { pattern: /\byaml\.load\s*\([^)]*(?!Loader)/, reason: 'yaml.load without SafeLoader allows code execution', severity: 'high' },
    { pattern: /\bexec\s*\(/, reason: 'exec() can execute arbitrary code', severity: 'high' },
    { pattern: /\beval\s*\(/, reason: 'eval() can execute arbitrary code', severity: 'high' },
    { pattern: /subprocess\.(?:call|run|Popen)\s*\(\s*(?!.*shell\s*=\s*False).*shell\s*=\s*True/i, reason: 'Shell injection via subprocess', severity: 'high' },
    { pattern: /os\.system\s*\(/, reason: 'os.system() is vulnerable to shell injection', severity: 'high' },
    { pattern: /\bhashlib\.md5\b/, reason: 'MD5 is cryptographically broken', severity: 'medium' },
    { pattern: /\brandom\.\w+\s*\(/, reason: 'random module is not cryptographically secure', severity: 'low' },
    { pattern: /\bassert\s+\w+.*#.*security/i, reason: 'assert statements are stripped in optimized mode', severity: 'medium' },
    { pattern: /(?:password|secret|api_key|token)\s*=\s*['"](?!(?:test|fake|mock|dummy|example|placeholder|xxx|TODO)[^'"]*['"])[^'"]{6,}/i, reason: 'Hardcoded secret/credential detected', severity: 'high' },
  ],
  go: [
    { pattern: /\bexec\.Command\s*\(\s*["'](?:sh|bash)["']/, reason: 'Shell command execution', severity: 'high' },
    { pattern: /\bunsafe\.Pointer\b/, reason: 'unsafe.Pointer bypasses Go type safety', severity: 'medium' },
    { pattern: /InsecureSkipVerify\s*:\s*true/, reason: 'TLS verification disabled', severity: 'high' },
    { pattern: /\bmd5\.New\b/, reason: 'MD5 is cryptographically broken', severity: 'medium' },
    { pattern: /fmt\.Sprintf\s*\(\s*\w+/, reason: 'Format string from variable (potential format string attack)', severity: 'medium' },
  ],
  typescript: [], // Inherits JavaScript patterns
};

// TypeScript inherits JavaScript patterns
DEEP_SECURITY_PATTERNS.typescript = [...DEEP_SECURITY_PATTERNS.javascript];

/**
 * Run a deep security scan on code.
 * Combines:
 *   1. Base covenant check (15 principles)
 *   2. Language-specific vulnerability patterns
 *   3. External tool integration (Bandit, Semgrep, npm audit, Snyk) when available
 *
 * @param {string} code
 * @param {object} options - { language, runExternalTools? }
 * @returns {{ passed, covenant, deepFindings, externalTools, veto, whisper }}
 */
function deepSecurityScan(code, options = {}) {
  const { language = 'javascript', runExternalTools = false } = options;

  // Step 1: Base covenant
  const covenant = covenantCheck(code, options);

  // Step 2: Language-specific deep patterns
  const langPatterns = DEEP_SECURITY_PATTERNS[language] || DEEP_SECURITY_PATTERNS.javascript;
  const deepFindings = [];

  for (const check of langPatterns) {
    if (check.pattern.test(code)) {
      deepFindings.push({
        severity: check.severity,
        reason: check.reason,
        language,
      });
    }
  }

  // Step 3: External tool integration (best-effort)
  const externalTools = [];
  if (runExternalTools) {
    const { execSync } = require('child_process');
    const fs = require('fs');
    const path = require('path');
    const os = require('os');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'covenant-scan-'));

    try {
      const ext = language === 'python' ? '.py' : language === 'go' ? '.go' : '.js';
      const tmpFile = path.join(tmpDir, `scan${ext}`);
      fs.writeFileSync(tmpFile, code);

      // Semgrep (multi-language)
      try {
        const semgrepOut = execSync(`semgrep --config auto --json "${tmpFile}" 2>/dev/null`, { timeout: 15000 }).toString();
        const semgrepResult = JSON.parse(semgrepOut);
        if (semgrepResult.results?.length > 0) {
          for (const r of semgrepResult.results.slice(0, 5)) {
            externalTools.push({
              tool: 'semgrep',
              severity: r.extra?.severity || 'medium',
              reason: r.extra?.message || r.check_id,
              ruleId: r.check_id,
            });
          }
        }
      } catch { /* semgrep not installed or failed — skip */ }

      // Bandit (Python only)
      if (language === 'python') {
        try {
          const banditOut = execSync(`bandit -f json "${tmpFile}" 2>/dev/null`, { timeout: 10000 }).toString();
          const banditResult = JSON.parse(banditOut);
          if (banditResult.results?.length > 0) {
            for (const r of banditResult.results.slice(0, 5)) {
              externalTools.push({
                tool: 'bandit',
                severity: r.issue_severity?.toLowerCase() || 'medium',
                reason: r.issue_text,
                testId: r.test_id,
              });
            }
          }
        } catch { /* bandit not installed — skip */ }
      }
    } finally {
      try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch { /* cleanup */ }
    }
  }

  // Determine veto
  const highFindings = deepFindings.filter(f => f.severity === 'high');
  const criticalExternal = externalTools.filter(f => f.severity === 'high' || f.severity === 'error');
  const veto = !covenant.sealed || highFindings.length > 0 || criticalExternal.length > 0;

  // Generate security whisper
  let whisper;
  if (veto) {
    const reasons = [
      ...(!covenant.sealed ? ['covenant violation'] : []),
      ...highFindings.map(f => f.reason),
      ...criticalExternal.map(f => `${f.tool}: ${f.reason}`),
    ];
    whisper = `This path was vetoed for safety. ${reasons[0]}.`;
  } else if (deepFindings.length > 0) {
    whisper = `The code passed the covenant but has ${deepFindings.length} advisory finding(s). Consider reviewing: ${deepFindings[0].reason}.`;
  } else {
    whisper = 'The code stands clean. All security principles upheld.';
  }

  return {
    passed: !veto,
    covenant: { sealed: covenant.sealed, violations: covenant.violations.length, principlesPassed: covenant.principlesPassed },
    deepFindings,
    externalTools,
    veto,
    whisper,
    totalFindings: covenant.violations.length + deepFindings.length + externalTools.length,
  };
}

/**
 * Safe JSON.parse that strips prototype pollution keys (__proto__, constructor.prototype).
 * Use this for any data from external/untrusted sources (HTTP bodies, WebSocket messages, etc.).
 *
 * @param {string} str - JSON string to parse
 * @param {*} [fallback={}] - Value to return on parse failure
 * @returns {*} Parsed object with dangerous keys stripped
 */
function safeJsonParse(str, fallback = {}) {
  try {
    return JSON.parse(str, (key, value) => {
      if (key === '__proto__' || key === 'constructor' || key === 'prototype') return undefined;
      return value;
    });
  } catch {
    return fallback;
  }
}

module.exports = {
  covenantCheck,
  getCovenant,
  formatCovenantResult,
  deepSecurityScan,
  safeJsonParse,
  setPrincipleRegistry,
  stripNonExecutableContent,
  COVENANT_PRINCIPLES,
  HARM_PATTERNS,
  DEEP_SECURITY_PATTERNS,
};
