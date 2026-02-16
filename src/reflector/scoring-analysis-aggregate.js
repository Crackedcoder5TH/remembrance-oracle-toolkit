/**
 * Reflector — Aggregate scoring: deepScore, repoScore, formatDeepScore.
 */

const { readFileSync } = require('fs');
const { relative } = require('path');
const { detectLanguage } = require('../core/coherency');
const { observeCoherence } = require('../core/reflection');
const { covenantCheck } = require('../core/covenant');
const { calculateCyclomaticComplexity, analyzeCommentDensity, analyzeNestingDepth, computeQualityMetrics } = require('./scoring-analysis-complexity');
const { securityScan } = require('./scoring-analysis-security');

let _multi;
function getMulti() { return _multi || (_multi = require('./multi')); }

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
    complexity: { score: Math.round(complexityScore * 1000) / 1000, total: complexity.total, avgPerFunction: complexity.avgPerFunction, maxPerFunction: complexity.maxPerFunction, functionCount: complexity.functionCount },
    comments: { score: comments.quality, density: comments.density, commentLines: comments.commentLines, codeLines: comments.codeLines, docstrings: comments.docstrings },
    security: { score: security.score, riskLevel: security.riskLevel, findings: security.findings },
    nesting: { score: nesting.score, maxDepth: nesting.maxDepth, avgDepth: nesting.avgDepth },
    quality: { score: quality.score, avgLineLength: quality.avgLineLength, maxLineLength: quality.maxLineLength, functionCount: quality.functionCount, maxFunctionLength: quality.maxFunctionLength, duplicateLines: quality.duplicateLines },
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
    timestamp: new Date().toISOString(), rootDir, totalFiles: fileScores.length,
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
    lines.push('', '  Security Findings:');
    for (const f of result.security.findings) {
      const icon = f.severity === 'critical' ? '[!!]' : f.severity === 'high' ? '[!]' : f.severity === 'medium' ? '[~]' : '[.]';
      lines.push(`    ${icon} ${f.message} (${f.severity})`);
    }
  }
  return lines.join('\n');
}

module.exports = { deepScore, repoScore, formatDeepScore };
