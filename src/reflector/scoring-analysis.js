/**
 * Reflector — Deep Code Analysis
 *
 * Cyclomatic complexity, comment density, security scan,
 * nesting depth, code quality metrics, deepScore, repoScore.
 *
 * Self-referential prevention: Security scan patterns are built
 * dynamically at runtime via string concatenation so this scanner
 * never contains the keywords it scans for as contiguous strings.
 */

const { readFileSync } = require('fs');
const { relative } = require('path');
const { detectLanguage } = require('../core/coherency');
const { observeCoherence } = require('../core/reflection');
const { covenantCheck } = require('../core/covenant');

let _multi;
function getMulti() { return _multi || (_multi = require('./multi')); }

// ─── Self-Referential Prevention: Dynamic Pattern Builders ───
// Build security keywords at runtime so the scanner doesn't flag itself.

function _k(...parts) { return parts.join(''); }

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

// ─── Strip Utilities ───

function stripStringsAndComments(code) {
  return code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/#[^\n]*/g, '')
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

// ─── Cyclomatic Complexity ───

function calculateCyclomaticComplexity(code) {
  const stripped = stripStringsAndComments(code);
  const decisionPoints = countDecisionPoints(stripped);
  const functions = extractFunctionBodies(code);
  const perFunction = functions.map(fn => {
    const fnStripped = stripStringsAndComments(fn.body);
    const points = countDecisionPoints(fnStripped);
    return { name: fn.name, complexity: 1 + points, line: fn.line };
  });

  const total = 1 + decisionPoints;
  const avgPerFunction = perFunction.length > 0
    ? perFunction.reduce((s, f) => s + f.complexity, 0) / perFunction.length
    : total;
  const maxPerFunction = perFunction.length > 0
    ? Math.max(...perFunction.map(f => f.complexity))
    : total;

  return {
    total, perFunction,
    avgPerFunction: Math.round(avgPerFunction * 100) / 100,
    maxPerFunction,
    functionCount: functions.length,
  };
}

function countDecisionPoints(code) {
  let count = 0;
  const keywords = [
    /\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bfor\s*\(/g,
    /\bwhile\s*\(/g, /\bdo\s*\{/g, /\bcase\s+/g, /\bcatch\s*[({]/g,
  ];
  for (const pattern of keywords) {
    const matches = code.match(pattern);
    if (matches) count += matches.length;
  }
  const logicalOps = code.match(/&&|\|\|/g);
  if (logicalOps) count += logicalOps.length;
  const ternaries = code.match(/\?(?![\?.:])/g);
  if (ternaries) count += ternaries.length;
  return count;
}

function extractFunctionBodies(code) {
  const functions = [];
  const lines = code.split('\n');
  const patterns = [
    /(?:^|\s)function\s+(\w+)\s*\([^)]*\)\s*\{/,
    /(?:const|let|var)\s+(\w+)\s*=\s*function\s*\([^)]*\)\s*\{/,
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/,
    /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/,
    /def\s+(\w+)\s*\([^)]*\)\s*:/,
  ];
  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const match = lines[i].match(pattern);
      if (match) {
        const name = match[1];
        const body = extractBody(lines, i);
        if (body) functions.push({ name, body, line: i + 1 });
        break;
      }
    }
  }
  return functions;
}

function extractBody(lines, startLine) {
  let depth = 0;
  let started = false;
  const bodyLines = [];
  for (let i = startLine; i < lines.length; i++) {
    const line = lines[i];
    bodyLines.push(line);
    for (const ch of line) {
      if (ch === '{') { depth++; started = true; }
      if (ch === '}') depth--;
    }
    if (started && depth <= 0) break;
    if (i > startLine && !started) {
      if (lines[startLine].trim().endsWith(':')) {
        started = true;
        const baseIndent = lines[startLine].match(/^(\s*)/)[1].length;
        for (let j = i; j < lines.length; j++) {
          const indent = lines[j].match(/^(\s*)/)[1].length;
          if (lines[j].trim() === '') { bodyLines.push(lines[j]); continue; }
          if (indent > baseIndent) bodyLines.push(lines[j]);
          else break;
        }
        break;
      }
    }
  }
  return bodyLines.length > 0 ? bodyLines.join('\n') : null;
}

// ─── Comment Density ───

function analyzeCommentDensity(code) {
  const lines = code.split('\n');
  let commentLines = 0, codeLines = 0, blankLines = 0, inBlockComment = false, docstrings = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { blankLines++; continue; }
    if (inBlockComment) {
      commentLines++;
      if (trimmed.includes('*/')) inBlockComment = false;
      continue;
    }
    if (trimmed.startsWith('/*')) {
      commentLines++;
      if (trimmed.startsWith('/**')) docstrings++;
      if (!trimmed.includes('*/')) inBlockComment = true;
      continue;
    }
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) { commentLines++; continue; }
    if (trimmed.startsWith('*')) { commentLines++; continue; }
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) { commentLines++; docstrings++; continue; }
    codeLines++;
  }

  const totalMeaningful = commentLines + codeLines;
  const density = totalMeaningful > 0 ? commentLines / totalMeaningful : 0;

  let quality;
  if (density === 0 && codeLines > 10) quality = 0.3;
  else if (density < 0.05 && codeLines > 10) quality = 0.5;
  else if (density >= 0.05 && density <= 0.4) quality = 0.9;
  else if (density > 0.4 && density <= 0.6) quality = 0.7;
  else if (density > 0.6) quality = 0.5;
  else quality = 0.8;
  if (docstrings > 0) quality = Math.min(1, quality + 0.05);

  return {
    density: Math.round(density * 1000) / 1000,
    commentLines, codeLines, blankLines,
    totalLines: lines.length,
    quality: Math.round(quality * 1000) / 1000,
    docstrings,
  };
}

