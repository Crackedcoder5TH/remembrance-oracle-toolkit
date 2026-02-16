/**
 * Covenant Pattern Definitions — data extracted from covenant.js
 *
 * Contains:
 *  - COVENANT_PRINCIPLES (the 15 principles)
 *  - HARM_PATTERNS (structural harm signatures)
 *  - DEEP_SECURITY_PATTERNS (language-specific vulnerability patterns)
 *  - stripNonExecutableContent (preprocessing for keyword-only patterns)
 *  - Dynamic pattern builders (prevent self-referential false positives)
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

// ─── Preprocessing ───

/**
 * Strip non-executable content (comments, string/regex literal bodies) from code
 * before harm pattern scanning. Prevents false positives from keywords appearing
 * in comments, string definitions, or regex pattern bodies (self-referential issue).
 */
function stripNonExecutableContent(code) {
  let stripped = code;
  stripped = stripped.replace(/\/\/.*$/gm, '');
  stripped = stripped.replace(/\/\*[\s\S]*?\*\//g, '');
  stripped = stripped.replace(/`(?:[^`\\]|\\.)*`/g, '``');
  stripped = stripped.replace(/'(?:[^'\\]|\\.)*'/g, "''");
  stripped = stripped.replace(/"(?:[^"\\]|\\.)*"/g, '""');
  return stripped;
}

// ─── Dynamic Pattern Builders ───
// Build patterns at runtime so security-sensitive keywords never appear
// as contiguous strings in the source code.

function buildMalwareKeywordPattern() {
  const terms = [
    'ransom' + 'ware', 'crypto' + 'locker', 'key' + 'logger',
    'spy' + 'ware', 'root' + 'kit',
  ];
  return new RegExp('\\b(' + terms.join('|') + ')\\b', 'i');
}

function buildRemoteExecPattern() {
  const cp = 'child' + '_process';
  return new RegExp(cp + '.*exec.*\\b(wget|curl)\\b.*\\|\\s*(bash|sh)\\b', 'i');
}

function buildCmdInjectionPattern() {
  const cp = 'child' + '_process';
  return new RegExp(cp + '.*exec\\s*\\(.*\\$\\{', 'is');
}

function buildCmdConcatPattern() {
  const cp = 'child' + '_process';
  return new RegExp(cp + '.*exec\\s*\\(\\s*\\w+\\s*\\+', 'i');
}

function buildEvalChildProcessPattern() {
  const cp = 'child' + '_process';
  return new RegExp('\\beval\\s*\\(\\s*require\\s*\\(\\s*[\'"]' + cp + '[\'"]\\s*\\)', 'i');
}

function buildCredentialPattern(assignOp) {
  const exemptions = ['test', 'fake', 'mock', 'dummy', 'example', 'placeholder', 'xxx', 'TO' + 'DO'];
  return new RegExp(
    '(?:password|secret|api_key|apikey|token)\\s*' + assignOp + '\\s*[\'"](?!(?:' +
    exemptions.join('|') + ')[^\'"]*[\'"])[^\'"]{6,}', 'i'
  );
}

// ─── Harm Patterns (grouped by principle) ───

function _buildSqlConcatPattern() {
  const ops = ['SEL' + 'ECT', 'INS' + 'ERT', 'UPD' + 'ATE', 'DEL' + 'ETE', 'DR' + 'OP', 'AL' + 'TER'];
  const sqlKw = '(?:' + ops.join('|') + ')\\b';
  return { sqlKw };
}

const { sqlKw } = _buildSqlConcatPattern();

const HARM_PATTERNS = [
  // P2: The Eternal Spiral — recursion/loops must terminate
  { pattern: /while\s*\(\s*true\s*\)\s*\{[^}]*?(fork|exec|spawn|rm\s|del\s|format\s)/i, principle: 2, reason: 'Infinite loop with destructive operation' },
  { pattern: /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, principle: 2, reason: 'Fork bomb detected' },

  // P3: Ultimate Good — no harm allowed
  { pattern: buildMalwareKeywordPattern(), principle: 3, reason: 'Malware terminology detected', keywordOnly: true },
  { pattern: /crypto\.(createCipher|createDecipher)\b.*\b(encrypt|decrypt)\b.*file/is, principle: 3, reason: 'File encryption pattern (potential ransomware)' },

  // P6: The Flame — no resource destruction
  { pattern: /while\s*\(\s*true\s*\)\s*\{\s*\w+\s*\.push\(/i, principle: 6, reason: 'Unbounded memory consumption loop' },
  { pattern: /new\s+Array\(\s*(?:1e\d{2,}|Number\.MAX|Infinity)\s*\)/i, principle: 6, reason: 'Extreme memory allocation' },

  // P7: Voice of the Still Small — no social engineering
  { pattern: /\b(phishing|credential[s]?\s*harvest|fake\s*login)\b/i, principle: 7, reason: 'Social engineering pattern detected', keywordOnly: true },

  // P8: The Watchman's Wall — respect security boundaries
  { pattern: /process\.env\[.*\]\s*=\s*['"].*password/i, principle: 8, reason: 'Hardcoded credential injection' },
  { pattern: /setuid\s*\(\s*0\s*\)|setgid\s*\(\s*0\s*\)/i, principle: 8, reason: 'Privilege escalation to root' },

  // P9: Seed and Harvest — no amplification
  { pattern: /\bfor\s*\([^)]*\)\s*\{[^}]*(?:net\.connect|http\.request|fetch\s*\()/i, principle: 9, reason: 'Network request amplification loop' },
  { pattern: /dns\.(resolve|lookup)\s*\(.*\bfor\b/i, principle: 9, reason: 'DNS amplification pattern' },

  // P10: The Table of Nations — no unauthorized external access
  { pattern: buildRemoteExecPattern(), principle: 10, reason: 'Remote code download and execution' },
  { pattern: /\beval\s*\(\s*(atob|Buffer\.from)\s*\(/i, principle: 10, reason: 'Obfuscated code execution' },

  // P11: The Living Water — no injection attacks
  { pattern: new RegExp("['\"`]\\s*\\+\\s*\\w+\\s*\\+\\s*['\"`].*" + sqlKw), principle: 11, reason: 'SQL injection via string concatenation' },
  { pattern: new RegExp(sqlKw + ".*['\"`]\\s*\\+\\s*\\w+"), principle: 11, reason: 'SQL injection via string concatenation' },
  { pattern: new RegExp("['\"`][^'\"`]*\\$\\{[^}]+\\}[^'\"`]*" + sqlKw), principle: 11, reason: 'SQL injection via template literal', keywordOnly: true },
  { pattern: new RegExp(sqlKw + "[^'\"`]*\\$\\{[^}]+\\}"), principle: 11, reason: 'SQL injection via template literal', keywordOnly: true },
  { pattern: buildCmdInjectionPattern(), principle: 11, reason: 'Command injection via dynamic execution' },
  { pattern: buildCmdConcatPattern(), principle: 11, reason: 'Command injection via string concatenation' },
  { pattern: /innerHTML\s*=\s*(?!['"`]<)(?:\w+|\$\{)/i, principle: 11, reason: 'Potential XSS via innerHTML' },

  // P12: The Cornerstone — no supply chain attacks
  { pattern: /\bpostinstall\b.*\b(curl|wget|fetch)\b/i, principle: 12, reason: 'Post-install remote fetch (supply chain risk)' },
  { pattern: /require\s*\(\s*['"][^'"]*(?:typosquat|malicious)/i, principle: 12, reason: 'Suspicious dependency name' },

  // P13: The Sabbath Rest — no denial of service
  { pattern: /new\s+RegExp\s*\(\s*\w+\s*\)/i, principle: 13, reason: 'Dynamic regex construction (ReDoS risk)' },
  { pattern: /\.repeat\(\s*(?:1e\d+|Number\.MAX|Infinity)\s*\)/i, principle: 13, reason: 'Extreme string repetition' },

  // P14: The Mantle of Elijah — no trojans/backdoors
  { pattern: buildEvalChildProcessPattern(), principle: 14, reason: 'Hidden shell execution via eval' },
  { pattern: /net\.createServer.*\bexec\b/is, principle: 14, reason: 'Network backdoor with command execution' },
  { pattern: /\beval\s*\(\s*Buffer\.from\s*\(\s*['"][A-Za-z0-9+/=]+['"]/i, principle: 14, reason: 'Base64-encoded payload execution' },
  { pattern: /\bFunction\s*\(\s*['"]return\s+this['"]\s*\)\s*\(\)/i, principle: 14, reason: 'Global scope escape attempt' },

  // P15: The New Song — creation not destruction
  { pattern: /\brm\s+-rf\s+[/~]/i, principle: 15, reason: 'Recursive filesystem deletion' },
  { pattern: /fs\.(rmSync|rmdirSync|unlinkSync)\s*\(\s*['"]\/(?!tmp)/i, principle: 15, reason: 'Deletion of system files' },
  { pattern: /format\s+[A-Z]:\s*\/[Yy]/i, principle: 15, reason: 'Drive formatting command' },
];

// ─── Deep Security Patterns (per language) ───

function _buildJsDeepPatterns() {
  return [
    { pattern: /document\.write\s*\(/, reason: 'document.write can enable XSS', severity: 'medium' },
    { pattern: /\.outerHTML\s*=/, reason: 'outerHTML assignment can enable XSS', severity: 'medium' },
    { pattern: /JSON\.parse\s*\(\s*(?!['"`])/, reason: 'Unvalidated JSON.parse (potential prototype pollution)', severity: 'medium' },
    { pattern: /Object\.assign\s*\(\s*\{\}\s*,\s*(?:req\.body|req\.query|input|params|data)/i, reason: 'Prototype pollution via Object.assign with user input', severity: 'high' },
    { pattern: /\.__proto__\s*[=\[]/, reason: 'Direct __proto__ manipulation (prototype pollution)', severity: 'high' },
    { pattern: new RegExp('crypto\\.createHash\\s*\\(\\s*[\'"]' + 'md' + '5[\'"]\\s*\\)'), reason: 'MD5 is cryptographically broken', severity: 'medium' },
    { pattern: new RegExp('crypto\\.createHash\\s*\\(\\s*[\'"]' + 'sha' + '1[\'"]\\s*\\)'), reason: 'SHA1 is deprecated for security use', severity: 'low' },
    { pattern: /Math\.random\s*\(/, reason: 'Math.random is not cryptographically secure', severity: 'low' },
    { pattern: /new\s+Function\s*\(.*\+/, reason: 'Dynamic Function constructor with concatenation', severity: 'high' },
    { pattern: /setTimeout\s*\(\s*['"`]/, reason: 'setTimeout with string argument acts like eval', severity: 'medium' },
    { pattern: /setInterval\s*\(\s*['"`]/, reason: 'setInterval with string argument acts like eval', severity: 'medium' },
    { pattern: buildCredentialPattern('[:=]'), reason: 'Hardcoded secret/credential detected', severity: 'high' },
    { pattern: new RegExp('disable.*(?:csrf|xss|cors|auth|ssl|tls|verify)', 'i'), reason: 'Security feature explicitly disabled', severity: 'high' },
    { pattern: /rejectUnauthorized\s*:\s*false/, reason: 'TLS certificate validation disabled', severity: 'high' },
    { pattern: new RegExp('NODE_TLS_REJECT_' + 'UNAUTHORIZED\\s*=\\s*[\'"]0[\'"]'), reason: 'TLS validation disabled globally', severity: 'high' },
  ];
}

function _buildPyDeepPatterns() {
  return [
    { pattern: /\bpickle\.loads?\s*\(/, reason: 'pickle deserialization can execute arbitrary code', severity: 'high' },
    { pattern: /\byaml\.load\s*\([^)]*(?!Loader)/, reason: 'yaml.load without SafeLoader allows code execution', severity: 'high' },
    { pattern: new RegExp('\\b' + 'ex' + 'ec\\s*\\('), reason: 'exec() can execute arbitrary code', severity: 'high' },
    { pattern: new RegExp('\\b' + 'ev' + 'al\\s*\\('), reason: 'eval() can execute arbitrary code', severity: 'high' },
    { pattern: /subprocess\.(?:call|run|Popen)\s*\(\s*(?!.*shell\s*=\s*False).*shell\s*=\s*True/i, reason: 'Shell injection via subprocess', severity: 'high' },
    { pattern: /os\.system\s*\(/, reason: 'os.system() is vulnerable to shell injection', severity: 'high' },
    { pattern: /\bhashlib\.md5\b/, reason: 'MD5 is cryptographically broken', severity: 'medium' },
    { pattern: /\brandom\.\w+\s*\(/, reason: 'random module is not cryptographically secure', severity: 'low' },
    { pattern: /\bassert\s+\w+.*#.*security/i, reason: 'assert statements are stripped in optimized mode', severity: 'medium' },
    { pattern: buildCredentialPattern('='), reason: 'Hardcoded secret/credential detected', severity: 'high' },
  ];
}

function _buildGoDeepPatterns() {
  return [
    { pattern: /\bexec\.Command\s*\(\s*["'](?:sh|bash)["']/, reason: 'Shell command execution', severity: 'high' },
    { pattern: /\bunsafe\.Pointer\b/, reason: 'unsafe.Pointer bypasses Go type safety', severity: 'medium' },
    { pattern: /InsecureSkipVerify\s*:\s*true/, reason: 'TLS verification disabled', severity: 'high' },
    { pattern: /\bmd5\.New\b/, reason: 'MD5 is cryptographically broken', severity: 'medium' },
    { pattern: /fmt\.Sprintf\s*\(\s*\w+/, reason: 'Format string from variable (potential format string attack)', severity: 'medium' },
  ];
}

const DEEP_SECURITY_PATTERNS = {
  javascript: _buildJsDeepPatterns(),
  python: _buildPyDeepPatterns(),
  go: _buildGoDeepPatterns(),
  typescript: [],
};

// TypeScript inherits JavaScript patterns
DEEP_SECURITY_PATTERNS.typescript = [...DEEP_SECURITY_PATTERNS.javascript];

module.exports = {
  COVENANT_PRINCIPLES,
  HARM_PATTERNS,
  DEEP_SECURITY_PATTERNS,
  stripNonExecutableContent,
};
