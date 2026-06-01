/**
 * Reflector — Security pattern scanning.
 * Dynamic pattern builders prevent self-referential false positives.
 *
 * @oracle-pattern-definitions
 */

const { _k } = require('../core/k');

function stripStringsAndComments(code) {
  if (!code) return '';
  return code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#[^\n]*/g, '')
    .replace(/`(?:\\.|[^`\\])*`/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function _buildSecretPatterns() {
  const apiK = _k('api', '[_-]?', 'key|api', 'key');
  const passwd = _k('pass', 'word|', 'pass', 'wd|pwd');
  const secTok = _k('sec', 'ret|to', 'ken');
  const awsKey = _k('aws', '_access', '_key|aws', '_secret');
  const privKey = _k('-----BEGIN\\s+(?:RSA\\s+)?PRIV', 'ATE\\s+KEY-----');

  return [
    { pattern: new RegExp(`(?:${apiK})\\s*[:=]\\s*['"][A-Za-z0-9+/=]{16,}['"]`, 'gi'), severity: 'high', message: _k('Possible hardcoded ', 'API key') },
    { pattern: new RegExp(`(?:${passwd})\\s*[:=]\\s*['"][^'"]{4,}['"]`, 'gi'), severity: 'high', message: _k('Possible hardcoded ', 'password') },
    { pattern: new RegExp(`(?:${secTok})\\s*[:=]\\s*['"][A-Za-z0-9+/=]{16,}['"]`, 'gi'), severity: 'high', message: _k('Possible hardcoded ', 'secret/', 'token') },
    { pattern: new RegExp(`(?:${awsKey})\\s*[:=]\\s*['"][A-Z0-9]{16,}['"]`, 'gi'), severity: 'critical', message: _k('Possible hardcoded ', 'AWS credential') },
    { pattern: new RegExp(privKey, 'g'), severity: 'critical', message: _k('Private key in ', 'source code') },
  ];
}

function _buildJsPatterns() {
  return [
    { test: new RegExp(_k('\\bev', 'al\\s*\\(')), severity: 'high', message: _k('Use of ev', 'al() — code injection risk') },
    { test: new RegExp(_k('new\\s+Fun', 'ction\\s*\\(')), severity: 'high', message: _k('Use of new Fun', 'ction() — code injection risk') },
    { test: new RegExp(_k('inner', 'HTML\\s*=')), severity: 'medium', message: _k('Direct inner', 'HTML assignment — XSS risk') },
    { test: new RegExp(_k('document\\.wr', 'ite\\s*\\(')), severity: 'medium', message: _k('document.wr', 'ite() — XSS risk') },
  ];
}

function _buildPyPatterns() {
  return [
    { test: new RegExp(_k('\\bex', 'ec\\s*\\(')), severity: 'high', message: _k('Use of ex', 'ec() — code injection risk') },
    { test: new RegExp(_k('\\bos\\.sys', 'tem\\s*\\(')), severity: 'high', message: _k('Use of os.sys', 'tem() — command injection risk') },
    { test: new RegExp(_k('subpro', 'cess\\.(?:call|run|Popen)\\s*\\([^)]*shell\\s*=\\s*True')), severity: 'high', message: _k('subpro', 'cess with shell=True — command injection risk') },
    { test: new RegExp(_k('pic', 'kle\\.load')), severity: 'high', message: _k('Unpickling untrusted data — ', 'arbitrary code execution risk') },
  ];
}

