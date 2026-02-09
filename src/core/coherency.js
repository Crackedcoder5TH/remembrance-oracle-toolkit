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

const WEIGHTS = {
  syntaxValid: 0.25,
  completeness: 0.20,
  consistency: 0.15,
  testProof: 0.30,
  historicalReliability: 0.10,
};

function scoreSyntax(code, language) {
  if (language === 'javascript' || language === 'js') {
    try {
      new Function(code);
      return 1.0;
    } catch {
      // Might be a module — try looser check
      const balanced = checkBalancedBraces(code);
      return balanced ? 0.7 : 0.2;
    }
  }
  // For other languages, do structural checks
  const balanced = checkBalancedBraces(code);
  const hasStructure = /\b(function|def|class|fn|pub|func|void|int|string)\b/i.test(code);
  let score = 0.5;
  if (balanced) score += 0.3;
  if (hasStructure) score += 0.2;
  return Math.min(score, 1.0);
}

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

function scoreCompleteness(code) {
  let score = 1.0;
  // Penalize TODO/FIXME/HACK markers
  const incompleteMarkers = (code.match(/\b(TODO|FIXME|HACK|XXX|STUB)\b/g) || []).length;
  score -= incompleteMarkers * 0.15;
  // Penalize placeholder patterns like "..."  or pass
  if (/\.{3}|pass\s*$|raise NotImplementedError/m.test(code)) score -= 0.3;
  // Penalize empty function bodies
  if (/\{\s*\}/.test(code) && !/=>\s*\{\s*\}/.test(code)) score -= 0.2;
  return Math.max(score, 0);
}

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
    if (usesTabs && usesSpaces) score -= 0.3; // Mixed indentation
  }

  // Check naming convention consistency
  const camelCase = (code.match(/[a-z][a-zA-Z]+\(/g) || []).length;
  const snakeCase = (code.match(/[a-z]+_[a-z]+\(/g) || []).length;
  if (camelCase > 0 && snakeCase > 0) {
    const ratio = Math.min(camelCase, snakeCase) / Math.max(camelCase, snakeCase);
    if (ratio > 0.3) score -= 0.2; // Significantly mixed naming
  }

  return Math.max(score, 0);
}

function computeCoherencyScore(code, metadata = {}) {
  if (code == null || typeof code !== 'string') {
    return { total: 0, breakdown: { syntaxValid: 0, completeness: 0, consistency: 0, testProof: 0, historicalReliability: 0 } };
  }
  const language = metadata.language || detectLanguage(code);
  const testProof = metadata.testPassed ? 1.0 : metadata.testPassed === false ? 0.0 : 0.5;
  const historicalReliability = metadata.historicalReliability ?? 0.5;

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
    total: Math.round(total * 1000) / 1000,
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

function detectLanguage(code) {
  if (/\bfn\b.*->|let mut |impl\b/.test(code)) return 'rust';
  if (/\bfunc\b.*\{|package\b|fmt\./.test(code)) return 'go';
  if (/\bpublic\b.*\bclass\b|\bSystem\.out/.test(code)) return 'java';
  if (/\bdef\b.*:|\bimport\b.*\n|print\(/.test(code)) return 'python';
  if (/\bfunction\b.*\{|const |let |=>\s*\{|require\(|import .* from/.test(code)) return 'javascript';
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