// ─── Security Pattern Scan (dynamic construction — self-referential safe) ───

function securityScan(code, language) {
  const findings = [];
  const lang = (language || '').toLowerCase();

  // Universal: hardcoded secrets (patterns built dynamically)
  for (const { pattern, severity, message } of _buildSecretPatterns()) {
    const matches = code.match(pattern);
    if (matches) findings.push({ severity, message, count: matches.length });
  }

  // JS/TS patterns
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    for (const { test, severity, message } of _buildJsPatterns()) {
      if (test.test(code)) findings.push({ severity, message, count: 1 });
    }

    // child_process exec with user input
    const cpExec = new RegExp(_k('child_pro', 'cess.*ex', 'ec(?:Sync)?\\s*\\('));
    const userInput = /\$\{|` \+|req\.|args|input|param/i;
    if (cpExec.test(code) && userInput.test(code)) {
      findings.push({ severity: 'high', message: _k('Shell command execution with possible user input — ', 'command injection risk'), count: 1 });
    }

    // File access with user-controlled path
    const pathTraversal = new RegExp(_k('\\.createRead', 'Stream\\s*\\([^)]*(?:req|param|input|args)'), 'i');
    if (pathTraversal.test(code)) {
      findings.push({ severity: 'medium', message: _k('File access with user-controlled path — ', 'path traversal risk'), count: 1 });
    }

    // var usage
    if (/\bvar\b/.test(code)) {
      const varCount = (code.match(/\bvar\b/g) || []).length;
      findings.push({ severity: 'low', message: `Use of var (${varCount}x) — prefer const/let for block scoping`, count: varCount });
    }

    // SQL injection
    const sqlConcat = new RegExp(_k("['\"`]\\s*\\+\\s*(?:req|args|param|input|", "query)"), 'i');
    const sqlKeywords = new RegExp(_k('(?:SEL', 'ECT|INS', 'ERT|UPD', 'ATE|DEL', 'ETE|WH', 'ERE)'), 'i');
    if (sqlConcat.test(code) && sqlKeywords.test(code)) {
      findings.push({ severity: 'high', message: _k('Possible SQL injection — ', 'string concatenation in query'), count: 1 });
    }

    // Prototype pollution
    if (/\[(?:req|args|param|input|key)\b[^]]*\]\s*=/.test(code)) {
      findings.push({ severity: 'medium', message: _k('Dynamic property assignment — ', 'possible prototype pollution'), count: 1 });
    }
  }

  // Python patterns
  if (lang === 'python' || lang === 'py') {
    for (const { test, severity, message } of _buildPyPatterns()) {
      if (test.test(code)) findings.push({ severity, message, count: 1 });
    }
    // yaml.load without SafeLoader
    const yamlLoad = new RegExp(_k('ya', 'ml\\.lo', 'ad\\s*\\([^)]*(?!Loader)'));
    const safeLoader = new RegExp(_k('Safe', 'Loader|safe', '_load'));
    if (yamlLoad.test(code) && !safeLoader.test(code)) {
      findings.push({ severity: 'medium', message: _k('yaml.load without Safe', 'Loader — arbitrary code execution risk'), count: 1 });
    }
  }

  // Scoring
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

