/**
 * Reflector — Coherence Scorer
 *
 * Weighted coherence formula (syntax, readability, security, test proof, reliability).
 * computeCoherence, computeRepoCoherence.
 */

const { readFileSync, existsSync } = require('fs');
const { join, extname, relative, dirname, basename } = require('path');
const { detectLanguage } = require('../core/coherency');
const { covenantCheck } = require('../core/covenant');
const {
  analyzeCommentDensity,
  analyzeNestingDepth,
  computeQualityMetrics,
  securityScan,
  stripStringsAndComments,
} = require('./scoring-analysis');

let _multi, _report;
function getMulti() { return _multi || (_multi = require('./multi')); }
function getReport() { return _report || (_report = require('./report')); }

const DEFAULT_WEIGHTS = {
  syntaxValidity: 0.25,
  readability: 0.20,
  security: 0.15,
  testProof: 0.30,
  historicalReliability: 0.10,
};

// ─── Syntax Validity ───

function scoreSyntaxValidity(code, language) {
  let score = 1.0;
  const details = [];

  const braces = countBalanced(code, '{', '}');
  const brackets = countBalanced(code, '[', ']');
  const parens = countBalanced(code, '(', ')');

  if (braces !== 0) { score -= 0.3; details.push(`Unbalanced braces (${braces > 0 ? '+' : ''}${braces})`); }
  if (brackets !== 0) { score -= 0.15; details.push(`Unbalanced brackets (${brackets > 0 ? '+' : ''}${brackets})`); }
  if (parens !== 0) { score -= 0.15; details.push(`Unbalanced parentheses (${parens > 0 ? '+' : ''}${parens})`); }

  const covenant = covenantCheck(code, { language });
  if (!covenant.sealed) {
    score -= 0.2;
    details.push(`Covenant violations: ${covenant.violations?.length || 'unknown'}`);
  }

  const nonBlank = code.split('\n').filter(l => l.trim()).length;
  if (nonBlank === 0) { score = 0; details.push('Empty file'); }
  else if (nonBlank < 3) { score -= 0.1; details.push('Very small file (< 3 lines)'); }

  return { score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)), details };
}

function countBalanced(code, open, close) {
  const stripped = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '``');
  let count = 0;
  for (const ch of stripped) {
    if (ch === open) count++;
    if (ch === close) count--;
  }
  return count;
}

// ─── Readability ───

function scoreReadability(code, language) {
  const details = [];
  const comments = analyzeCommentDensity(code);
  const commentScore = comments.quality;
  details.push(`Comment density: ${(comments.density * 100).toFixed(0)}% (score: ${commentScore.toFixed(3)})`);

  const nesting = analyzeNestingDepth(code);
  const nestingScore = nesting.score;
  details.push(`Max nesting: ${nesting.maxDepth} (score: ${nestingScore.toFixed(3)})`);

  const quality = computeQualityMetrics(code, language);
  const qualityScore = quality.score;
  details.push(`Code quality: ${qualityScore.toFixed(3)} (avg line: ${quality.avgLineLength}, max fn: ${quality.maxFunctionLength})`);

  const namingScore = scoreNamingQuality(code, language);
  details.push(`Naming quality: ${namingScore.toFixed(3)}`);

  const score = (commentScore * 0.30) + (nestingScore * 0.25) + (qualityScore * 0.25) + (namingScore * 0.20);
  return { score: Math.round(score * 1000) / 1000, commentScore, nestingScore, qualityScore, namingScore, details };
}

