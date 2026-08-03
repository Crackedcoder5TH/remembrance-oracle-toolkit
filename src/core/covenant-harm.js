/**
 * Covenant Harm Patterns — structural harm signatures grouped by principle.
 * Dynamic builders prevent self-referential false positives.
 *
 * @oracle-pattern-definitions
 */

const { _k } = require('./k');

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
  // A shell command built from a variable: exec/execSync/execFile( <ident> + ...)
  // OR exec( '<literal>' + <ident> ...). The \w after + on the literal form
  // avoids flagging safe literal+literal concatenation. child_process must
  // appear on the same line, which keeps the covenant gate's false-positive
  // rate low (the per-call coherency scanner catches the cross-line forms).
  return new RegExp(cp + '.*exec\\w*\\s*\\(\\s*(?:[\'"`][^\'"`]*[\'"`]\\s*\\+\\s*\\w|\\w+\\s*\\+)', 'i');
}

function buildEvalChildProcessPattern() {
  const cp = 'child' + '_process';
  return new RegExp(_k('\\bev', 'al\\s*\\(\\s*require\\s*\\(\\s*[\'"]') + cp + '[\'"]\\s*\\)', 'i');
}

// ── Dynamic code execution — P11, code injection ────────────────────────
//
// The covenant caught SQL, command and XSS injection, and caught eval hidden
// behind string concatenation (global['ev'+'al'] trips Indirection Detection),
// but plain `eval(userInput)` sealed clean. Obfuscating it got you caught;
// writing it openly did not. The Indirection layer shows eval was always
// considered harmful — only the direct form was never written down.
//
// Scoped to a NON-LITERAL argument on purpose. `eval('1+1')` is a smell, not
// an injection, and P11's seal is "Data must flow clean. No injection
// attacks." A quoted literal cannot carry untrusted data; an identifier or an
// interpolated template can, and that is precisely the injection.
//
// The negative lookbehind keeps `foo.eval(x)` and `myeval(x)` out — a method
// on some object is a different claim than the global evaluator.
function buildDynamicEvalPattern() {
  // eval( <identifier or call> — anything not opening with a quote
  return new RegExp('(?<![.\\w])' + _k('ev', 'al') + '\\s*\\(\\s*[A-Za-z_$]', 'i');
}

function buildDynamicEvalTemplatePattern() {
  // eval( `... ${x} ...` ) — an interpolated template is untrusted data
  return new RegExp('(?<![.\\w])' + _k('ev', 'al') + '\\s*\\(\\s*[`\'"][^`\'"]*\\$\\{', 'i');
}

function buildFunctionConstructorPattern() {
  // new Function(<identifier>) — the constructor IS an evaluator
  return new RegExp('\\bnew\\s+' + _k('Func', 'tion') + '\\s*\\(\\s*[A-Za-z_$]');
}

function buildStringTimerPattern() {
  // setTimeout('code…') / setInterval('code…') — the string form is eval.
  // Only the quoted form: setTimeout(fn, 100) passes a function and is safe,
  // and a bare identifier is indistinguishable from that safe form.
  //
  // The alternation MUST be grouped. Written as
  // '\\b' + 'setTimeout|setInterval' + '\\s*\\(\\s*[\'"`]' the regex parses as
  // (\bsetTimeout) OR (setInterval\s*\(...), so every safe
  // `setTimeout(handler, 100)` matched the bare left branch and the covenant
  // blocked ordinary code.
  return new RegExp('\\b(?:' + _k('set', 'Timeout|set', 'Interval') + ')\\s*\\(\\s*[\'"`]');
}

// Statements only count when handed to an executor — see buildUnscopedDeletePattern.
const EXEC_CALL = '\\.(?:run|exec|execute|query|prepare|all|get)';

// ── P1: I AM — "Purpose must be declared, not hidden." ──────────────────
//
// Hidden purpose is not "code I dislike"; it is code written so that reading
// it does not reveal what it does. Two shapes are unambiguous and mechanical:
// escape-encoded identifiers, and the packer preamble. Both exist to stop a
// reader seeing the intent, which is the seal exactly.
//
// Deliberately NOT flagged: minified output (a build artifact, purpose is
// declared in its source), short hex escapes in legitimate string data, and
// base64 blobs on their own — data is not a hidden purpose until it is
// executed, which P10 already covers.

