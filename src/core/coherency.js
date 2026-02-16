/**
 * Coherency scoring engine for the Remembrance Oracle.
 *
 * Scores code snippets on a 0-1 scale across multiple dimensions:
 * - Syntax validity (does it parse?)
 * - Completeness (no dangling references?)
 * - Consistency (naming, style coherence)
 * - Test proof (did it pass validation?)
 * - Historical reliability (how often has it worked?)
 */

const { astCoherencyBoost } = require('./parsers/ast');
const {
  COHERENCY_WEIGHTS,
  SYNTAX_SCORES,
  COMPLETENESS_PENALTIES,
  CONSISTENCY_PENALTIES,
  COHERENCY_DEFAULTS,
  ROUNDING_FACTOR,
} = require('../constants/thresholds');

const WEIGHTS = {
  syntaxValid: COHERENCY_WEIGHTS.SYNTAX_VALID,
  completeness: COHERENCY_WEIGHTS.COMPLETENESS,
  consistency: COHERENCY_WEIGHTS.CONSISTENCY,
  testProof: COHERENCY_WEIGHTS.TEST_PROOF,
  historicalReliability: COHERENCY_WEIGHTS.HISTORICAL_RELIABILITY,
};

/**
 * Scores code syntax validity on a 0-1 scale. JavaScript code is parsed with Function constructor; other languages use structural heuristics.
 * @param {string} code - The code to analyze
 * @param {string} language - The programming language
 * @returns {number} Syntax score from 0 (invalid) to 1 (perfect)
 */
function scoreSyntax(code, language) {
  if (language === 'javascript' || language === 'js') {
    try {
      new Function(code);
      return SYNTAX_SCORES.PERFECT;
    } catch {
      // Might be a module — try looser check
      const balanced = checkBalancedBraces(code);
      return balanced ? SYNTAX_SCORES.BALANCED_BRACES : SYNTAX_SCORES.INVALID;
    }
  }
  // For other languages, do structural checks
  const balanced = checkBalancedBraces(code);
  const hasStructure = /\b(function|def|class|fn|pub|func|void|int|string)\b/i.test(code);
  let score = SYNTAX_SCORES.UNKNOWN_BASE;
  if (balanced) score += SYNTAX_SCORES.BALANCED_BONUS;
  if (hasStructure) score += SYNTAX_SCORES.STRUCTURE_BONUS;
  return Math.min(score, 1.0);
}

/**
 * Checks if braces, brackets, and parentheses are balanced in the code.
 * @param {string} code - The code to check
 * @returns {boolean} True if all pairs are balanced, false otherwise
 */
function checkBalancedBraces(code) {
  const stack = [];
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const closers = new Set([')', ']', '}']);
  for (const ch of code) {
    if (pairs[ch]) stack.push(pairs[ch]);
    else if (closers.has(ch)) {
      if (stack.pop() !== ch) return false;
    }
  }
  return stack.length === 0;
}

/**
 * Scores code completeness by detecting incomplete-work markers, placeholders, and empty function bodies.
 * @param {string} code - The code to analyze
 * @returns {number} Completeness score from 0 (highly incomplete) to 1 (complete)
 */
function scoreCompleteness(code) {
  let score = 1.0;
  // Penalize incomplete-work markers (pattern built dynamically to avoid self-detection)
  const markerRe = new RegExp('\\b(' + ['TO' + 'DO', 'FIX' + 'ME', 'HA' + 'CK', 'X' + 'XX', 'ST' + 'UB'].join('|') + ')\\b', 'g');
  const incompleteMarkers = (code.match(markerRe) || []).length;
  score -= incompleteMarkers * COMPLETENESS_PENALTIES.MARKER_PENALTY;
  // Penalize placeholder patterns like "..."  or pass
  if (/\.{3}|pass\s*$|raise NotImplementedError/m.test(code)) score -= COMPLETENESS_PENALTIES.PLACEHOLDER_PENALTY;
  // Penalize empty function bodies
  if (/\{\s*\}/.test(code) && !/=>\s*\{\s*\}/.test(code)) score -= COMPLETENESS_PENALTIES.EMPTY_BODY_PENALTY;
  return Math.max(score, 0);
}

/**
 * Scores code consistency by checking indentation style (tabs vs spaces) and naming conventions (camelCase vs snake_case).
 * @param {string} code - The code to analyze
 * @returns {number} Consistency score from 0 (inconsistent) to 1 (fully consistent)
 */
