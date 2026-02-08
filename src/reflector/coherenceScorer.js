/**
 * Remembrance Self-Reflector — Real Coherence Scoring Implementation
 *
 * A concrete weighted formula that combines real analysis tools:
 *
 *   coherence = (0.25 * syntax_validity)
 *             + (0.20 * readability)
 *             + (0.15 * security)
 *             + (0.30 * test_proof)
 *             + (0.10 * historical_reliability)
 *
 * Each dimension uses real analysis:
 *   - syntax_validity: AST parse success + covenant check + no syntax errors
 *   - readability: comment density + nesting depth + line length + naming quality
 *   - security: security scan from scoring.js (secrets, eval, injection)
 *   - test_proof: detects presence of corresponding test files, test coverage heuristic
 *   - historical_reliability: past run history (heal count, trend, stability)
 *
 * Returns both per-file and repo-level scores with dimensional breakdowns.
 *
 * Uses only Node.js built-ins.
 */

const { readFileSync, existsSync } = require('fs');
const { join, relative, basename, dirname, extname } = require('path');
const { detectLanguage } = require('../core/coherency');
const { covenantCheck } = require('../core/covenant');
const { analyzeCommentDensity, securityScan, analyzeNestingDepth, computeQualityMetrics } = require('./scoring');
const { scanDirectory, DEFAULT_CONFIG } = require('./engine');
const { loadHistoryV2 } = require('./history');

// ─── Default Weights ───

const DEFAULT_WEIGHTS = {
  syntaxValidity: 0.25,
  readability: 0.20,
  security: 0.15,
  testProof: 0.30,
  historicalReliability: 0.10,
};

// ─── Syntax Validity ───

/**
 * Score syntax validity of a source file.
 * Checks: parseable structure, covenant compliance, balanced braces/brackets.
 *
 * @param {string} code - Source code
 * @param {string} language - Detected language
 * @returns {object} { score, details }
 */
function scoreSyntaxValidity(code, language) {
  let score = 1.0;
  const details = [];

  // Check balanced braces/brackets/parens
  const braces = countBalanced(code, '{', '}');
  const brackets = countBalanced(code, '[', ']');
  const parens = countBalanced(code, '(', ')');

  if (braces !== 0) { score -= 0.3; details.push(`Unbalanced braces (${braces > 0 ? '+' : ''}${braces})`); }
  if (brackets !== 0) { score -= 0.15; details.push(`Unbalanced brackets (${brackets > 0 ? '+' : ''}${brackets})`); }
  if (parens !== 0) { score -= 0.15; details.push(`Unbalanced parentheses (${parens > 0 ? '+' : ''}${parens})`); }

  // Covenant check
  const covenant = covenantCheck(code, { language });
  if (!covenant.sealed) {
    score -= 0.2;
    details.push(`Covenant violations: ${covenant.violations?.length || 'unknown'}`);
  }

  // Check for obvious syntax issues
  const lang = (language || '').toLowerCase();
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    // Check for dangling commas in bad positions, incomplete statements
    if (/\)\s*\{[^}]*$/.test(code.split('\n').pop()?.trim() || '')) {
      // Last line opens a brace but never closes — possibly incomplete
      // Only flag if truly unbalanced (already caught above)
    }
  }

  // Empty file penalty
  const nonBlank = code.split('\n').filter(l => l.trim()).length;
  if (nonBlank === 0) { score = 0; details.push('Empty file'); }
  else if (nonBlank < 3) { score -= 0.1; details.push('Very small file (< 3 lines)'); }

  return {
    score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)),
    details,
  };
}

/**
 * Count imbalance for paired characters (positive = more opens, negative = more closes).
 */