function buildEscapedIdentifierPattern() {
  // Four or more consecutive \xNN escapes in the PRINTABLE ASCII range — the
  // shape of a name being spelled out to keep it out of the reader's sight
  // (\x65\x76\x61\x6c). Restricted deliberately:
  //
  //   \u.... is excluded entirely. Box-drawing borders for console output
  //   (\u2554\u2550\u2550...) are long runs of legitimate unicode escapes and
  //   were the only thing this caught across 674 files.
  //
  //   The hex range is capped at 0x20-0x7f so binary/byte data in a literal
  //   does not read as a hidden identifier.
  return /(?:\\x[2-7][0-9a-f]){4,}/i;
}

function buildPackerPreamblePattern() {
  // The classic packer signature: function(p,a,c,k,e,d) / (p,a,c,k,e,r).
  // Single-letter parameter runs of this exact shape are machine-generated
  // unpackers, never hand-written logic.
  return new RegExp(_k('func', 'tion') + '\\s*\\(\\s*p\\s*,\\s*a\\s*,\\s*c\\s*,\\s*k\\s*,\\s*e\\s*,\\s*[dr]\\s*\\)');
}

// ── P4: Memory of the Deep — "Stored data must remain whole." ───────────
//
// Unbounded destructive statements: a DELETE or UPDATE with no WHERE touches
// every row, and TRUNCATE / DROP DATABASE discards the store outright. This is
// distinct from P11's SQL injection rules — the statement here is not attacker
// controlled, it is simply unscoped, and it corrupts stored data by intent
// rather than by exploitation.
//
// Requires the statement to look like a real query (a table name follows), and
// stops at the first clause keyword so a following WHERE on the same line is
// visible. Migrations legitimately truncate, and carry
// @oracle-infrastructure.

function buildUnscopedDeletePattern() {
  const del = 'DEL' + 'ETE';
  // Must be HANDED TO AN EXECUTOR. Scanning for the bare statement matched
  // tests asserting on SQL strings (sql.includes('DELETE FROM patterns')) —
  // inspecting a query is not running one. Requiring .run/.exec/.query/
  // .prepare immediately before it keeps the rule on statements that execute.
  //
  // The WHERE lookahead scans to the statement terminator and does NOT stop at
  // quotes. Excluding quotes seemed safer and was wrong: a quoted VALUE inside
  // the SQL (SET state = 'decohered', ... WHERE id = ?) ended the scan before
  // WHERE was reached, so a properly scoped UPDATE read as unscoped. Missing a
  // violation is the correct direction to fail for a commit gate; blocking
  // correct code is not.
  return new RegExp(EXEC_CALL + '\\s*\\(\\s*[\'"`]\\s*' + del + '\\s+FROM\\s+[\\w."`\\[\\]]+\\s*(?![^;]{0,400}\\bWHERE\\b)', 'i');
}

function buildUnscopedUpdatePattern() {
  const upd = 'UPD' + 'ATE';
  return new RegExp(EXEC_CALL + '\\s*\\(\\s*[\'"`]\\s*' + upd + '\\s+[\\w."`\\[\\]]+\\s+SET\\b(?![^;]{0,400}\\bWHERE\\b)', 'i');
}

function buildStoreDestructionPattern() {
  const terms = ['TRUN' + 'CATE\\s+TABLE', 'DR' + 'OP\\s+DATABASE', 'DR' + 'OP\\s+SCHEMA'];
  return new RegExp(EXEC_CALL + '\\s*\\(\\s*[\'"`]\\s*(?:' + terms.join('|') + ')\\b', 'i');
}

// ── P5: The Loom — "Concurrency must strengthen, not exploit." ──────────
//
// Concurrency that consumes rather than contributes: spawning workers or
// processes inside a loop with no ceiling, and zero-delay repeating timers
// that starve the event loop. Both turn parallelism into resource exhaustion,
// which is the seal's "exploit".
//
// Scoped to the loop-bounded forms on purpose. A single `new Worker(...)` is
// ordinary and correct; N of them created by a loop over unbounded input is
// the exploit. The fork bomb shell form is already covered under P13.

function buildUnboundedSpawnPattern() {
  const spawners = ['new\\s+Worker', 'cluster\\.fork', 'child' + '_process', 'new\\s+Thread'];
  // for/while header, then a spawner within the same statement window
  return new RegExp('\\b(?:for|while)\\s*\\([^)]*\\)\\s*\\{[^}]{0,200}?\\b(?:' + spawners.join('|') + ')\\s*[(.]', 'is');
}

