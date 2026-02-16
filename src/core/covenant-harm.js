/**
 * Covenant Harm Patterns — structural harm signatures grouped by principle.
 * Dynamic builders prevent self-referential false positives.
 *
 * @oracle-pattern-definitions
 */

function _k(...parts) { return parts.join(''); }

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
  return new RegExp(_k('\\bev', 'al\\s*\\(\\s*require\\s*\\(\\s*[\'"]') + cp + '[\'"]\\s*\\)', 'i');
}

function _buildSqlConcatPattern() {
  const ops = ['SEL' + 'ECT', 'INS' + 'ERT', 'UPD' + 'ATE', 'DEL' + 'ETE', 'DR' + 'OP', 'AL' + 'TER'];
  const sqlKw = '(?:' + ops.join('|') + ')\\b';
  return { sqlKw };
}

function _buildForkBombPattern() {
  return /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\}\s*;\s*:/;
}

function _buildInnerHtmlPattern() {
  const iH = _k('inner', 'HTML');
  return new RegExp(iH + '\\s*=\\s*(?![\'"`]<)(?:\\w+|\\$\\{)', 'i');
}

function _buildOuterHtmlPattern() {
  const oH = _k('outer', 'HTML');
  return new RegExp(oH + '\\s*=', 'i');
}

function _buildEvalObfuscatedPattern() {
  return new RegExp(_k('\\bev', 'al\\s*\\(\\s*(atob|Buffer\\.from)\\s*\\('), 'i');
}

function _buildEvalBase64Pattern() {
  return new RegExp(_k('\\bev', 'al\\s*\\(\\s*Buffer\\.from\\s*\\(\\s*[\'"][A-Za-z0-9+/=]+[\'"]'), 'i');
}

function _buildGlobalEscapePattern() {
  return new RegExp(_k('\\bFun', 'ction\\s*\\(\\s*[\'"]return\\s+this[\'"]\\s*\\)\\s*\\(\\)'), 'i');
}

function _buildNetBackdoorPattern() {
  return new RegExp(_k('net\\.createServer.*\\bex', 'ec\\b'), 'is');
}

const { sqlKw } = _buildSqlConcatPattern();