// ─── Nesting Depth ───

function analyzeNestingDepth(code) {
  const stripped = stripStringsAndComments(code);
  let currentDepth = 0, maxDepth = 0;
  const depths = [];

  for (const ch of stripped) {
    if (ch === '{') { currentDepth++; maxDepth = Math.max(maxDepth, currentDepth); }
    if (ch === '}') currentDepth = Math.max(0, currentDepth - 1);
  }

  currentDepth = 0;
  for (const line of stripped.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    for (const ch of trimmed) {
      if (ch === '{') currentDepth++;
      if (ch === '}') currentDepth = Math.max(0, currentDepth - 1);
    }
    depths.push(currentDepth);
  }

  const avgDepth = depths.length > 0 ? depths.reduce((s, d) => s + d, 0) / depths.length : 0;

  let score = 1.0;
  if (maxDepth > 4) score -= (maxDepth - 4) * 0.1;
  if (avgDepth > 3) score -= (avgDepth - 3) * 0.15;
  score = Math.max(0, Math.min(1, score));

  return {
    maxDepth,
    avgDepth: Math.round(avgDepth * 100) / 100,
    depthDistribution: depths.reduce((d, v) => { d[v] = (d[v] || 0) + 1; return d; }, {}),
    score: Math.round(score * 1000) / 1000,
  };
}

// ─── Code Quality Metrics ───

function computeQualityMetrics(code, language) {
  const lines = code.split('\n');
  const nonBlankLines = lines.filter(l => l.trim());
  const lineLengths = nonBlankLines.map(l => l.length);
  const avgLineLength = lineLengths.length > 0 ? lineLengths.reduce((s, l) => s + l, 0) / lineLengths.length : 0;
  const maxLineLength = lineLengths.length > 0 ? Math.max(...lineLengths) : 0;
  const longLines = lineLengths.filter(l => l > 120).length;
  const veryLongLines = lineLengths.filter(l => l > 200).length;

  const functions = extractFunctionBodies(code);
  const functionLengths = functions.map(f => f.body.split('\n').length);
  const avgFunctionLength = functionLengths.length > 0 ? functionLengths.reduce((s, l) => s + l, 0) / functionLengths.length : 0;
  const maxFunctionLength = functionLengths.length > 0 ? Math.max(...functionLengths) : 0;

  const paramCounts = functions.map(fn => {
    const paramMatch = fn.body.match(/(?:function\s+\w+|=>)\s*\(([^)]*)\)/);
    if (paramMatch && paramMatch[1].trim()) return paramMatch[1].split(',').length;
    return 0;
  }).filter(c => c > 0);
  const maxParams = paramCounts.length > 0 ? Math.max(...paramCounts) : 0;
  const avgParams = paramCounts.length > 0 ? paramCounts.reduce((s, c) => s + c, 0) / paramCounts.length : 0;

  const lineSet = {};
  let duplicateLines = 0;
  for (const line of nonBlankLines) {
    const trimmed = line.trim();
    if (trimmed.length < 10) continue;
    lineSet[trimmed] = (lineSet[trimmed] || 0) + 1;
  }
  for (const count of Object.values(lineSet)) {
    if (count > 1) duplicateLines += count - 1;
  }

  let score = 1.0;
  if (avgLineLength > 100) score -= 0.1;
  if (longLines > 5) score -= 0.1;
  if (veryLongLines > 0) score -= 0.1;
  if (maxFunctionLength > 50) score -= 0.1;
  if (maxFunctionLength > 100) score -= 0.1;
  if (maxParams > 5) score -= 0.1;
  if (duplicateLines > 5) score -= 0.1;
  score = Math.max(0, Math.min(1, score));

  return {
    totalLines: lines.length, codeLines: nonBlankLines.length,
    avgLineLength: Math.round(avgLineLength), maxLineLength, longLines, veryLongLines,
    functionCount: functions.length,
    avgFunctionLength: Math.round(avgFunctionLength), maxFunctionLength,
    maxParams, avgParams: Math.round(avgParams * 10) / 10,
    duplicateLines,
    score: Math.round(score * 1000) / 1000,
  };
}

