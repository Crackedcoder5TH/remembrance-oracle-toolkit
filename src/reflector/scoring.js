/**
 * Remembrance Self-Reflector — Real Coherence Scoring Engine
 *
 * Deep code analysis beyond the basic SERF dimension scorers:
 *
 * 1. Cyclomatic Complexity — count branching paths per function
 * 2. Comment Density — ratio of comment lines to code with quality scoring
 * 3. Security Pattern Scan — detect dangerous patterns, secrets, unsafe API usage
 * 4. Nesting Depth Analysis — score and penalize deep nesting
 * 5. Code Quality Metrics — line length, function length, parameter count
 * 6. Aggregate Scoring — weighted composite with per-file and repo-level scores
 *
 * Uses only Node.js built-ins — no external linting tools required.
 */

const { readFileSync, readdirSync, statSync } = require('fs');
const { join, extname, relative } = require('path');
const { detectLanguage } = require('../core/coherency');
const { observeCoherence } = require('../core/reflection');
const { covenantCheck } = require('../core/covenant');
const { scanDirectory, DEFAULT_CONFIG } = require('./engine');

// ─── Cyclomatic Complexity ───

/**
 * Calculate cyclomatic complexity for a code string.
 *
 * Counts decision points:
 *   if, else if, for, while, do, case, catch, &&, ||, ternary (?:)
 *
 * Starts at 1 (the base linear path). Each decision point adds 1.
 *
 * @param {string} code - Source code
 * @returns {object} { total, perFunction[], avgPerFunction, maxPerFunction }
 */
function calculateCyclomaticComplexity(code) {
  // Strip strings and comments to avoid false positives
  const stripped = stripStringsAndComments(code);

  // Count total decision points
  const decisionPoints = countDecisionPoints(stripped);

  // Extract per-function complexity
  const functions = extractFunctionBodies(code);
  const perFunction = functions.map(fn => {
    const fnStripped = stripStringsAndComments(fn.body);
    const points = countDecisionPoints(fnStripped);
    return {
      name: fn.name,
      complexity: 1 + points, // Base 1 + decision points
      line: fn.line,
    };
  });

  const total = 1 + decisionPoints;
  const avgPerFunction = perFunction.length > 0
    ? perFunction.reduce((s, f) => s + f.complexity, 0) / perFunction.length
    : total;
  const maxPerFunction = perFunction.length > 0
    ? Math.max(...perFunction.map(f => f.complexity))
    : total;

  return {
    total,
    perFunction,
    avgPerFunction: Math.round(avgPerFunction * 100) / 100,
    maxPerFunction,
    functionCount: functions.length,
  };
}

/**
 * Count decision points in stripped code.
 */