function scoreConsistency(code) {
  let score = 1.0;
  const lines = code.split('\n').filter(l => l.trim());
  if (lines.length < 2) return score;

  // Check indentation consistency
  const indents = lines.map(l => {
    const match = l.match(/^(\s+)/);
    return match ? match[1] : '';
  }).filter(i => i.length > 0);

  if (indents.length > 0) {
    const usesTabs = indents.some(i => i.includes('\t'));
    const usesSpaces = indents.some(i => i.includes(' '));
    if (usesTabs && usesSpaces) score -= CONSISTENCY_PENALTIES.MIXED_INDENT_PENALTY;
  }

  // Check naming convention consistency
  const camelCase = (code.match(/[a-z][a-zA-Z]+\(/g) || []).length;
  const snakeCase = (code.match(/[a-z]+_[a-z]+\(/g) || []).length;
  if (camelCase > 0 && snakeCase > 0) {
    const ratio = Math.min(camelCase, snakeCase) / Math.max(camelCase, snakeCase);
    if (ratio > CONSISTENCY_PENALTIES.NAMING_RATIO_THRESHOLD) score -= CONSISTENCY_PENALTIES.MIXED_NAMING_PENALTY;
  }

  return Math.max(score, 0);
}

/**
 * Computes overall coherency score (0-1) across syntax, completeness, consistency, test proof, and historical reliability. Includes AST-based boost/penalty.
 * @param {string} code - The code to analyze
 * @param {Object} metadata - Optional metadata (language, testPassed, historicalReliability)
 * @returns {Object} Coherency result with total score, breakdown, AST analysis, and detected language
 */
function computeCoherencyScore(code, metadata = {}) {
  if (code == null || typeof code !== 'string') {
    return { total: 0, breakdown: { syntaxValid: 0, completeness: 0, consistency: 0, testProof: 0, historicalReliability: 0 } };
  }
  const language = metadata.language || detectLanguage(code);
  const testProof = metadata.testPassed ? 1.0 : metadata.testPassed === false ? 0.0 : COHERENCY_DEFAULTS.TEST_PROOF_FALLBACK;
  const historicalReliability = metadata.historicalReliability ?? COHERENCY_DEFAULTS.HISTORICAL_RELIABILITY_FALLBACK;

  const scores = {
    syntaxValid: scoreSyntax(code, language),
    completeness: scoreCompleteness(code),
    consistency: scoreConsistency(code),
    testProof,
    historicalReliability,
  };

  const weighted = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + (scores[key] * weight);
  }, 0);

  // AST-based boost/penalty
  const ast = astCoherencyBoost(code, language);
  const total = Math.max(0, Math.min(1, weighted + ast.boost));

  return {
    total: Math.round(total * ROUNDING_FACTOR) / ROUNDING_FACTOR,
    breakdown: scores,
    astAnalysis: {
      boost: ast.boost,
      valid: ast.parsed.valid,
      functions: ast.parsed.functions.length,
      classes: ast.parsed.classes.length,
      complexity: ast.parsed.complexity,
    },
    language,
  };
}

/**
 * Detects programming language from code patterns (keywords, syntax, conventions).
 * @param {string} code - The code to analyze
 * @returns {string} Detected language (rust, go, java, python, javascript, jsx, html, or unknown)
 */
function detectLanguage(code) {
  // Language detection patterns are built dynamically to prevent
  // self-referential false positives (e.g. this file containing "fn"
  // in a regex literal being detected as Rust)
  const rustRe = new RegExp('\\b' + 'fn' + '\\b.*->|let ' + 'mut |' + 'impl' + '\\b');
  if (rustRe.test(code)) return 'rust';
  const goRe = new RegExp('\\b' + 'func' + '\\b.*\\{|' + 'package' + '\\b|fmt\\.');
  if (goRe.test(code)) return 'go';
  if (/\bpublic\b.*\bclass\b|\bSystem\.out/.test(code)) return 'java';
  // Check JS before Python to avoid misclassifying JS files that contain
  // Python keywords in string literals (e.g. template literals with "import os")
  if (/\bfunction\b.*\{|const |let |=>\s*\{|require\(|import .* from/.test(code)) return 'javascript';
  // Anchor Python patterns to start of line to avoid matching keywords inside strings
  if (/^\s*def\b.*:/m.test(code) || /^\s*import\s+\w/m.test(code) || /^\s*print\s*\(/m.test(code)) return 'python';
  if (/<\/?[a-z][\s\S]*>/i.test(code) && /className|onClick|useState/.test(code)) return 'jsx';
  if (/<\/?[a-z][\s\S]*>/i.test(code)) return 'html';
  return 'unknown';
}

module.exports = {
  computeCoherencyScore,
  scoreSyntax,
  scoreCompleteness,
  scoreConsistency,
  detectLanguage,
  checkBalancedBraces,
  WEIGHTS,
};
