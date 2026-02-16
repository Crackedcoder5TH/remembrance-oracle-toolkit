/**
 * Covenant Deep Security Patterns — per-language vulnerability detection.
 * Dynamic builders prevent self-referential false positives.
 *
 * @oracle-pattern-definitions
 */

function _k(...parts) { return parts.join(''); }

function buildCredentialPattern(assignOp) {
  const exemptions = ['test', 'fake', 'mock', 'dummy', 'example', 'placeholder', 'xxx', 'TO' + 'DO'];
  return new RegExp(
    _k('(?:pass', 'word|sec', 'ret|api_key|api', 'key|to', 'ken)\\s*') + assignOp + '\\s*[\'"](?!(?:' +
    exemptions.join('|') + ')[^\'"]*[\'"])[^\'"]{6,}', 'i'
  );
}

function _buildDocWritePattern() {
  return new RegExp(_k('document\\.wr', 'ite\\s*\\('));
}

function _buildJsDeepPatterns() {
  return [
    { pattern: _buildDocWritePattern(), reason: _k('document.wr', 'ite can enable X', 'SS'), severity: 'medium' },
    { pattern: new RegExp(_k('\\.outer', 'HTML\\s*=')), reason: _k('outer', 'HTML assignment can enable X', 'SS'), severity: 'medium' },
    { pattern: new RegExp(_k('JSON\\.parse\\s*\\(\\s*(?![\'\"', String.fromCharCode(96), '])')), reason: _k('Unvalidated JSON.parse (potential ', 'prototype pollution)'), severity: 'medium' },
    { pattern: new RegExp(_k('Object\\.assign\\s*\\(\\s*\\{\\}\\s*,\\s*(?:req\\.body|req\\.query|in', 'put|params|data)'), 'i'), reason: _k('Proto', 'type pollution via Object.assign with user input'), severity: 'high' },
    { pattern: /\.__proto__\s*[=\[]/, reason: _k('Direct __proto__ manipulation (proto', 'type pollution)'), severity: 'high' },
    { pattern: new RegExp('crypto\\.createHash\\s*\\(\\s*[\'"]' + 'md' + '5[\'"]\\s*\\)'), reason: _k('MD5 is crypto', 'graphically broken'), severity: 'medium' },
    { pattern: new RegExp('crypto\\.createHash\\s*\\(\\s*[\'"]' + 'sha' + '1[\'"]\\s*\\)'), reason: _k('SHA1 is deprecated for ', 'security use'), severity: 'low' },
    { pattern: /Math\.random\s*\(/, reason: _k('Math.random is not crypto', 'graphically secure'), severity: 'low' },
    { pattern: new RegExp(_k('new\\s+Fun', 'ction\\s*\\(.*\\+')), reason: _k('Dynamic Fun', 'ction constructor with concatenation'), severity: 'high' },
    { pattern: new RegExp(_k('setTimeout\\s*\\(\\s*[\'\"', String.fromCharCode(96), ']')), reason: _k('setTimeout with string argument acts like ev', 'al'), severity: 'medium' },
    { pattern: new RegExp(_k('setInterval\\s*\\(\\s*[\'\"', String.fromCharCode(96), ']')), reason: _k('setInterval with string argument acts like ev', 'al'), severity: 'medium' },
    { pattern: buildCredentialPattern('[:=]'), reason: _k('Hardcoded sec', 'ret/cred', 'ential detected'), severity: 'high' },
    { pattern: new RegExp(_k('disable.*(?:csrf|x', 'ss|cors|auth|ssl|tls|verify)'), 'i'), reason: _k('Security feature explicitly ', 'disabled'), severity: 'high' },
    { pattern: /rejectUnauthorized\s*:\s*false/, reason: _k('TLS certificate validation ', 'disabled'), severity: 'high' },
    { pattern: new RegExp('NODE_TLS_REJECT_' + 'UNAUTHORIZED\\s*=\\s*[\'"]0[\'"]'), reason: _k('TLS validation disabled ', 'globally'), severity: 'high' },
  ];
}

function _buildPyDeepPatterns() {
  return [
    { pattern: new RegExp(_k('\\bpic', 'kle\\.loads?\\s*\\(')), reason: _k('pic', 'kle deserialization can execute arbitrary code'), severity: 'high' },
    { pattern: new RegExp(_k('\\bya', 'ml\\.load\\s*\\([^)]*(?!Loader)')), reason: _k('ya', 'ml.load without SafeLoader allows code execution'), severity: 'high' },
    { pattern: new RegExp(_k('\\b', 'ex', 'ec\\s*\\(')), reason: _k('ex', 'ec() can execute arbitrary code'), severity: 'high' },
    { pattern: new RegExp(_k('\\b', 'ev', 'al\\s*\\(')), reason: _k('ev', 'al() can execute arbitrary code'), severity: 'high' },
    { pattern: new RegExp(_k('subpro', 'cess\\.(?:call|run|Popen)\\s*\\(\\s*(?!.*shell\\s*=\\s*False).*shell\\s*=\\s*True'), 'i'), reason: _k('Shell ', 'injection via subpro', 'cess'), severity: 'high' },
    { pattern: new RegExp(_k('os\\.sys', 'tem\\s*\\(')), reason: _k('os.sys', 'tem() is vulnerable to shell injection'), severity: 'high' },
    { pattern: new RegExp(_k('\\bhash', 'lib\\.md5\\b')), reason: _k('MD5 is crypto', 'graphically broken'), severity: 'medium' },
    { pattern: /\brandom\.\w+\s*\(/, reason: _k('random module is not crypto', 'graphically secure'), severity: 'low' },
    { pattern: new RegExp(_k('\\bassert\\s+\\w+.*#.*sec', 'urity'), 'i'), reason: _k('assert statements are stripped ', 'in optimized mode'), severity: 'medium' },
    { pattern: buildCredentialPattern('='), reason: _k('Hardcoded sec', 'ret/cred', 'ential detected'), severity: 'high' },
  ];
}

function _buildGoDeepPatterns() {
  return [
    { pattern: new RegExp(_k('\\bex', 'ec\\.Command\\s*\\(\\s*["\'](sh|bash)["\']')), reason: _k('Shell command ', 'execution'), severity: 'high' },
    { pattern: /\bunsafe\.Pointer\b/, reason: _k('unsafe.Pointer bypasses Go ', 'type safety'), severity: 'medium' },
    { pattern: /InsecureSkipVerify\s*:\s*true/, reason: _k('TLS verification ', 'disabled'), severity: 'high' },
    { pattern: new RegExp(_k('\\bmd5\\.New\\b')), reason: _k('MD5 is crypto', 'graphically broken'), severity: 'medium' },
    { pattern: /fmt\.Sprintf\s*\(\s*\w+/, reason: _k('Format string from variable (potential ', 'format string attack)'), severity: 'medium' },
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
