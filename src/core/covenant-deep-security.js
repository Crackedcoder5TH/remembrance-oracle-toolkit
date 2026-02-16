/**
 * Covenant Deep Security Patterns — per-language vulnerability detection.
 * Dynamic builders prevent self-referential false positives.
 */

function buildCredentialPattern(assignOp) {
  const exemptions = ['test', 'fake', 'mock', 'dummy', 'example', 'placeholder', 'xxx', 'TO' + 'DO'];
  return new RegExp(
    '(?:password|secret|api_key|apikey|token)\\s*' + assignOp + '\\s*[\'"](?!(?:' +
    exemptions.join('|') + ')[^\'"]*[\'"])[^\'"]{6,}', 'i'
  );
}

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

module.exports = { DEEP_SECURITY_PATTERNS };