function scoreNamingQuality(code, language) {
  const lang = (language || '').toLowerCase();
  let score = 1.0;
  const funcNames = (code.match(/(?:function|const|let|var)\s+(\w+)/g) || [])
    .map(m => m.replace(/(?:function|const|let|var)\s+/, ''));
  if (funcNames.length === 0) return 0.8;

  const shortNames = funcNames.filter(n => n.length <= 1 && !['i', 'j', 'k', 'n', 'x', 'y', '_'].includes(n));
  if (shortNames.length > 0) score -= 0.1 * Math.min(shortNames.length, 3);

  if (lang === 'python' || lang === 'py') {
    const nonSnake = funcNames.filter(n => n.length > 1 && /[A-Z]/.test(n) && !n.startsWith('_'));
    if (nonSnake.length > funcNames.length * 0.3) score -= 0.15;
  } else {
    const nonCamel = funcNames.filter(n => n.length > 1 && n.includes('_') && !n.startsWith('_'));
    if (nonCamel.length > funcNames.length * 0.3) score -= 0.1;
  }

  const avgLen = funcNames.reduce((s, n) => s + n.length, 0) / funcNames.length;
  if (avgLen < 3) score -= 0.15;
  else if (avgLen >= 6) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

// ─── Security ───

function scoreSecurity(code, language) {
  const scan = securityScan(code, language);
  return {
    score: scan.score,
    riskLevel: scan.riskLevel,
    findings: scan.findings,
    details: scan.findings.map(f => `[${f.severity}] ${f.message}`),
  };
}

// ─── Test Proof ───

function scoreTestProof(filePath, rootDir) {
  const details = [];
  const base = basename(filePath, extname(filePath));
  const dir = dirname(filePath);

  const candidates = [
    join(dir, `${base}.test${extname(filePath)}`),
    join(dir, `${base}.spec${extname(filePath)}`),
    join(rootDir, 'tests', `${base}.test${extname(filePath)}`),
    join(rootDir, 'test', `${base}.test${extname(filePath)}`),
    join(rootDir, '__tests__', `${base}.test${extname(filePath)}`),
    join(rootDir, 'tests', `${base}.test.js`),
    join(rootDir, 'test', `${base}.test.js`),
  ];

  let testFile = null;
  let testCode = null;
  for (const candidate of candidates) {
    if (existsSync(candidate)) {
      testFile = candidate;
      try { testCode = readFileSync(candidate, 'utf-8'); } catch { continue; }
      break;
    }
  }

  if (!testFile) {
    details.push('No test file found');
    return { score: 0.0, testFile: null, assertions: 0, details };
  }

  const rel = relative(rootDir, filePath);
  details.push(`Test file: ${relative(rootDir, testFile)}`);

  const importMatch = testCode.includes(base) || testCode.includes(rel);
  if (!importMatch) {
    details.push('Test file does not reference source module');
    return { score: 0.3, testFile: relative(rootDir, testFile), assertions: 0, details };
  }

  const assertPatterns = [
    /assert\.\w+/g, /expect\(/g, /\.toBe\(/g, /\.toEqual\(/g,
    /\.toStrictEqual\(/g, /\.toThrow\(/g, /\.rejects\./g, /\.resolves\./g, /should\.\w+/g,
  ];

  let assertions = 0;
  for (const pat of assertPatterns) {
    const matches = testCode.match(pat);
    if (matches) assertions += matches.length;
  }

  details.push(`Assertions found: ${assertions}`);

  let score;
  if (assertions >= 10) score = 1.0;
  else if (assertions >= 5) score = 0.85;
  else if (assertions >= 2) score = 0.7;
  else if (assertions >= 1) score = 0.5;
  else score = 0.3;

  return { score: Math.round(score * 1000) / 1000, testFile: relative(rootDir, testFile), assertions, details };
}

// ─── Historical Reliability ───

function scoreHistoricalReliability(filePath, rootDir) {
  const { loadHistoryV2 } = getReport();
  const details = [];
  const history = loadHistoryV2(rootDir);
  const runs = history.runs || [];

  if (runs.length === 0) {
    details.push('No run history available');
    return { score: 0.7, details };
  }

  const rel = relative(rootDir, filePath);
  let healCount = 0, totalRuns = 0;
  for (const run of runs) {
    totalRuns++;
    if (run.changes) {
      for (const change of run.changes) {
        if (change.path === rel) healCount++;
      }
    }
  }

  details.push(`Run history: ${totalRuns} runs, healed ${healCount} time(s)`);

  if (healCount === 0) {
    details.push('Never needed healing — highly reliable');
    return { score: 1.0, details };
  }

  const healRate = healCount / totalRuns;
  let score;
  if (healRate > 0.5) { score = 0.3; details.push(`Healed in ${(healRate * 100).toFixed(0)}% of runs — unstable`); }
  else if (healRate > 0.2) { score = 0.6; details.push('Healed occasionally — moderate reliability'); }
  else { score = 0.8; details.push('Rarely healed — good reliability'); }

  const recentRuns = runs.slice(-5);
  const recentHeals = recentRuns.filter(r => r.changes?.some(c => c.path === rel)).length;
  if (recentHeals > 0) {
    score -= 0.1;
    details.push(`Healed in ${recentHeals} of last 5 runs — recent instability`);
  }

  return { score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)), details };
}

// ─── Combined Coherence Score ───

function computeCoherence(filePath, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const weights = options.weights || DEFAULT_WEIGHTS;

  let code;
  try { code = readFileSync(filePath, 'utf-8'); } catch (err) { return { error: err.message, score: 0 }; }

  const language = options.language || detectLanguage(code);
  const syntax = scoreSyntaxValidity(code, language);
  const readability = scoreReadability(code, language);
  const security = scoreSecurity(code, language);
  const testProof = scoreTestProof(filePath, rootDir);
  const reliability = scoreHistoricalReliability(filePath, rootDir);

  const score =
    syntax.score * weights.syntaxValidity +
    readability.score * weights.readability +
    security.score * weights.security +
    testProof.score * weights.testProof +
    reliability.score * weights.historicalReliability;

  return {
    filePath: relative(rootDir, filePath),
    language,
    score: Math.round(score * 1000) / 1000,
    dimensions: {
      syntaxValidity: { score: syntax.score, weight: weights.syntaxValidity, details: syntax.details },
      readability: { score: readability.score, weight: weights.readability, details: readability.details },
      security: { score: security.score, weight: weights.security, riskLevel: security.riskLevel, findings: security.findings },
      testProof: { score: testProof.score, weight: weights.testProof, testFile: testProof.testFile, assertions: testProof.assertions, details: testProof.details },
      historicalReliability: { score: reliability.score, weight: weights.historicalReliability, details: reliability.details },
    },
    weights,
  };
}

function computeRepoCoherence(rootDir, config = {}) {
  const { scanDirectory, DEFAULT_CONFIG } = getMulti();
  const opts = { ...DEFAULT_CONFIG, ...config };
  const filePaths = scanDirectory(rootDir, opts);
  const fileScores = [];

  for (const filePath of filePaths) {
    const result = computeCoherence(filePath, { rootDir, weights: opts.weights || DEFAULT_WEIGHTS });
    if (!result.error) fileScores.push(result);
  }

  if (fileScores.length === 0) {
    return { totalFiles: 0, aggregate: 0, dimensions: {}, files: [] };
  }

  const avgScore = fileScores.reduce((s, f) => s + f.score, 0) / fileScores.length;
  const dimNames = ['syntaxValidity', 'readability', 'security', 'testProof', 'historicalReliability'];
  const dimAvgs = {};
  for (const dim of dimNames) {
    dimAvgs[dim] = Math.round(
      (fileScores.reduce((s, f) => s + (f.dimensions[dim]?.score || 0), 0) / fileScores.length) * 1000
    ) / 1000;
  }

  const sorted = [...fileScores].sort((a, b) => a.score - b.score);

  return {
    timestamp: new Date().toISOString(), rootDir,
    totalFiles: fileScores.length,
    aggregate: Math.round(avgScore * 1000) / 1000,
    dimensions: dimAvgs,
    health: avgScore >= 0.8 ? 'healthy' : avgScore >= 0.6 ? 'stable' : 'needs attention',
    formula: 'coherence = (0.25 * syntax) + (0.20 * readability) + (0.15 * security) + (0.30 * test_proof) + (0.10 * reliability)',
    worstFiles: sorted.slice(0, 5).map(f => ({ path: f.filePath, score: f.score })),
    bestFiles: sorted.slice(-5).reverse().map(f => ({ path: f.filePath, score: f.score })),
    files: fileScores,
  };
}

function formatCoherence(result) {
  const lines = [];
  lines.push(`Coherence: ${result.filePath}`);
  lines.push(`  Score:    ${result.score.toFixed(3)}`);
  lines.push(`  Language: ${result.language}`);
  lines.push('');
  lines.push('  Dimensions:');
  for (const [dim, data] of Object.entries(result.dimensions)) {
    lines.push(`    ${dim.padEnd(24)} ${data.score.toFixed(3)} (weight: ${data.weight})`);
    if (data.details) {
      for (const d of data.details) lines.push(`      ${d}`);
    }
  }
  return lines.join('\n');
}

module.exports = {
  DEFAULT_WEIGHTS,
  scoreSyntaxValidity,
  scoreReadability,
  scoreNamingQuality,
  scoreSecurity,
  scoreTestProof,
  scoreHistoricalReliability,
  computeCoherence,
  computeRepoCoherence,
  formatCoherence,
};