function countDecisionPoints(code) {
  let count = 0;

  // Control flow keywords
  const keywords = [
    /\bif\s*\(/g,
    /\belse\s+if\s*\(/g,
    /\bfor\s*\(/g,
    /\bwhile\s*\(/g,
    /\bdo\s*\{/g,
    /\bcase\s+/g,
    /\bcatch\s*[({]/g,
  ];

  for (const pattern of keywords) {
    const matches = code.match(pattern);
    if (matches) count += matches.length;
  }

  // Logical operators (short-circuit = branching)
  const logicalOps = code.match(/&&|\|\|/g);
  if (logicalOps) count += logicalOps.length;

  // Ternary operator
  // Match ? that's not part of ?. (optional chaining) or ?? (nullish coalescing)
  const ternaries = code.match(/\?(?![\?.:])/g);
  if (ternaries) count += ternaries.length;

  return count;
}

/**
 * Extract function bodies with names and line numbers.
 */
function extractFunctionBodies(code) {
  const functions = [];
  const lines = code.split('\n');

  // Patterns to match function declarations
  const patterns = [
    // function name(...)
    /(?:^|\s)function\s+(\w+)\s*\([^)]*\)\s*\{/,
    // const/let/var name = function(...)
    /(?:const|let|var)\s+(\w+)\s*=\s*function\s*\([^)]*\)\s*\{/,
    // const/let/var name = (...) =>
    /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\([^)]*\)\s*=>\s*\{/,
    // method: name(...) { (class methods)
    /^\s*(?:async\s+)?(\w+)\s*\([^)]*\)\s*\{/,
    // Python: def name(...)
    /def\s+(\w+)\s*\([^)]*\)\s*:/,
  ];

  for (let i = 0; i < lines.length; i++) {
    for (const pattern of patterns) {
      const match = lines[i].match(pattern);
      if (match) {
        const name = match[1];
        // Find the function body (rough extraction)
        const body = extractBody(lines, i);
        if (body) {
          functions.push({ name, body, line: i + 1 });
        }
        break;
      }
    }
  }

  return functions;
}

/**
 * Extract a function body starting from a line (brace counting).
 */
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

    // Python: use indentation (rough)
    if (i > startLine && !started) {
      // Check if this is a Python def (colon at end)
      if (lines[startLine].trim().endsWith(':')) {
        started = true;
        const baseIndent = lines[startLine].match(/^(\s*)/)[1].length;
        // Collect indented lines
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

/**
 * Analyze comment density and quality.
 *
 * @param {string} code - Source code
 * @returns {object} { density, commentLines, codeLines, quality, docstrings }
 */
function analyzeCommentDensity(code) {
  const lines = code.split('\n');
  let commentLines = 0;
  let codeLines = 0;
  let blankLines = 0;
  let inBlockComment = false;
  let docstrings = 0;

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed) {
      blankLines++;
      continue;
    }

    // Block comment tracking
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

    // Single-line comments
    if (trimmed.startsWith('//') || trimmed.startsWith('#')) {
      commentLines++;
      continue;
    }

    // JSDoc/docstring continuation
    if (trimmed.startsWith('*')) {
      commentLines++;
      continue;
    }

    // Python docstrings
    if (trimmed.startsWith('"""') || trimmed.startsWith("'''")) {
      commentLines++;
      docstrings++;
      continue;
    }

    codeLines++;
  }

  const totalMeaningful = commentLines + codeLines;
  const density = totalMeaningful > 0 ? commentLines / totalMeaningful : 0;

  // Quality score based on comment density
  // Ideal: 15-30% comments for production code
  let quality;
  if (density === 0 && codeLines > 10) {
    quality = 0.3; // No comments in substantial code
  } else if (density < 0.05 && codeLines > 10) {
    quality = 0.5; // Very few comments
  } else if (density >= 0.05 && density <= 0.4) {
    quality = 0.9; // Good range
  } else if (density > 0.4 && density <= 0.6) {
    quality = 0.7; // Heavily commented but ok
  } else if (density > 0.6) {
    quality = 0.5; // More comments than code
  } else {
    quality = 0.8; // Small files, acceptable
  }

  // Bonus for JSDoc/docstrings
  if (docstrings > 0) quality = Math.min(1, quality + 0.05);

  return {
    density: Math.round(density * 1000) / 1000,
    commentLines,
    codeLines,
    blankLines,
    totalLines: lines.length,
    quality: Math.round(quality * 1000) / 1000,
    docstrings,
  };
}

// ─── Security Pattern Scan ───

/**
 * Scan code for security anti-patterns and vulnerabilities.
 *
 * @param {string} code - Source code
 * @param {string} language - Detected language
 * @returns {object} { score, findings[], riskLevel }
 */
function securityScan(code, language) {
  const findings = [];
  const lang = (language || '').toLowerCase();

  // ─── Universal patterns ───

  // Hardcoded secrets
  const secretPatterns = [
    { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"][A-Za-z0-9+/=]{16,}['"]/gi, severity: 'high', message: 'Possible hardcoded API key' },
    { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"][^'"]{4,}['"]/gi, severity: 'high', message: 'Possible hardcoded password' },
    { pattern: /(?:secret|token)\s*[:=]\s*['"][A-Za-z0-9+/=]{16,}['"]/gi, severity: 'high', message: 'Possible hardcoded secret/token' },
    { pattern: /(?:aws_access_key|aws_secret)\s*[:=]\s*['"][A-Z0-9]{16,}['"]/gi, severity: 'critical', message: 'Possible hardcoded AWS credential' },
    { pattern: /-----BEGIN\s+(RSA\s+)?PRIVATE\s+KEY-----/g, severity: 'critical', message: 'Private key in source code' },
  ];

  for (const { pattern, severity, message } of secretPatterns) {
    const matches = code.match(pattern);
    if (matches) {
      findings.push({ severity, message, count: matches.length });
    }
  }

  // ─── JavaScript / TypeScript patterns ───

  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    if (/\beval\s*\(/.test(code)) {
      findings.push({ severity: 'high', message: 'Use of eval() — code injection risk', count: 1 });
    }
    if (/new\s+Function\s*\(/.test(code)) {
      findings.push({ severity: 'high', message: 'Use of new Function() — code injection risk', count: 1 });
    }
    if (/innerHTML\s*=/.test(code)) {
      findings.push({ severity: 'medium', message: 'Direct innerHTML assignment — XSS risk', count: 1 });
    }
    if (/document\.write\s*\(/.test(code)) {
      findings.push({ severity: 'medium', message: 'document.write() — XSS risk', count: 1 });
    }
    if (/child_process.*exec(?:Sync)?\s*\(/.test(code)) {
      // Only flag if user input might flow into it
      if (/\$\{|` \+|req\.|args|input|param/i.test(code)) {
        findings.push({ severity: 'high', message: 'Shell command execution with possible user input — command injection risk', count: 1 });
      }
    }
    if (/\.createReadStream\s*\([^)]*(?:req|param|input|args)/i.test(code)) {
      findings.push({ severity: 'medium', message: 'File access with user-controlled path — path traversal risk', count: 1 });
    }
    if (/\bvar\b/.test(code)) {
      const varCount = (code.match(/\bvar\b/g) || []).length;
      findings.push({ severity: 'low', message: `Use of var (${varCount}x) — prefer const/let for block scoping`, count: varCount });
    }
    // SQL injection
    if (/['"`]\s*\+\s*(?:req|args|param|input|query)/i.test(code) && /(?:SELECT|INSERT|UPDATE|DELETE|WHERE)/i.test(code)) {
      findings.push({ severity: 'high', message: 'Possible SQL injection — string concatenation in query', count: 1 });
    }
    // Prototype pollution
    if (/\[(?:req|args|param|input|key)\b[^]]*\]\s*=/.test(code)) {
      findings.push({ severity: 'medium', message: 'Dynamic property assignment — possible prototype pollution', count: 1 });
    }
  }

  // ─── Python patterns ───

  if (lang === 'python' || lang === 'py') {
    if (/\bexec\s*\(/.test(code)) {
      findings.push({ severity: 'high', message: 'Use of exec() — code injection risk', count: 1 });
    }
    if (/\bos\.system\s*\(/.test(code)) {
      findings.push({ severity: 'high', message: 'Use of os.system() — command injection risk', count: 1 });
    }
    if (/subprocess\.(?:call|run|Popen)\s*\([^)]*shell\s*=\s*True/.test(code)) {
      findings.push({ severity: 'high', message: 'subprocess with shell=True — command injection risk', count: 1 });
    }
    if (/pickle\.load/.test(code)) {
      findings.push({ severity: 'high', message: 'Unpickling untrusted data — arbitrary code execution risk', count: 1 });
    }
    if (/yaml\.load\s*\([^)]*(?!Loader)/.test(code) && !/SafeLoader|safe_load/.test(code)) {
      findings.push({ severity: 'medium', message: 'yaml.load without SafeLoader — arbitrary code execution risk', count: 1 });
    }
  }

  // ─── Scoring ───

  let score = 1.0;
  for (const finding of findings) {
    if (finding.severity === 'critical') score -= 0.3;
    else if (finding.severity === 'high') score -= 0.2;
    else if (finding.severity === 'medium') score -= 0.1;
    else if (finding.severity === 'low') score -= 0.02;
  }

  score = Math.max(0, Math.min(1, score));

  const riskLevel = score >= 0.9 ? 'low'
    : score >= 0.7 ? 'medium'
    : score >= 0.5 ? 'high'
    : 'critical';

  return {
    score: Math.round(score * 1000) / 1000,
    riskLevel,
    findings,
    totalFindings: findings.length,
  };
}

// ─── Nesting Depth Analysis ───

/**
 * Analyze nesting depth of code.
 *
 * @param {string} code - Source code
 * @returns {object} { maxDepth, avgDepth, depthDistribution, score }
 */
function analyzeNestingDepth(code) {
  const stripped = stripStringsAndComments(code);

  let currentDepth = 0;
  let maxDepth = 0;
  const depths = [];
  const distribution = {};

  // Track depth character-by-character to handle single-line code
  for (const ch of stripped) {
    if (ch === '{') {
      currentDepth++;
      maxDepth = Math.max(maxDepth, currentDepth);
    }
    if (ch === '}') currentDepth = Math.max(0, currentDepth - 1);
  }

  // Also compute per-line depths for distribution
  currentDepth = 0;
  const lines = stripped.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    for (const ch of trimmed) {
      if (ch === '{') currentDepth++;
      if (ch === '}') currentDepth = Math.max(0, currentDepth - 1);
    }

    depths.push(currentDepth);
    distribution[currentDepth] = (distribution[currentDepth] || 0) + 1;
  }

  const avgDepth = depths.length > 0
    ? depths.reduce((s, d) => s + d, 0) / depths.length
    : 0;

  // Score: penalize excessive nesting
  let score = 1.0;
  if (maxDepth > 4) score -= (maxDepth - 4) * 0.1;
  if (avgDepth > 3) score -= (avgDepth - 3) * 0.15;
  score = Math.max(0, Math.min(1, score));

  return {
    maxDepth,
    avgDepth: Math.round(avgDepth * 100) / 100,
    depthDistribution: distribution,
    score: Math.round(score * 1000) / 1000,
  };
}

// ─── Code Quality Metrics ───

/**
 * Compute aggregate code quality metrics.
 *
 * @param {string} code - Source code
 * @param {string} language - Detected language
 * @returns {object} Quality metrics
 */
function computeQualityMetrics(code, language) {
  const lines = code.split('\n');
  const nonBlankLines = lines.filter(l => l.trim());

  // Line length statistics
  const lineLengths = nonBlankLines.map(l => l.length);
  const avgLineLength = lineLengths.length > 0
    ? lineLengths.reduce((s, l) => s + l, 0) / lineLengths.length
    : 0;
  const maxLineLength = lineLengths.length > 0 ? Math.max(...lineLengths) : 0;
  const longLines = lineLengths.filter(l => l > 120).length;
  const veryLongLines = lineLengths.filter(l => l > 200).length;

  // Function length (extracted)
  const functions = extractFunctionBodies(code);
  const functionLengths = functions.map(f => f.body.split('\n').length);
  const avgFunctionLength = functionLengths.length > 0
    ? functionLengths.reduce((s, l) => s + l, 0) / functionLengths.length
    : 0;
  const maxFunctionLength = functionLengths.length > 0 ? Math.max(...functionLengths) : 0;

  // Parameter count
  const paramCounts = functions.map(fn => {
    const paramMatch = fn.body.match(/(?:function\s+\w+|=>)\s*\(([^)]*)\)/);
    if (paramMatch && paramMatch[1].trim()) {
      return paramMatch[1].split(',').length;
    }
    return 0;
  }).filter(c => c > 0);
  const maxParams = paramCounts.length > 0 ? Math.max(...paramCounts) : 0;
  const avgParams = paramCounts.length > 0
    ? paramCounts.reduce((s, c) => s + c, 0) / paramCounts.length
    : 0;

  // Duplicate code detection (simple: find repeated lines > 3)
  const lineSet = {};
  let duplicateLines = 0;
  for (const line of nonBlankLines) {
    const trimmed = line.trim();
    if (trimmed.length < 10) continue; // Skip short lines
    lineSet[trimmed] = (lineSet[trimmed] || 0) + 1;
  }
  for (const count of Object.values(lineSet)) {
    if (count > 1) duplicateLines += count - 1;
  }

  // Compute composite quality score
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
    totalLines: lines.length,
    codeLines: nonBlankLines.length,
    avgLineLength: Math.round(avgLineLength),
    maxLineLength,
    longLines,
    veryLongLines,
    functionCount: functions.length,
    avgFunctionLength: Math.round(avgFunctionLength),
    maxFunctionLength,
    maxParams,
    avgParams: Math.round(avgParams * 10) / 10,
    duplicateLines,
    score: Math.round(score * 1000) / 1000,
  };
}

// ─── Aggregate File Score ───

/**
 * Compute a deep coherence score for a single file.
 * Combines the base SERF observation with deeper analysis.
 *
 * @param {string} code - Source code
 * @param {object} options - { language, weights }
 * @returns {object} Deep coherence score
 */
function deepScore(code, options = {}) {
  const language = options.language || detectLanguage(code);

  // Base SERF coherence
  const observation = observeCoherence(code, { language });

  // Deep analyses
  const complexity = calculateCyclomaticComplexity(code);
  const comments = analyzeCommentDensity(code);
  const security = securityScan(code, language);
  const nesting = analyzeNestingDepth(code);
  const quality = computeQualityMetrics(code, language);
  const covenant = covenantCheck(code, { language });

  // Compute complexity score (inverse — lower complexity = higher score)
  let complexityScore = 1.0;
  if (complexity.avgPerFunction > 10) complexityScore -= 0.2;
  if (complexity.avgPerFunction > 20) complexityScore -= 0.2;
  if (complexity.maxPerFunction > 15) complexityScore -= 0.15;
  if (complexity.maxPerFunction > 30) complexityScore -= 0.15;
  complexityScore = Math.max(0, Math.min(1, complexityScore));

  // Weights for aggregate scoring
  const weights = options.weights || {
    serfCoherence: 0.30,   // Base SERF multi-dimensional score
    complexity: 0.15,       // Cyclomatic complexity
    commentQuality: 0.10,  // Comment density and quality
    security: 0.20,         // Security scan score
    nesting: 0.10,          // Nesting depth score
    quality: 0.15,          // Code quality metrics
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
      total: complexity.total,
      avgPerFunction: complexity.avgPerFunction,
      maxPerFunction: complexity.maxPerFunction,
      functionCount: complexity.functionCount,
    },
    comments: {
      score: comments.quality,
      density: comments.density,
      commentLines: comments.commentLines,
      codeLines: comments.codeLines,
      docstrings: comments.docstrings,
    },
    security: {
      score: security.score,
      riskLevel: security.riskLevel,
      findings: security.findings,
    },
    nesting: {
      score: nesting.score,
      maxDepth: nesting.maxDepth,
      avgDepth: nesting.avgDepth,
    },
    quality: {
      score: quality.score,
      avgLineLength: quality.avgLineLength,
      maxLineLength: quality.maxLineLength,
      functionCount: quality.functionCount,
      maxFunctionLength: quality.maxFunctionLength,
      duplicateLines: quality.duplicateLines,
    },
    covenantSealed: covenant.sealed,
    weights,
  };
}

// ─── Repo-Level Aggregate Score ───

/**
 * Compute aggregate coherence scores for an entire repository.
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration
 * @returns {object} Repo-level coherence report
 */
function repoScore(rootDir, config = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const filePaths = scanDirectory(rootDir, opts);
  const fileScores = [];

  for (const filePath of filePaths) {
    let code;
    try {
      code = readFileSync(filePath, 'utf-8');
    } catch { continue; }

    if (!code.trim()) continue;

    const result = deepScore(code, { language: detectLanguage(code), weights: opts.weights });
    fileScores.push({
      path: relative(rootDir, filePath),
      ...result,
    });
  }

  if (fileScores.length === 0) {
    return {
      timestamp: new Date().toISOString(),
      rootDir,
      totalFiles: 0,
      aggregate: 0,
      dimensions: {},
      files: [],
    };
  }

  // Compute repo-level averages
  const avgAggregate = fileScores.reduce((s, f) => s + f.aggregate, 0) / fileScores.length;
  const avgComplexity = fileScores.reduce((s, f) => s + f.complexity.score, 0) / fileScores.length;
  const avgComments = fileScores.reduce((s, f) => s + f.comments.score, 0) / fileScores.length;
  const avgSecurity = fileScores.reduce((s, f) => s + f.security.score, 0) / fileScores.length;
  const avgNesting = fileScores.reduce((s, f) => s + f.nesting.score, 0) / fileScores.length;
  const avgQuality = fileScores.reduce((s, f) => s + f.quality.score, 0) / fileScores.length;
  const avgSerf = fileScores.reduce((s, f) => s + f.serfCoherence, 0) / fileScores.length;

  // Find worst files
  const sorted = [...fileScores].sort((a, b) => a.aggregate - b.aggregate);
  const worst = sorted.slice(0, 5);
  const best = sorted.slice(-5).reverse();

  // Security findings across repo
  const allFindings = fileScores.flatMap(f =>
    f.security.findings.map(finding => ({
      ...finding,
      file: f.path,
    }))
  );

  return {
    timestamp: new Date().toISOString(),
    rootDir,
    totalFiles: fileScores.length,
    aggregate: Math.round(avgAggregate * 1000) / 1000,
    dimensions: {
      serfCoherence: Math.round(avgSerf * 1000) / 1000,
      complexity: Math.round(avgComplexity * 1000) / 1000,
      commentQuality: Math.round(avgComments * 1000) / 1000,
      security: Math.round(avgSecurity * 1000) / 1000,
      nesting: Math.round(avgNesting * 1000) / 1000,
      quality: Math.round(avgQuality * 1000) / 1000,
    },
    health: avgAggregate >= 0.8 ? 'healthy' : avgAggregate >= 0.6 ? 'stable' : 'needs attention',
    worstFiles: worst.map(f => ({ path: f.path, score: f.aggregate })),
    bestFiles: best.map(f => ({ path: f.path, score: f.aggregate })),
    securityFindings: allFindings,
    files: fileScores,
  };
}

// ─── Utility ───

/**
 * Strip strings and comments from code for analysis.
 */
function stripStringsAndComments(code) {
  return code
    .replace(/\/\/[^\n]*/g, '')           // Single-line comments
    .replace(/\/\*[\s\S]*?\*\//g, '')     // Block comments
    .replace(/#[^\n]*/g, '')              // Python/shell comments
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '') // Template literals
    .replace(/"(?:\\.|[^"\\])*"/g, '""')  // Double-quoted strings
    .replace(/'(?:\\.|[^'\\])*'/g, "''"); // Single-quoted strings
}

/**
 * Format a deep score result as human-readable text.
 */
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
  // Core analysis
  calculateCyclomaticComplexity,
  analyzeCommentDensity,
  securityScan,
  analyzeNestingDepth,
  computeQualityMetrics,

  // Aggregate scoring
  deepScore,
  repoScore,

  // Formatting
  formatDeepScore,

  // Utilities
  stripStringsAndComments,
  countDecisionPoints,
  extractFunctionBodies,
};