// ─── Aggregate File Score ───

function deepScore(code, options = {}) {
  const language = options.language || detectLanguage(code);
  const observation = observeCoherence(code, { language });
  const complexity = calculateCyclomaticComplexity(code);
  const comments = analyzeCommentDensity(code);
  const security = securityScan(code, language);
  const nesting = analyzeNestingDepth(code);
  const quality = computeQualityMetrics(code, language);
  const covenant = covenantCheck(code, { language });

  let complexityScore = 1.0;
  if (complexity.avgPerFunction > 10) complexityScore -= 0.2;
  if (complexity.avgPerFunction > 20) complexityScore -= 0.2;
  if (complexity.maxPerFunction > 15) complexityScore -= 0.15;
  if (complexity.maxPerFunction > 30) complexityScore -= 0.15;
  complexityScore = Math.max(0, Math.min(1, complexityScore));

  const weights = options.weights || {
    serfCoherence: 0.30, complexity: 0.15, commentQuality: 0.10,
    security: 0.20, nesting: 0.10, quality: 0.15,
  };

  const aggregate =
    observation.composite * weights.serfCoherence +
    complexityScore * weights.complexity +
    comments.quality * weights.commentQuality +
    security.score * weights.security +
    nesting.score * weights.nesting +
    quality.score * weights.quality;

  return {
    language,
    aggregate: Math.round(aggregate * 1000) / 1000,
    serfCoherence: Math.round(observation.composite * 1000) / 1000,
    serfDimensions: observation.dimensions,
    complexity: {
      score: Math.round(complexityScore * 1000) / 1000,
      total: complexity.total, avgPerFunction: complexity.avgPerFunction,
      maxPerFunction: complexity.maxPerFunction, functionCount: complexity.functionCount,
    },
    comments: {
      score: comments.quality, density: comments.density,
      commentLines: comments.commentLines, codeLines: comments.codeLines, docstrings: comments.docstrings,
    },
    security: { score: security.score, riskLevel: security.riskLevel, findings: security.findings },
    nesting: { score: nesting.score, maxDepth: nesting.maxDepth, avgDepth: nesting.avgDepth },
    quality: {
      score: quality.score, avgLineLength: quality.avgLineLength, maxLineLength: quality.maxLineLength,
      functionCount: quality.functionCount, maxFunctionLength: quality.maxFunctionLength, duplicateLines: quality.duplicateLines,
    },
    covenantSealed: covenant.sealed,
    weights,
  };
}

