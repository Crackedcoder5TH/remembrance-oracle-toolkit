/**
 * Covenant Harm Patterns — structural harm signatures grouped by principle.
 * Dynamic builders prevent self-referential false positives.
 */

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

function _buildSqlConcatPattern() {
  const ops = ['SEL' + 'ECT', 'INS' + 'ERT', 'UPD' + 'ATE', 'DEL' + 'ETE', 'DR' + 'OP', 'AL' + 'TER'];
  const sqlKw = '(?:' + ops.join('|') + ')\\b';
  return { sqlKw };
}

const { sqlKw } = _buildSqlConcatPattern();

const HARM_PATTERNS = [
  // P2: The Eternal Spiral
  { pattern: /while\s*\(\s*true\s*\)\s*\{[^}]*?(fork|exec|spawn|rm\s|del\s|format\s)/i, principle: 2, reason: 'Infinite loop with destructive operation' },
  { pattern: /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/, principle: 2, reason: 'Fork bomb detected' },

  // P3: Ultimate Good
  { pattern: buildMalwareKeywordPattern(), principle: 3, reason: 'Malware terminology detected', keywordOnly: true },
  { pattern: /crypto\.(createCipher|createDecipher)\b.*\b(encrypt|decrypt)\b.*file/is, principle: 3, reason: 'File encryption pattern (potential ransomware)' },

  // P6: The Flame
  { pattern: /while\s*\(\s*true\s*\)\s*\{\s*\w+\s*\.push\(/i, principle: 6, reason: 'Unbounded memory consumption loop' },
  { pattern: /new\s+Array\(\s*(?:1e\d{2,}|Number\.MAX|Infinity)\s*\)/i, principle: 6, reason: 'Extreme memory allocation' },

  // P7: Voice of the Still Small
  { pattern: /\b(phishing|credential[s]?\s*harvest|fake\s*login)\b/i, principle: 7, reason: 'Social engineering pattern detected', keywordOnly: true },

  // P8: The Watchman's Wall
  { pattern: /process\.env\[.*\]\s*=\s*['"].*password/i, principle: 8, reason: 'Hardcoded credential injection' },
  { pattern: /setuid\s*\(\s*0\s*\)|setgid\s*\(\s*0\s*\)/i, principle: 8, reason: 'Privilege escalation to root' },

  // P9: Seed and Harvest
  { pattern: /\bfor\s*\([^)]*\)\s*\{[^}]*(?:net\.connect|http\.request|fetch\s*\()/i, principle: 9, reason: 'Network request amplification loop' },
  { pattern: /dns\.(resolve|lookup)\s*\(.*\bfor\b/i, principle: 9, reason: 'DNS amplification pattern' },

  // P10: The Table of Nations
  { pattern: buildRemoteExecPattern(), principle: 10, reason: 'Remote code download and execution' },
  { pattern: /\beval\s*\(\s*(atob|Buffer\.from)\s*\(/i, principle: 10, reason: 'Obfuscated code execution' },

  // P11: The Living Water
  { pattern: new RegExp("['\"`]\\s*\\+\\s*\\w+\\s*\\+\\s*['\"`].*" + sqlKw), principle: 11, reason: 'SQL injection via string concatenation' },
  { pattern: new RegExp(sqlKw + ".*['\"`]\\s*\\+\\s*\\w+"), principle: 11, reason: 'SQL injection via string concatenation' },
  { pattern: new RegExp("['\"`][^'\"`]*\\$\\{[^}]+\\}[^'\"`]*" + sqlKw), principle: 11, reason: 'SQL injection via template literal', keywordOnly: true },
  { pattern: new RegExp(sqlKw + "[^'\"`]*\\$\\{[^}]+\\}"), principle: 11, reason: 'SQL injection via template literal', keywordOnly: true },
  { pattern: buildCmdInjectionPattern(), principle: 11, reason: 'Command injection via dynamic execution' },
  { pattern: buildCmdConcatPattern(), principle: 11, reason: 'Command injection via string concatenation' },
  { pattern: /innerHTML\s*=\s*(?!['"`]<)(?:\w+|\$\{)/i, principle: 11, reason: 'Potential XSS via innerHTML' },

  // P12: The Cornerstone
  { pattern: /\bpostinstall\b.*\b(curl|wget|fetch)\b/i, principle: 12, reason: 'Post-install remote fetch (supply chain risk)' },
  { pattern: /require\s*\(\s*['"][^'"]*(?:typosquat|malicious)/i, principle: 12, reason: 'Suspicious dependency name' },

  // P13: The Sabbath Rest
  { pattern: /new\s+RegExp\s*\(\s*\w+\s*\)/i, principle: 13, reason: 'Dynamic regex construction (ReDoS risk)' },
  { pattern: /\.repeat\(\s*(?:1e\d+|Number\.MAX|Infinity)\s*\)/i, principle: 13, reason: 'Extreme string repetition' },

  // P14: The Mantle of Elijah
  { pattern: buildEvalChildProcessPattern(), principle: 14, reason: 'Hidden shell execution via eval' },
  { pattern: /net\.createServer.*\bexec\b/is, principle: 14, reason: 'Network backdoor with command execution' },
  { pattern: /\beval\s*\(\s*Buffer\.from\s*\(\s*['"][A-Za-z0-9+/=]+['"]/i, principle: 14, reason: 'Base64-encoded payload execution' },
  { pattern: /\bFunction\s*\(\s*['"]return\s+this['"]\s*\)\s*\(\)/i, principle: 14, reason: 'Global scope escape attempt' },

  // P15: The New Song
  { pattern: /\brm\s+-rf\s+[/~]/i, principle: 15, reason: 'Recursive filesystem deletion' },
  { pattern: /fs\.(rmSync|rmdirSync|unlinkSync)\s*\(\s*['"]\/(?!tmp)/i, principle: 15, reason: 'Deletion of system files' },
  { pattern: /format\s+[A-Z]:\s*\/[Yy]/i, principle: 15, reason: 'Drive formatting command' },
];

module.exports = { HARM_PATTERNS };