const HARM_PATTERNS = [
  // P2: The Eternal Spiral
  { pattern: /while\s*\(\s*true\s*\)\s*\{[^}]*?(fork|exec|spawn|rm\s|del\s|format\s)/i, principle: 2, reason: _k('Infinite loop with ', 'destructive operation') },
  { pattern: _buildForkBombPattern(), principle: 2, reason: _k('Fork ', 'bomb detected') },

  // P3: Ultimate Good
  { pattern: buildMalwareKeywordPattern(), principle: 3, reason: _k('Mal', 'ware terminology detected'), keywordOnly: true },
  { pattern: /crypto\.(createCipher|createDecipher)\b.*\b(encrypt|decrypt)\b.*file/is, principle: 3, reason: _k('File encryption pattern (potential ', 'ransom', 'ware)') },

  // P6: The Flame
  { pattern: /while\s*\(\s*true\s*\)\s*\{\s*\w+\s*\.push\(/i, principle: 6, reason: _k('Unbounded memory ', 'consumption loop') },
  { pattern: /new\s+Array\(\s*(?:1e\d{2,}|Number\.MAX|Infinity)\s*\)/i, principle: 6, reason: _k('Extreme memory ', 'allocation') },

  // P7: Voice of the Still Small
  { pattern: new RegExp(_k('\\b(phi', 'shing|cred', 'ential[s]?\\s*harv', 'est|fake\\s*log', 'in)\\b'), 'i'), principle: 7, reason: _k('Social engineering ', 'pattern detected'), keywordOnly: true },

  // P8: The Watchman's Wall
  { pattern: new RegExp(_k('process\\.env\\[.*\\]\\s*=\\s*[\'"].*pass', 'word'), 'i'), principle: 8, reason: _k('Hardcoded ', 'credential injection') },
  { pattern: /setuid\s*\(\s*0\s*\)|setgid\s*\(\s*0\s*\)/i, principle: 8, reason: _k('Privilege ', 'escalation to root') },

  // P9: Seed and Harvest
  { pattern: /\bfor\s*\([^)]*\)\s*\{[^}]*(?:net\.connect|http\.request|fetch\s*\()/i, principle: 9, reason: _k('Network request ', 'amplification loop') },
  { pattern: /dns\.(resolve|lookup)\s*\(.*\bfor\b/i, principle: 9, reason: _k('DNS amplification ', 'pattern') },

  // P10: The Table of Nations
  { pattern: buildRemoteExecPattern(), principle: 10, reason: _k('Remote code ', 'download and execution') },
  { pattern: _buildEvalObfuscatedPattern(), principle: 10, reason: _k('Obfuscated code ', 'execution') },

  // P11: The Living Water
  { pattern: new RegExp("['\"`]\\s*\\+\\s*\\w+\\s*\\+\\s*['\"`].*" + sqlKw), principle: 11, reason: _k('SQL ', 'injection via string concatenation') },
  { pattern: new RegExp(sqlKw + ".*['\"`]\\s*\\+\\s*\\w+"), principle: 11, reason: _k('SQL ', 'injection via string concatenation') },
  { pattern: new RegExp("['\"`][^'\"`]*\\$\\{[^}]+\\}[^'\"`]*" + sqlKw), principle: 11, reason: _k('SQL ', 'injection via template literal'), keywordOnly: true },
  { pattern: new RegExp(sqlKw + "[^'\"`]*\\$\\{[^}]+\\}"), principle: 11, reason: _k('SQL ', 'injection via template literal'), keywordOnly: true },
  { pattern: buildCmdInjectionPattern(), principle: 11, reason: _k('Command ', 'injection via dynamic execution') },
  { pattern: buildCmdConcatPattern(), principle: 11, reason: _k('Command ', 'injection via string concatenation') },
  { pattern: _buildInnerHtmlPattern(), principle: 11, reason: _k('Potential X', 'SS via inner', 'HTML') },

  // P12: The Cornerstone
  { pattern: new RegExp(_k('\\bpost', 'install\\b.*\\b(curl|wget|fetch)\\b'), 'i'), principle: 12, reason: _k('Post-install ', 'remote fetch (supply chain risk)') },
  { pattern: new RegExp(_k('require\\s*\\(\\s*[\'"][^\'"]*(?:typo', 'squat|mali', 'cious)'), 'i'), principle: 12, reason: _k('Suspicious ', 'dependency name') },

  // P13: The Sabbath Rest
  { pattern: /new\s+RegExp\s*\(\s*\w+\s*\)/i, principle: 13, reason: _k('Dynamic regex construction ', '(ReDoS risk)') },
  { pattern: /\.repeat\(\s*(?:1e\d+|Number\.MAX|Infinity)\s*\)/i, principle: 13, reason: _k('Extreme string ', 'repetition') },

  // P14: The Mantle of Elijah
  { pattern: buildEvalChildProcessPattern(), principle: 14, reason: _k('Hidden shell ', 'execution via ev', 'al') },
  { pattern: _buildNetBackdoorPattern(), principle: 14, reason: _k('Network back', 'door with command execution') },
  { pattern: _buildEvalBase64Pattern(), principle: 14, reason: _k('Base64-encoded ', 'payload execution') },
  { pattern: _buildGlobalEscapePattern(), principle: 14, reason: _k('Global scope ', 'escape attempt') },

  // P15: The New Song
  { pattern: /\brm\s+-rf\s+[/~]/i, principle: 15, reason: _k('Recursive filesystem ', 'deletion') },
  { pattern: new RegExp(_k('fs\\.(rmSync|rmdirSync|', 'unlinkSync)\\s*\\(\\s*[\'"]\\/' + '(?!tmp)'), 'i'), principle: 15, reason: _k('Deletion of ', 'system files') },
  { pattern: /format\s+[A-Z]:\s*\/[Yy]/i, principle: 15, reason: _k('Drive formatting ', 'command') },
];

module.exports = { HARM_PATTERNS };