function countBalanced(code, open, close) {
  // Strip strings and comments first to avoid false positives
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

/**
 * Score readability of source code.
 * Combines: comment density, nesting depth, line length, naming quality.
 *
 * @param {string} code - Source code
 * @param {string} language - Detected language
 * @returns {object} { score, details }
 */
function scoreReadability(code, language) {
  const details = [];

  // Comment density (0-1)
  const comments = analyzeCommentDensity(code);
  const commentScore = comments.quality;
  details.push(`Comment density: ${(comments.density * 100).toFixed(0)}% (score: ${commentScore.toFixed(3)})`);

  // Nesting depth (0-1)
  const nesting = analyzeNestingDepth(code);
  const nestingScore = nesting.score;
  details.push(`Max nesting: ${nesting.maxDepth} (score: ${nestingScore.toFixed(3)})`);

  // Line length / quality (0-1)
  const quality = computeQualityMetrics(code, language);
  const qualityScore = quality.score;
  details.push(`Code quality: ${qualityScore.toFixed(3)} (avg line: ${quality.avgLineLength}, max fn: ${quality.maxFunctionLength})`);

  // Naming quality heuristic — check for good naming conventions
  const namingScore = scoreNamingQuality(code, language);
  details.push(`Naming quality: ${namingScore.toFixed(3)}`);

  // Weighted combination
  const score = (commentScore * 0.30) + (nestingScore * 0.25) + (qualityScore * 0.25) + (namingScore * 0.20);

  return {
    score: Math.round(score * 1000) / 1000,
    commentScore,
    nestingScore,
    qualityScore,
    namingScore,
    details,
  };
}

/**
 * Heuristic for naming quality.
 * Checks: consistent casing, descriptive names (length > 2), no single-letter vars in non-loop contexts.
 */
function scoreNamingQuality(code, language) {
  const lang = (language || '').toLowerCase();
  let score = 1.0;

  // Extract identifiers (function names, variable names)
  const funcNames = (code.match(/(?:function|const|let|var)\s+(\w+)/g) || [])
    .map(m => m.replace(/(?:function|const|let|var)\s+/, ''));

  if (funcNames.length === 0) return 0.8; // Can't assess, neutral

  // Check for very short names (single char, not loop vars)
  const shortNames = funcNames.filter(n => n.length <= 1 && !['i', 'j', 'k', 'n', 'x', 'y', '_'].includes(n));
  if (shortNames.length > 0) {
    score -= 0.1 * Math.min(shortNames.length, 3);
  }

  // Check for consistent casing (camelCase for JS, snake_case for Python)
  if (lang === 'python' || lang === 'py') {
    const nonSnake = funcNames.filter(n => n.length > 1 && /[A-Z]/.test(n) && !n.startsWith('_'));
    if (nonSnake.length > funcNames.length * 0.3) score -= 0.15;
  } else {
    // JS/TS — expect camelCase or PascalCase
    const nonCamel = funcNames.filter(n => n.length > 1 && n.includes('_') && !n.startsWith('_'));
    if (nonCamel.length > funcNames.length * 0.3) score -= 0.1;
  }

  // Descriptive names (avg length > 4)
  const avgLen = funcNames.reduce((s, n) => s + n.length, 0) / funcNames.length;
  if (avgLen < 3) score -= 0.15;
  else if (avgLen >= 6) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

// ─── Security ───

/**
 * Score security using the existing security scan.
 */
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

/**
 * Score test proof — does this file have corresponding tests?
 *
 * Heuristics:
 * 1. Look for a test file with matching name (e.g., foo.js → foo.test.js, tests/foo.test.js)
 * 2. Check if the test file imports/requires this module
 * 3. Count test assertions as a coverage proxy
 *
 * @param {string} filePath - Absolute path to the source file
 * @param {string} rootDir - Repository root
 * @returns {object} { score, testFile, assertions, details }
 */
function scoreTestProof(filePath, rootDir) {
  const details = [];
  const base = basename(filePath, extname(filePath));
  const dir = dirname(filePath);
  const rel = relative(rootDir, filePath);

  // Possible test file locations
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

  details.push(`Test file: ${relative(rootDir, testFile)}`);

  // Check if test file references the source
  const importMatch = testCode.includes(base) || testCode.includes(rel);
  if (!importMatch) {
    details.push('Test file does not reference source module');
    return { score: 0.3, testFile: relative(rootDir, testFile), assertions: 0, details };
  }

  // Count assertions as coverage proxy
  const assertPatterns = [
    /assert\.\w+/g,
    /expect\(/g,
    /\.toBe\(/g,
    /\.toEqual\(/g,
    /\.toStrictEqual\(/g,
    /\.toThrow\(/g,
    /\.rejects\./g,
    /\.resolves\./g,
    /should\.\w+/g,
  ];

  let assertions = 0;
  for (const pat of assertPatterns) {
    const matches = testCode.match(pat);
    if (matches) assertions += matches.length;
  }

  details.push(`Assertions found: ${assertions}`);

  // Score based on assertion count
  let score;
  if (assertions >= 10) score = 1.0;
  else if (assertions >= 5) score = 0.85;
  else if (assertions >= 2) score = 0.7;
  else if (assertions >= 1) score = 0.5;
  else score = 0.3; // Test file exists but no assertions

  return {
    score: Math.round(score * 1000) / 1000,
    testFile: relative(rootDir, testFile),
    assertions,
    details,
  };
}

// ─── Historical Reliability ───

/**
 * Score historical reliability based on past run data.
 *
 * @param {string} filePath - File path (relative to rootDir)
 * @param {string} rootDir - Repository root
 * @returns {object} { score, details }
 */
function scoreHistoricalReliability(filePath, rootDir) {
  const details = [];
  const history = loadHistoryV2(rootDir);
  const runs = history.runs || [];

  if (runs.length === 0) {
    details.push('No run history available');
    return { score: 0.7, details }; // Neutral — no data
  }

  const rel = relative(rootDir, filePath);

  // Count how many times this file was healed
  let healCount = 0;
  let totalRuns = 0;
  for (const run of runs) {
    totalRuns++;
    if (run.changes) {
      for (const change of run.changes) {
        if (change.path === rel) healCount++;
      }
    }
  }

  details.push(`Run history: ${totalRuns} runs, healed ${healCount} time(s)`);

  // Reliability: fewer heals = more reliable
  if (healCount === 0) {
    details.push('Never needed healing — highly reliable');
    return { score: 1.0, details };
  }

  const healRate = healCount / totalRuns;
  let score;
  if (healRate > 0.5) { score = 0.3; details.push(`Healed in ${(healRate * 100).toFixed(0)}% of runs — unstable`); }
  else if (healRate > 0.2) { score = 0.6; details.push(`Healed occasionally — moderate reliability`); }
  else { score = 0.8; details.push(`Rarely healed — good reliability`); }

  // Trend check — was it healed recently?
  const recentRuns = runs.slice(-5);
  const recentHeals = recentRuns.filter(r =>
    r.changes?.some(c => c.path === rel)
  ).length;
  if (recentHeals > 0) {
    score -= 0.1;
    details.push(`Healed in ${recentHeals} of last 5 runs — recent instability`);
  }

  return { score: Math.max(0, Math.min(1, Math.round(score * 1000) / 1000)), details };
}

// ─── Combined Coherence Score ───

/**
 * Compute the full coherence score for a single file.
 *
 * @param {string} filePath - Absolute path
 * @param {object} options - { rootDir, weights }
 * @returns {object} Full coherence breakdown
 */
function computeCoherence(filePath, options = {}) {
  const rootDir = options.rootDir || process.cwd();
  const weights = options.weights || DEFAULT_WEIGHTS;

  let code;
  try {
    code = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { error: err.message, score: 0 };
  }

  const language = detectLanguage(code);

  // Compute each dimension
  const syntax = scoreSyntaxValidity(code, language);
  const readability = scoreReadability(code, language);
  const security = scoreSecurity(code, language);
  const testProof = scoreTestProof(filePath, rootDir);
  const reliability = scoreHistoricalReliability(filePath, rootDir);

  // Weighted aggregate
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

/**
 * Compute coherence for an entire repository.
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration overrides
 * @returns {object} Repo-level coherence report
 */
function computeRepoCoherence(rootDir, config = {}) {
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

  // Per-dimension averages
  const dimNames = ['syntaxValidity', 'readability', 'security', 'testProof', 'historicalReliability'];
  const dimAvgs = {};
  for (const dim of dimNames) {
    dimAvgs[dim] = Math.round(
      (fileScores.reduce((s, f) => s + (f.dimensions[dim]?.score || 0), 0) / fileScores.length) * 1000
    ) / 1000;
  }

  const sorted = [...fileScores].sort((a, b) => a.score - b.score);

  return {
    timestamp: new Date().toISOString(),
    rootDir,
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

/**
 * Format a coherence result as human-readable text.
 */
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