function repoScore(rootDir, config = {}) {
  const { scanDirectory, DEFAULT_CONFIG } = getMulti();
  const opts = { ...DEFAULT_CONFIG, ...config };
  const filePaths = scanDirectory(rootDir, opts);
  const fileScores = [];

  for (const filePath of filePaths) {
    let code;
    try { code = readFileSync(filePath, 'utf-8'); } catch { continue; }
    if (!code.trim()) continue;
    const result = deepScore(code, { language: detectLanguage(code), weights: opts.weights });
    fileScores.push({ path: relative(rootDir, filePath), ...result });
  }

  if (fileScores.length === 0) {
    return { timestamp: new Date().toISOString(), rootDir, totalFiles: 0, aggregate: 0, dimensions: {}, files: [] };
  }

  const avg = (arr, fn) => arr.reduce((s, f) => s + fn(f), 0) / arr.length;
  const avgAggregate = avg(fileScores, f => f.aggregate);

  const sorted = [...fileScores].sort((a, b) => a.aggregate - b.aggregate);

  return {
    timestamp: new Date().toISOString(), rootDir,
    totalFiles: fileScores.length,
    aggregate: Math.round(avgAggregate * 1000) / 1000,
    dimensions: {
      serfCoherence: Math.round(avg(fileScores, f => f.serfCoherence) * 1000) / 1000,
      complexity: Math.round(avg(fileScores, f => f.complexity.score) * 1000) / 1000,
      commentQuality: Math.round(avg(fileScores, f => f.comments.score) * 1000) / 1000,
      security: Math.round(avg(fileScores, f => f.security.score) * 1000) / 1000,
      nesting: Math.round(avg(fileScores, f => f.nesting.score) * 1000) / 1000,
      quality: Math.round(avg(fileScores, f => f.quality.score) * 1000) / 1000,
    },
    health: avgAggregate >= 0.8 ? 'healthy' : avgAggregate >= 0.6 ? 'stable' : 'needs attention',
    worstFiles: sorted.slice(0, 5).map(f => ({ path: f.path, score: f.aggregate })),
    bestFiles: sorted.slice(-5).reverse().map(f => ({ path: f.path, score: f.aggregate })),
    securityFindings: fileScores.flatMap(f => f.security.findings.map(finding => ({ ...finding, file: f.path }))),
    files: fileScores,
  };
}

function formatDeepScore(result) {
  const lines = [];
  lines.push('── Deep Coherence Score ──');
  lines.push(`  Aggregate:     ${result.aggregate.toFixed(3)}`);
  lines.push(`  SERF:          ${result.serfCoherence.toFixed(3)}`);
  lines.push(`  Complexity:    ${result.complexity.score.toFixed(3)} (avg: ${result.complexity.avgPerFunction}, max: ${result.complexity.maxPerFunction})`);
  lines.push(`  Comments:      ${result.comments.score.toFixed(3)} (density: ${result.comments.density.toFixed(3)}, docstrings: ${result.comments.docstrings})`);
  lines.push(`  Security:      ${result.security.score.toFixed(3)} (${result.security.riskLevel})`);
  lines.push(`  Nesting:       ${result.nesting.score.toFixed(3)} (max: ${result.nesting.maxDepth}, avg: ${result.nesting.avgDepth})`);
  lines.push(`  Quality:       ${result.quality.score.toFixed(3)} (fns: ${result.quality.functionCount}, maxLen: ${result.quality.maxFunctionLength})`);

  if (result.security.findings.length > 0) {
    lines.push('');
    lines.push('  Security Findings:');
    for (const f of result.security.findings) {
      const icon = f.severity === 'critical' ? '[!!]' : f.severity === 'high' ? '[!]' : f.severity === 'medium' ? '[~]' : '[.]';
      lines.push(`    ${icon} ${f.message} (${f.severity})`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  calculateCyclomaticComplexity,
  analyzeCommentDensity,
  securityScan,
  analyzeNestingDepth,
  computeQualityMetrics,
  deepScore,
  repoScore,
  formatDeepScore,
  stripStringsAndComments,
  countDecisionPoints,
  extractFunctionBodies,
};