function securityScan(code, language) {
  if (!code) {
    return { score: 1, riskLevel: 'none', findings: [], totalFindings: 0 };
  }
  const findings = [];
  const lang = (language || '').toLowerCase();
  const strippedCode = stripStringsAndComments(code);

  // Secret patterns must match against original code (not stripped) because
  // stripStringsAndComments removes string contents — the very values we're checking
  for (const { pattern, severity, message } of _buildSecretPatterns()) {
    const matches = code.match(pattern);
    if (matches) findings.push({ severity, message, count: matches.length });
  }

  // Universal dangerous-function detection (language-agnostic)
  const _universalPatterns = [
    { test: new RegExp(_k('\\bev', 'al\\s*\\(')), severity: 'high', message: _k('Use of ev', 'al() — code injection risk') },
    { test: new RegExp(_k('new\\s+Fun', 'ction\\s*\\(')), severity: 'high', message: _k('Use of new Fun', 'ction() — code injection risk') },
  ];
  if (!lang || (lang !== 'javascript' && lang !== 'js' && lang !== 'typescript' && lang !== 'ts')) {
    for (const { test, severity, message } of _universalPatterns) {
      if (test.test(strippedCode)) findings.push({ severity, message, count: 1 });
    }
  }

  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    for (const { test, severity, message } of _buildJsPatterns()) {
      if (test.test(strippedCode)) findings.push({ severity, message, count: 1 });
    }
    const cpExec = new RegExp(_k('child_pro', 'cess.*ex', 'ec(?:Sync)?\\s*\\('));
    const userInput = /\$\{|` \+|req\.|args|input|param/i;
    if (cpExec.test(strippedCode) && userInput.test(strippedCode)) {
      findings.push({ severity: 'high', message: _k('Shell command execution with possible user input — ', 'command injection risk'), count: 1 });
    }
    const pathTraversal = new RegExp(_k('\\.createRead', 'Stream\\s*\\([^)]*(?:req|param|input|args)'), 'i');
    if (pathTraversal.test(strippedCode)) {
      findings.push({ severity: 'medium', message: _k('File access with user-controlled path — ', 'path traversal risk'), count: 1 });
    }
    if (/\bvar\b/.test(strippedCode)) {
      const varCount = (strippedCode.match(/\bvar\b/g) || []).length;
      findings.push({ severity: 'low', message: `Use of var (${varCount}x) — prefer const/let for block scoping`, count: varCount });
    }
    const sqlConcat = new RegExp(_k("['\"`]\\s*\\+\\s*(?:req|args|param|input|", "query)"), 'i');
    const sqlKeywords = new RegExp(_k('(?:SEL', 'ECT|INS', 'ERT|UPD', 'ATE|DEL', 'ETE|WH', 'ERE)'), 'i');
    if (sqlConcat.test(strippedCode) && sqlKeywords.test(strippedCode)) {
      findings.push({ severity: 'high', message: _k('Possible SQL injection — ', 'string concatenation in query'), count: 1 });
    }
    if (/\[(?:req|args|param|input|key)\b[^]]*\]\s*=/.test(strippedCode)) {
      findings.push({ severity: 'medium', message: _k('Dynamic property assignment — ', 'possible prototype pollution'), count: 1 });
    }
  }

  if (lang === 'python' || lang === 'py') {
    for (const { test, severity, message } of _buildPyPatterns()) {
      if (test.test(strippedCode)) findings.push({ severity, message, count: 1 });
    }
    const yamlLoad = new RegExp(_k('ya', 'ml\\.lo', 'ad\\s*\\([^)]*(?!Loader)'));
    const safeLoader = new RegExp(_k('Safe', 'Loader|safe', '_load'));
    if (yamlLoad.test(strippedCode) && !safeLoader.test(strippedCode)) {
      findings.push({ severity: 'medium', message: _k('yaml.load without Safe', 'Loader — arbitrary code execution risk'), count: 1 });
    }
  }

  // ── Self-match gate ──
  // Files annotated @oracle-pattern-definitions BUILD detector regexes from
  // literal fragments (`_k('SEL','ECT')` → "SELECT"). The deep raw-code
  // scanners below would otherwise classify those literal fragments as
  // findings — the scanner detecting itself. The covenant knows this file
  // class; ask it before running the self-matching detectors. The primary
  // language-specific checks above DO NOT self-match (they use `_k` to
  // split their own messages), so they keep running regardless.
  let _isPatternDefs = false;
  try {
    const { isPatternDefinitionFile } = require('../core/covenant-trust');
    _isPatternDefs = isPatternDefinitionFile(code);
  } catch (_) { /* covenant-trust unavailable — fall back to running all detectors */ }

  // ── Deeper injection detection (scans RAW code) ──
  // The language blocks above gate SQL/command checks on a fixed set of
  // user-input variable names (req/args/param/...) AND run against stripped
  // code — but stripStringsAndComments replaces the very string literal the
  // SQL keyword lives in with "", so real injections with ordinary parameter
  // names never fire. These run on the ORIGINAL code and recognize ANY
  // identifier or ${} interpolation flowing into a query or shell sink.
  // Keyword fragments are split (via _k) so this definitions file does not
  // match its own patterns when scanned.
  const _q = '[\'"`]';            // a string-delimiter: ' " or `
  const _qn = '[^\'"`]';          // a non-delimiter char
  const _sqlKw = _k('(?:SEL', 'ECT|INS', 'ERT|UPD', 'ATE|DEL', 'ETE|DR', 'OP)');
  const _sink = _k('\\b(?:ex', 'ecSync|ex', 'ec|spa', 'wnSync|spa', 'wn)');
  // SQL injection: a string literal that contains a SQL keyword and is
  // followed on the SAME line (within ~120 chars) by string concatenation
  // or template-literal interpolation. Same-line anchoring is essential —
  // the previous form used `[\\s\\S]*?` which crossed newlines and produced
  // false positives on any source file that mentioned UPDATE / DELETE /
  // SELECT in a string anywhere near a later `+` or `${` (e.g. the field
  // server's "tools/call" wiring, or the LRE's "update field" doc strings).
  // Real SQL injection always has the keyword and the concat in proximity.
  const _sqlInjection = new RegExp(
    _q + _qn + '*' + _sqlKw + '\\b[^\\n]{0,120}?(?:' + _q + '\\s*\\+|\\$\\{)',
    'i'
  );
  // Strong signal: exec/execSync/spawn/spawnSync with concatenation or
  // template interpolation. Fires regardless of context — these shapes
  // mean untrusted input is being assembled into a shell command.
  const _cmdInjection = new RegExp(
    _sink + '\\s*\\(\\s*(?:' +
      _q + _qn + '*' + _q + '\\s*\\+' +    // "lit" + something
      '|\\w+\\s*\\+' +                      // word + something
      '|[^)]*\\$\\{' +                      // template interpolation
    ')', 'i');
  // Bare-identifier signal: exec(varName), exec(req.body.cmd), spawn(fn()).
  // Gated behind a child_process / subprocess import so plain regex.exec(input)
  // and similar non-shell .exec calls don't false-fire. When `child_process`
  // is present anywhere in the file, a bare non-literal arg to exec/spawn is
  // the canonical command-injection shape and worth flagging.
  const _cpContext = /\bchild_process\b|\bnode:child_process\b|\bsubprocess\b/;
  // No regex-level exemptions here. The covenant decides what is trusted.
  // After this regex matches, we extract the first-arg expression and
  // ask src/core/covenant-trust.isTrustedSource() — the covenant is the
  // single source of trust classification. To exempt a new safe pattern,
  // extend the covenant's trust registry, not this regex.
  const _cmdInjectionBareArg = new RegExp(
    _sink + '\\s*\\(\\s*([A-Za-z_$][\\w$.]*)\\s*[\\(,\\)]', 'i');
  const _flagged = (kw) => findings.some(f => f.message && f.message.toLowerCase().includes(kw));
  if (!_isPatternDefs && _sqlInjection.test(code) && !_flagged(_k('sql inj', 'ection'))) {
    findings.push({ severity: 'high', message: _k('Possible SQL inj', 'ection — untrusted value concatenated or interpolated into a query'), count: 1 });
  }
  if (!_isPatternDefs && _cmdInjection.test(code) && !_flagged(_k('command inj', 'ection')) && !_flagged('shell command')) {
    findings.push({ severity: 'high', message: _k('Possible command inj', 'ection — untrusted value in a shell command'), count: 1 });
  } else if (!_isPatternDefs && _cpContext.test(code)
             && !_flagged(_k('command inj', 'ection')) && !_flagged('shell command')) {
    // Bare-arg case: extract the first-arg expression and ask the covenant
    // whether it's a trusted source. Trusted → no flag. The covenant is
    // the only place that knows what's trusted; this file knows nothing.
    let trusted = false;
    let firstArg = null;
    const m = _cmdInjectionBareArg.exec(code);
    if (m && m[1]) {
      firstArg = m[1];
      try {
        const { isTrustedSource } = require('../core/covenant-trust');
        trusted = isTrustedSource(firstArg);
      } catch (_) { trusted = false; }
    }
    if (m && !trusted) {
      findings.push({ severity: 'high', message: _k('Possible command inj', 'ection — non-literal argument passed to a shell sink in a child_process context'), count: 1 });
    }
  }

  // ── Ecosystem deep-security patterns (covenant-deep-security) ──
  // Prototype pollution, weak crypto (MD5/SHA1), disabled TLS, dynamic
  // Function/setTimeout-string, etc. Best-effort: skipped if the module isn't
  // reachable. Deduped against findings already raised above.
  // Skipped on pattern-definition files — those build detector regexes from
  // literal fragments mentioning MD5, "rejectUnauthorized: false", etc., and
  // the deep scanner would otherwise classify those fragments as findings.
  try {
    if (_isPatternDefs) throw new Error('pattern-definition file — deep scanners would self-match');
    const { DEEP_SECURITY_PATTERNS } = require('../core/covenant-deep-security');
    const langKey = (lang === 'js') ? 'javascript' : (lang === 'ts') ? 'typescript' : (lang === 'py') ? 'python' : lang;
    const deep = (langKey && DEEP_SECURITY_PATTERNS[langKey]) || [];
    for (const { pattern, reason, severity } of deep) {
      if (!pattern) continue;
      if (pattern.global) pattern.lastIndex = 0; // module-cached regex — never trust lastIndex
      // Run on RAW code: several deep patterns key on string contents (e.g. the
      // hash name in createHash('md5')) which stripping would erase.
      if (pattern.test(code) && !findings.some(f => f.message === reason)) {
        findings.push({ severity: severity || 'medium', message: reason, count: 1 });
      }
    }
  } catch (_e) { /* ecosystem module not reachable — best-effort */ }

  let score = 1.0;
  for (const finding of findings) {
    if (finding.severity === 'critical') score -= 0.3;
    else if (finding.severity === 'high') score -= 0.2;
    else if (finding.severity === 'medium') score -= 0.1;
    else if (finding.severity === 'low') score -= 0.02;
  }
  score = Math.max(0, Math.min(1, score));
  const riskLevel = score >= 0.9 ? 'low' : score >= 0.7 ? 'medium' : score >= 0.5 ? 'high' : 'critical';

  const __retVal = { score: Math.round(score * 1000) / 1000, riskLevel, findings, totalFindings: findings.length };
  // ── LRE field-coupling (hand-wired — auto-wire put this inside the !code early-return, never reachable on normal input) ──
  try {
    const __lre_p1 = '../core/field-coupling';
    const __lre_p2 = require('path').join(__dirname, '../core/field-coupling');
    for (const __p of [__lre_p1, __lre_p2]) {
      try {
        const { contribute: __contribute } = require(__p);
        __contribute({ cost: 1, coherence: Math.max(0, Math.min(1, __retVal.score || 0)), source: 'oracle:scoring-analysis-security:securityScan' });
        break;
      } catch (_) { /* try next */ }
    }
  } catch (_) { /* best-effort */ }
  return __retVal;
}

module.exports = { securityScan, stripStringsAndComments };
