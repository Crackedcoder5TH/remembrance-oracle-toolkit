/**
 * Reflector — Aggregate scoring: deepScore, repoScore, formatDeepScore.
 */

const { readFileSync } = require('fs');
const { relative, resolve } = require('path');
const { detectLanguage } = require('../core/coherency');
const { observeCoherence } = require('../core/reflection');
const { covenantCheck } = require('../core/covenant');
const { calculateCyclomaticComplexity, analyzeCommentDensity, analyzeNestingDepth, computeQualityMetrics, extractFunctionBodies } = require('./scoring-analysis-complexity');
const { securityScan } = require('./scoring-analysis-security');

const { multi: getMulti } = require('./report-lazy');

function deepScore(code, options = {}) {
  if (!code) return { aggregate: 0, dimensions: {}, covenant: { sealed: false }, securityFindings: [] };
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
  const codeCache = Object.create(null);

  for (const filePath of filePaths) {
    let code;
    try { code = readFileSync(filePath, 'utf-8'); } catch { continue; }
    if (!code.trim()) continue;
    const relPath = relative(rootDir, filePath);
    codeCache[relPath] = code;
    const result = deepScore(code, { language: detectLanguage(code), weights: opts.weights });
    fileScores.push({ path: relPath, ...result });
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
    crossFile: crossFileAnalysis(rootDir, fileScores, codeCache),
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

/**
 * Cross-file analysis — detects structural issues across files that
 * per-file scoring misses: duplicate functions, circular dependencies,
 * and cross-file code similarity.
 */
function crossFileAnalysis(rootDir, fileScores, codeCache) {
  const _cache = codeCache || Object.create(null);
  const _readCode = (filePath) => {
    if (_cache[filePath]) return _cache[filePath];
    try { return readFileSync(resolve(rootDir, filePath), 'utf-8'); } catch { return null; }
  };
  const findings = [];

  // 1. Detect duplicate functions across files (same name AND similar body)
  const fnMap = Object.create(null);
  const KEYWORDS = new Set(['for', 'if', 'while', 'switch', 'catch', 'return', 'new', 'try', 'get', 'set', 'constructor', 'toString']);
  for (const file of fileScores) {
    const code = _readCode(file.path);
    if (!code) continue;
    const fns = extractFunctionBodies(code);
    for (const fn of fns) {
      if (!fnMap[fn.name]) fnMap[fn.name] = [];
      // Normalize body for similarity comparison: strip whitespace and comments
      const normalized = fn.body.replace(/\/\/[^\n]*/g, '').replace(/\s+/g, ' ').trim();
      fnMap[fn.name].push({ file: file.path, line: fn.line, bodyLength: fn.body.split('\n').length, normalized });
    }
  }
  for (const [name, locations] of Object.entries(fnMap)) {
    if (locations.length > 1 && !KEYWORDS.has(name) && name.length > 2) {
      // Group by similar bodies — only flag when bodies actually overlap
      const groups = [];
      for (const loc of locations) {
        let matched = false;
        for (const group of groups) {
          // Compare normalized bodies: if one starts with the other or >60% overlap
          const a = group[0].normalized;
          const b = loc.normalized;
          const shorter = a.length < b.length ? a : b;
          const longer = a.length < b.length ? b : a;
          if (shorter.length > 20 && longer.includes(shorter.slice(0, Math.floor(shorter.length * 0.6)))) {
            group.push(loc);
            matched = true;
            break;
          }
        }
        if (!matched) groups.push([loc]);
      }
      // Only report groups with similar bodies across different files
      for (const group of groups) {
        const uniqueFiles = new Set(group.map(l => l.file));
        if (uniqueFiles.size > 1) {
          findings.push({
            type: 'duplicate-function',
            severity: 'medium',
            message: `Function "${name}" duplicated across ${uniqueFiles.size} files (similar bodies)`,
            files: group.map(l => `${l.file}:${l.line}`),
          });
        }
      }
    }
  }

  // 2. Detect circular require chains
  const requireMap = {};
  for (const file of fileScores) {
    const code = _readCode(file.path);
    if (!code) continue;
    const requires = [];
    const reqPattern = /require\s*\(\s*['"](\.\.?\/[^'"]+)['"]\s*\)/g;
    let match;
    while ((match = reqPattern.exec(code)) !== null) {
      const reqPath = match[1].replace(/\.js$/, '');
      requires.push(reqPath);
    }
    requireMap[file.path] = requires;
  }

  const visited = new Set();
  const inStack = new Set();
  const cycles = [];

  function dfs(file, path) {
    if (inStack.has(file)) {
      const cycleStart = path.indexOf(file);
      if (cycleStart >= 0) cycles.push(path.slice(cycleStart).concat(file));
      return;
    }
    if (visited.has(file)) return;
    visited.add(file);
    inStack.add(file);
    for (const req of (requireMap[file] || [])) {
      const resolved = Object.keys(requireMap).find(f =>
        f.endsWith(req + '.js') || f.endsWith(req) || f === req
      );
      if (resolved) dfs(resolved, [...path, file]);
    }
    inStack.delete(file);
  }

  for (const file of Object.keys(requireMap)) {
    dfs(file, []);
  }
  for (const cycle of cycles.slice(0, 5)) {
    findings.push({
      type: 'circular-dependency',
      severity: 'high',
      message: `Circular require chain: ${cycle.join(' \u2192 ')}`,
      files: cycle,
    });
  }

  // 3. Cross-file code similarity (duplicate blocks across files)
  const blockMap = {};
  for (const file of fileScores) {
    const code = _readCode(file.path);
    if (!code) continue;
    const lines = code.split('\n');
    for (let i = 0; i <= lines.length - 5; i++) {
      const block = lines.slice(i, i + 5).map(l => l.trim()).filter(l => l && l.length > 10);
      if (block.length < 3) continue;
      const key = block.join('\n');
      if (!blockMap[key]) blockMap[key] = [];
      blockMap[key].push({ file: file.path, line: i + 1 });
    }
  }
  const duplicateBlocks = Object.entries(blockMap)
    .filter(([, locs]) => new Set(locs.map(l => l.file)).size > 1)
    .slice(0, 10);

  for (const [, locs] of duplicateBlocks) {
    const uniqueFiles = [...new Set(locs.map(l => l.file))];
    findings.push({
      type: 'cross-file-duplication',
      severity: 'low',
      message: `Duplicate code block across ${uniqueFiles.length} files`,
      files: locs.map(l => `${l.file}:${l.line}`),
    });
  }

  return {
    totalFindings: findings.length,
    duplicateFunctions: findings.filter(f => f.type === 'duplicate-function').length,
    circularDependencies: findings.filter(f => f.type === 'circular-dependency').length,
    crossFileDuplication: findings.filter(f => f.type === 'cross-file-duplication').length,
    findings,
  };
}

module.exports = { deepScore, repoScore, formatDeepScore, crossFileAnalysis };
