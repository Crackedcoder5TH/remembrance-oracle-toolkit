/**
 * Reflector — Security pattern scanning.
 * Dynamic pattern builders prevent self-referential false positives.
 *
 * @oracle-pattern-definitions
 */

function _k(...parts) { return parts.join(''); }

function stripStringsAndComments(code) {
  if (!code) return '';
  return code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#[^\n]*/g, '')
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '')
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
  if (!code) return { score: 1, riskLevel: 'none', findings: [], totalFindings: 0 };
  const findings = [];
  const lang = (language || '').toLowerCase();

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
      if (test.test(code)) findings.push({ severity, message, count: 1 });
    }
  }

  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    for (const { test, severity, message } of _buildJsPatterns()) {
      if (test.test(code)) findings.push({ severity, message, count: 1 });
    }
    const cpExec = new RegExp(_k('child_pro', 'cess.*ex', 'ec(?:Sync)?\\s*\\('));
    const userInput = /\$\{|` \+|req\.|args|input|param/i;
    if (cpExec.test(code) && userInput.test(code)) {
      findings.push({ severity: 'high', message: _k('Shell command execution with possible user input — ', 'command injection risk'), count: 1 });
    }
    const pathTraversal = new RegExp(_k('\\.createRead', 'Stream\\s*\\([^)]*(?:req|param|input|args)'), 'i');
    if (pathTraversal.test(code)) {
      findings.push({ severity: 'medium', message: _k('File access with user-controlled path — ', 'path traversal risk'), count: 1 });
    }
    if (/\bvar\b/.test(code)) {
      const varCount = (code.match(/\bvar\b/g) || []).length;
      findings.push({ severity: 'low', message: `Use of var (${varCount}x) — prefer const/let for block scoping`, count: varCount });
    }
    const sqlConcat = new RegExp(_k("['\"`]\\s*\\+\\s*(?:req|args|param|input|", "query)"), 'i');
    const sqlKeywords = new RegExp(_k('(?:SEL', 'ECT|INS', 'ERT|UPD', 'ATE|DEL', 'ETE|WH', 'ERE)'), 'i');
    if (sqlConcat.test(code) && sqlKeywords.test(code)) {
      findings.push({ severity: 'high', message: _k('Possible SQL injection — ', 'string concatenation in query'), count: 1 });
    }
    if (/\[(?:req|args|param|input|key)\b[^]]*\]\s*=/.test(code)) {
      findings.push({ severity: 'medium', message: _k('Dynamic property assignment — ', 'possible prototype pollution'), count: 1 });
    }
  }

  if (lang === 'python' || lang === 'py') {
    for (const { test, severity, message } of _buildPyPatterns()) {
      if (test.test(code)) findings.push({ severity, message, count: 1 });
    }
    const yamlLoad = new RegExp(_k('ya', 'ml\\.lo', 'ad\\s*\\([^)]*(?!Loader)'));
    const safeLoader = new RegExp(_k('Safe', 'Loader|safe', '_load'));
    if (yamlLoad.test(code) && !safeLoader.test(code)) {
      findings.push({ severity: 'medium', message: _k('yaml.load without Safe', 'Loader — arbitrary code execution risk'), count: 1 });
    }
  }

  let score = 1.0;
  for (const finding of findings) {
    if (finding.severity === 'critical') score -= 0.3;
    else if (finding.severity === 'high') score -= 0.2;
    else if (finding.severity === 'medium') score -= 0.1;
    else if (finding.severity === 'low') score -= 0.02;
  }
  score = Math.max(0, Math.min(1, score));
  const riskLevel = score >= 0.9 ? 'low' : score >= 0.7 ? 'medium' : score >= 0.5 ? 'high' : 'critical';

  return { score: Math.round(score * 1000) / 1000, riskLevel, findings, totalFindings: findings.length };
}

module.exports = { securityScan, stripStringsAndComments };