function buildStarvingTimerPattern() {
  // setInterval(fn, 0) or setInterval(fn) — a repeating timer with no delay.
  //
  // Two separate forms, because one regex cannot do both safely. The earlier
  // '[^,)]+(?:,\\s*0+)?\\)' matched `setInterval(() => ...)`: the `(` of the
  // arrow's empty parameter list is not excluded by [^,)], so `setInterval((`
  // plus the closing `)` satisfied the whole pattern. It fired on ten
  // perfectly ordinary timers and no real ones.
  //
  //   explicit zero : anything, then a literal 0 delay at the end
  //   missing delay : a bare identifier and nothing else
  const si = '\\b' + _k('set', 'Interval') + '\\s*\\(';
  return new RegExp('(?:' + si + '[\\s\\S]{0,300}?,\\s*0+\\s*\\)'
                  + '|' + si + '\\s*[A-Za-z_$][\\w$]*\\s*\\))');
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
  // P1: I AM — purpose must be declared, not hidden.
  { pattern: buildEscapedIdentifierPattern(), principle: 1, reason: _k('Escape-encoded ', 'identifiers hide intent from the reader'), rawOnly: true },
  { pattern: buildPackerPreamblePattern(), principle: 1, reason: _k('Packed/obfuscated ', 'source with undeclared purpose') },

  // P4: Memory of the Deep — stored data must remain whole.
  { pattern: buildUnscopedDeletePattern(), principle: 4, reason: _k('Unscoped DEL', 'ETE — removes every row'), rawOnly: true },
  { pattern: buildUnscopedUpdatePattern(), principle: 4, reason: _k('Unscoped UPD', 'ATE — rewrites every row'), rawOnly: true },
  { pattern: buildStoreDestructionPattern(), principle: 4, reason: _k('Wholesale store ', 'destruction'), rawOnly: true },

  // P5: The Loom — concurrency must strengthen, not exploit.
  { pattern: buildUnboundedSpawnPattern(), principle: 5, reason: _k('Unbounded ', 'process/worker spawning in a loop') },
  { pattern: buildStarvingTimerPattern(), principle: 5, reason: _k('Zero-delay repeating ', 'timer starves the event loop') },

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
  // rawOnly: the password value lives INSIDE a string literal; stripping
  // strings would erase the signal this rule depends on.
  { pattern: new RegExp(_k('process\\.env\\[.*\\]\\s*=\\s*[\'"].*pass', 'word'), 'i'), principle: 8, reason: _k('Hardcoded ', 'credential injection'), rawOnly: true },
  { pattern: /setuid\s*\(\s*0\s*\)|setgid\s*\(\s*0\s*\)/i, principle: 8, reason: _k('Privilege ', 'escalation to root') },

  // P9: Seed and Harvest
  { pattern: /\bfor\s*\([^)]*\)\s*\{[^}]*(?:net\.connect|http\.request|fetch\s*\()/i, principle: 9, reason: _k('Network request ', 'amplification loop') },
  { pattern: /dns\.(resolve|lookup)\s*\(.*\bfor\b/i, principle: 9, reason: _k('DNS amplification ', 'pattern') },

  // P10: The Table of Nations
  // Remote exec rule matches `exec('curl http://... | bash')` where the
  // curl command lives inside a string literal. Needs raw scanning.
  { pattern: buildRemoteExecPattern(), principle: 10, reason: _k('Remote code ', 'download and execution'), rawOnly: true },
  { pattern: _buildEvalObfuscatedPattern(), principle: 10, reason: _k('Obfuscated code ', 'execution') },

  // P11: The Living Water
  // SQL concat rules target keywords INSIDE string literals (e.g.
  // `"SELECT * FROM users WHERE id=" + userId`). Need raw scanning.
  { pattern: new RegExp("['\"`]\\s*\\+\\s*\\w+\\s*\\+\\s*['\"`].*" + sqlKw), principle: 11, reason: _k('SQL ', 'injection via string concatenation'), rawOnly: true },
  { pattern: new RegExp(sqlKw + ".*['\"`]\\s*\\+\\s*\\w+"), principle: 11, reason: _k('SQL ', 'injection via string concatenation'), rawOnly: true },
  // SQL template literal rules can run on stripped code because the new
  // strip function preserves `${...}` markers. Removing keywordOnly is a
  // no-op — the behavior is the same under the new default.
  { pattern: new RegExp("['\"`][^'\"`]*\\$\\{[^}]+\\}[^'\"`]*" + sqlKw), principle: 11, reason: _k('SQL ', 'injection via template literal'), rawOnly: true },
  // DDL is exempted, matching what src/audit/static-checkers.js already
  // skips. `ALTER TABLE ${table}` / `CREATE INDEX` / `PRAGMA table_info` name
  // a SCHEMA OBJECT, and SQL has no placeholder for an identifier — you
  // cannot parameterise a table name, so interpolation is the only way to
  // write it. Flagging it demands an impossible fix.
  //
  // Surfaced by quantum-field.js, whose migration is guarded twice over: the
  // name comes from the QUANTUM_TABLES constant, an allowlist check rejects
  // anything else, and sqlite_master is queried to confirm the table exists.
  // Correct code the covenant could only tell you to stop writing.
  //
  // The DATA rules above are untouched — a value interpolated into a WHERE
  // clause is still an injection, and that one does have a placeholder.
  { pattern: new RegExp("(?!.*(?:ALTER\\s+TABLE|CREATE\\s+(?:INDEX|TABLE)|PRAGMA\\s+table_info|ADD\\s+COLUMN))" + sqlKw + "[^'\"`]*\\$\\{[^}]+\\}"), principle: 11, reason: _k('SQL ', 'injection via template literal'), rawOnly: true },
  // Matches `child_process` as a literal word, which only exists inside
  // the require('child_process') import string — needs raw scanning.
  { pattern: buildCmdInjectionPattern(), principle: 11, reason: _k('Command ', 'injection via dynamic execution'), rawOnly: true },
  // Command concat builds shell strings via concatenation.
  { pattern: buildCmdConcatPattern(), principle: 11, reason: _k('Command ', 'injection via string concatenation'), rawOnly: true },
  { pattern: _buildInnerHtmlPattern(), principle: 11, reason: _k('Potential X', 'SS via inner', 'HTML') },
  // Dynamic code execution — the injection family's direct form.
  { pattern: buildDynamicEvalPattern(), principle: 11, reason: _k('Code ', 'injection via dynamic evaluation') },
  { pattern: buildDynamicEvalTemplatePattern(), principle: 11, reason: _k('Code ', 'injection via interpolated evaluation'), rawOnly: true },
  { pattern: buildFunctionConstructorPattern(), principle: 11, reason: _k('Code ', 'injection via the Function constructor') },
  { pattern: buildStringTimerPattern(), principle: 11, reason: _k('Code ', 'injection via string-argument timer'), rawOnly: true },

  // P12: The Cornerstone
  // Post-install hooks live inside JSON/package.json values. The rule
  // targets content INSIDE string literals; need raw scanning.
  { pattern: new RegExp(_k('\\bpost', 'install\\b.*\\b(curl|wget|fetch)\\b'), 'i'), principle: 12, reason: _k('Post-install ', 'remote fetch (supply chain risk)'), rawOnly: true },
  { pattern: new RegExp(_k('require\\s*\\(\\s*[\'"][^\'"]*(?:typo', 'squat|mali', 'cious)'), 'i'), principle: 12, reason: _k('Suspicious ', 'dependency name'), rawOnly: true },

  // P13: The Sabbath Rest
  { pattern: /new\s+RegExp\s*\(\s*\w+\s*\)/i, principle: 13, reason: _k('Dynamic regex construction ', '(ReDoS risk)') },
  { pattern: /\.repeat\(\s*(?:1e\d+|Number\.MAX|Infinity)\s*\)/i, principle: 13, reason: _k('Extreme string ', 'repetition') },

  // P14: The Mantle of Elijah
  // eval(require('child_process')) — the 'child_process' string is stripped,
  // so the rule needs raw code.
  { pattern: buildEvalChildProcessPattern(), principle: 14, reason: _k('Hidden shell ', 'execution via ev', 'al'), rawOnly: true },
  { pattern: _buildNetBackdoorPattern(), principle: 14, reason: _k('Network back', 'door with command execution') },
  // Base64 blob lives inside a string literal; the rule matches its
  // character class, which would be erased by stripping.
  { pattern: _buildEvalBase64Pattern(), principle: 14, reason: _k('Base64-encoded ', 'payload execution'), rawOnly: true },
  { pattern: _buildGlobalEscapePattern(), principle: 14, reason: _k('Global scope ', 'escape attempt') },

  // P15: The New Song
  // These rules detect literal shell/filesystem destruction strings.
  // `rm -rf /` lives inside a string passed to exec; `fs.rmSync('/foo')`
  // has the path as a literal; drive format commands are string args.
  // All three need raw scanning to see the string contents.
  { pattern: /\brm\s+-rf\s+[/~]/i, principle: 15, reason: _k('Recursive filesystem ', 'deletion'), rawOnly: true },
  { pattern: new RegExp(_k('fs\\.(rmSync|rmdirSync|', 'unlinkSync)\\s*\\(\\s*[\'"]\\/' + '(?!tmp)'), 'i'), principle: 15, reason: _k('Deletion of ', 'system files'), rawOnly: true },
  { pattern: /format\s+[A-Z]:\s*\/[Yy]/i, principle: 15, reason: _k('Drive formatting ', 'command'), rawOnly: true },
];

module.exports = { HARM_PATTERNS };
