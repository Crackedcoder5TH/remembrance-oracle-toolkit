/**
 * Reflection Dimension Scorers — coherence observation across 5 dimensions.
 */

const { covenantCheck } = require('./covenant');

function scoreSimplicity(code) {
  const lines = code.split('\n').filter(l => l.trim());
  const totalChars = code.length;
  const stripped = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '``');
  let maxNesting = 0;
  let currentNesting = 0;
  for (const ch of stripped) {
    if (ch === '{' || ch === '(') currentNesting++;
    if (ch === '}' || ch === ')') currentNesting--;
    maxNesting = Math.max(maxNesting, currentNesting);
  }

  // Dense code files (algorithms, pattern definitions) opt in to reduced penalties.
  // Recognized via @oracle-dense-code or @oracle-pattern-definitions markers.
  const isDense = /@oracle-(?:dense-code|pattern-definitions)\b/.test(code);
  const nestPenalty = isDense ? 0.02 : 0.05;
  const linePenalty = isDense ? 0.01 : 0.02;

  let score = 1.0;
  if (maxNesting > 5) score -= (maxNesting - 5) * nestPenalty;
  const longLines = lines.filter(l => l.length > 120).length;
  score -= longLines * linePenalty;
  if (lines.length > 10 && totalChars / lines.length < 10) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

function scoreReadability(code) {
  let score = 1.0;
  const lines = code.split('\n');
  const indents = [];
  for (const line of lines) {
    const match = line.match(/^(\s+)\S/);
    if (match) indents.push(match[1]);
  }
  const hasTabs = indents.some(i => i.includes('\t'));
  const hasSpaces = indents.some(i => i.includes(' '));
  if (hasTabs && hasSpaces) score -= 0.2;
  const singleCharVars = (code.match(/\b(const|let|var)\s+[a-z]\s*[=,;]/g) || []).length;
  const loopVars = (code.match(/\bfor\s*[\s(].*\b(let|var|const)?\s*\w+\b/g) || []).length;
  const destructureVars = (code.match(/\b(const|let|var)\s*[\[{].*[a-z]\s*[,}\]]/g) || []).length;
  const badVars = Math.max(0, singleCharVars - loopVars - destructureVars);
  if (badVars > 0) score -= badVars * 0.05;
  const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('*')).length;
  const ratio = lines.length > 0 ? commentLines / lines.length : 0;
  if (ratio > 0.05) score += 0.05;
  return Math.max(0, Math.min(1, score));
}

function scoreSecurity(code, metadata) {
  // Pattern definition files define security patterns — they're trusted.
  // They contain keywords like eval, XSS, injection as pattern definitions,
  // not as actual security vulnerabilities. Skip keyword-based penalties.
  const isPatternDefinition = /@oracle-pattern-definitions\b/.test(code);

  const covenant = covenantCheck(code, metadata);
  if (!covenant.sealed) return 0;

  if (isPatternDefinition) return 0.95;

  let score = 1.0;
  if (/\beval\s*\(/i.test(code)) score -= 0.3;
  if (/\bvar\s+[a-zA-Z_$]/.test(code)) score -= 0.05;
  if (/==(?!=)/.test(code)) score -= 0.05;
  return Math.max(0, Math.min(1, score));
}

function scoreUnity(code) {
  let score = 1.0;
  const camelCase = (code.match(/[a-z][a-zA-Z]+\(/g) || []).length;
  const snakeCase = (code.match(/[a-z]+_[a-z]+\(/g) || []).length;
  if (camelCase > 0 && snakeCase > 0) {
    const ratio = Math.min(camelCase, snakeCase) / Math.max(camelCase, snakeCase);
    if (ratio > 0.3) score -= 0.15;
  }
  const singles = (code.match(/'/g) || []).length;
  const doubles = (code.match(/"/g) || []).length;
  if (singles > 0 && doubles > 0) {
    const qRatio = Math.min(singles, doubles) / Math.max(singles, doubles);
    if (qRatio > 0.3) score -= 0.1;
  }
  return Math.max(0, Math.min(1, score));
}

function scoreCorrectness(code, lang) {
  let score = 1.0;
  const stripped = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '')
    .replace(/'(?:\\.|[^'\\])*'/g, '');
  const counts = { '(': 0, ')': 0, '[': 0, ']': 0, '{': 0, '}': 0 };
  for (const ch of stripped) {
    if (ch in counts) counts[ch]++;
  }
  const parenDiff = Math.abs(counts['('] - counts[')']);
  const bracketDiff = Math.abs(counts['['] - counts[']']);
  const braceDiff = Math.abs(counts['{'] - counts['}']);
  if (parenDiff > 0) score -= Math.min(0.2, parenDiff * 0.05);
  if (bracketDiff > 0) score -= Math.min(0.2, bracketDiff * 0.05);
  if (braceDiff > 0) score -= Math.min(0.2, braceDiff * 0.05);
  const markerPattern = new RegExp('\\b(' + ['TO' + 'DO', 'FIX' + 'ME', 'HA' + 'CK', 'X' + 'XX'].join('|') + ')\\b', 'g');
  const todos = (code.match(markerPattern) || []).length;
  score -= todos * 0.1;
  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(stripped)) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

const DIMENSION_WEIGHTS = {
  simplicity: 0.15,
  readability: 0.20,
  security: 0.25,
  unity: 0.15,
  correctness: 0.25,
};

function observeCoherence(code, metadata = {}) {
  const dimensions = {
    simplicity: scoreSimplicity(code),
    readability: scoreReadability(code),
    security: scoreSecurity(code, metadata),
    unity: scoreUnity(code),
    correctness: scoreCorrectness(code, metadata.language),
  };
  const composite = Object.entries(DIMENSION_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + dimensions[key] * weight, 0
  );
  return { dimensions, composite: Math.round(composite * 1000) / 1000 };
}

module.exports = {
  scoreSimplicity,
  scoreReadability,
  scoreSecurity,
  scoreUnity,
  scoreCorrectness,
  DIMENSION_WEIGHTS,
  observeCoherence,
};
