/**
 * Reflector — Complexity, comments, nesting, and quality metrics.
 *
 * @oracle-dense-code
 */

const { stripStringsAndComments } = require('./scoring-analysis-security');

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

function extractBody(lines, startLine) {
  let depth = 0, started = false;
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
    ? perFunction.reduce((s, f) => s + f.complexity, 0) / perFunction.length : total;
  const maxPerFunction = perFunction.length > 0
    ? Math.max(...perFunction.map(f => f.complexity)) : total;

  return {
    total, perFunction,
    avgPerFunction: Math.round(avgPerFunction * 100) / 100,
    maxPerFunction, functionCount: functions.length,
  };
}

function analyzeCommentDensity(code) {
  const lines = code.split('\n');
  let commentLines = 0, codeLines = 0, blankLines = 0, inBlockComment = false, docstrings = 0;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) { blankLines++; continue; }
    if (inBlockComment) { commentLines++; if (trimmed.includes('*/')) inBlockComment = false; continue; }
    if (trimmed.startsWith('/*')) { commentLines++; if (trimmed.startsWith('/**')) docstrings++; if (!trimmed.includes('*/')) inBlockComment = true; continue; }
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

  return { density: Math.round(density * 1000) / 1000, commentLines, codeLines, blankLines, totalLines: lines.length, quality: Math.round(quality * 1000) / 1000, docstrings };
}

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
    maxDepth, avgDepth: Math.round(avgDepth * 100) / 100,
    depthDistribution: depths.reduce((d, v) => { d[v] = (d[v] || 0) + 1; return d; }, {}),
    score: Math.round(score * 1000) / 1000,
  };
}

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
    maxParams, avgParams: Math.round(avgParams * 10) / 10, duplicateLines,
    score: Math.round(score * 1000) / 1000,
  };
}

module.exports = {
  calculateCyclomaticComplexity,
  analyzeCommentDensity,
  analyzeNestingDepth,
  computeQualityMetrics,
  countDecisionPoints,
  extractFunctionBodies,
};
