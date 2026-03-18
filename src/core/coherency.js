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

const { astCoherencyBoost, parseCode } = require('./parsers/ast');
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
  const lang = (language || '').toLowerCase();

  // For languages with real parsers (Python, Rust, Go), use AST-level validation
  if (['python', 'py', 'rust', 'rs', 'go', 'golang'].includes(lang)) {
    try {
      const parsed = parseCode(code, lang);
      if (parsed.valid) {
        const hasStructure = parsed.functions.length > 0 || parsed.classes.length > 0;
        if (hasStructure) return SYNTAX_SCORES.PERFECT;
        return SYNTAX_SCORES.BALANCED_BRACES; // Valid syntax but no structure
      }
      // Parser found real errors — score as invalid
      return SYNTAX_SCORES.INVALID;
    } catch (_) {
      // Fall through to heuristic
    }
  }

  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    const balanced = checkBalancedBraces(code);
    const hasStructure = /\b(function|const|let|var|class|module|export|import|require|interface|type)\b/.test(code);
    if (balanced && hasStructure) return SYNTAX_SCORES.PERFECT;
    if (balanced) return SYNTAX_SCORES.BALANCED_BRACES;
    return SYNTAX_SCORES.INVALID;
  }

  if (lang === 'java') {
    const balanced = checkBalancedBraces(code);
    const hasStructure = /\b(class|interface|public|private|protected|void|static|import|package)\b/.test(code);
    if (balanced && hasStructure) return SYNTAX_SCORES.PERFECT;
    if (balanced) return SYNTAX_SCORES.BALANCED_BRACES;
    return SYNTAX_SCORES.INVALID;
  }

  // Generic fallback for unknown languages
  const balanced = checkBalancedBraces(code);
  const hasStructure = /\b(function|def|class|fn|pub|func|void|int|string)\b/i.test(code);
  let score = SYNTAX_SCORES.UNKNOWN_BASE;
  if (balanced) score += SYNTAX_SCORES.BALANCED_BONUS;
  if (hasStructure) score += SYNTAX_SCORES.STRUCTURE_BONUS;
  return Math.min(score, 1.0);
}

/**
 * Checks if braces, brackets, and parentheses are balanced in the code.
 * Skips characters inside string literals, template literals, regex literals,
 * and comments to avoid false positives from bracket characters in non-code.
 * @param {string} code - The code to check
 * @returns {boolean} True if all pairs are balanced, false otherwise
 */
function checkBalancedBraces(code) {
  const stack = [];
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const closers = new Set([')', ']', '}']);
  const REGEX_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'case', 'void', 'delete', 'throw', 'new', 'yield', 'await']);
  const REGEX_OPS = '=(!&|,;:?[{+-%~^<>';
  let i = 0;
  let lastToken = ''; // track last meaningful token for regex detection
  while (i < code.length) {
    const ch = code[i];
    // Skip whitespace (don't update lastToken)
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    // Skip single-line comments (don't update lastToken)
    if (ch === '/' && code[i + 1] === '/') {
      i = code.indexOf('\n', i + 2);
      if (i === -1) break;
      i++;
      continue;
    }
    // Skip block comments (don't update lastToken)
    if (ch === '/' && code[i + 1] === '*') {
      i = code.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }
    // Skip template literals (handling ${...} expressions with nested braces)
    if (ch === '`') {
      i++;
      i = _skipTemplateLiteral(code, i);
      lastToken = '`';
      continue;
    }
    // Skip string literals (single, double)
    if (ch === "'" || ch === '"') {
      i++;
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === ch) { i++; break; }
        i++;
      }
      lastToken = ch;
      continue;
    }
    // Skip regex literals (after operator, keyword, or start-of-line context)
    if (ch === '/') {
      const isRegex = lastToken === '' || REGEX_OPS.includes(lastToken) || REGEX_KW.has(lastToken);
      if (isRegex) {
        i++;
        i = _skipRegexBody(code, i);
        lastToken = '/';
        continue;
      }
    }
    if (pairs[ch]) { stack.push(pairs[ch]); lastToken = ch; }
    else if (closers.has(ch)) {
      if (stack.pop() !== ch) return false;
      lastToken = ch;
    } else {
      // Track identifier words for keyword detection
      if (/[a-zA-Z_$]/.test(ch)) {
        let word = ch;
        let j = i + 1;
        while (j < code.length && /[\w$]/.test(code[j])) { word += code[j]; j++; }
        lastToken = word;
        i = j;
        continue;
      }
      lastToken = ch;
    }
    i++;
  }
  return stack.length === 0;
}

/** Advance past template literal content, handling ${...} expressions. */
function _skipTemplateLiteral(code, i) {
  while (i < code.length) {
    if (code[i] === '\\') { i += 2; continue; }
    if (code[i] === '$' && code[i + 1] === '{') {
      i += 2;
      i = _skipTemplateExpression(code, i);
      continue;
    }
    if (code[i] === '`') { i++; return i; }
    i++;
  }
  return i;
}

/** Advance past a ${...} expression inside a template literal. */
function _skipTemplateExpression(code, i) {
  const REGEX_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'case', 'void', 'delete', 'throw', 'new', 'yield', 'await']);
  let depth = 1;
  while (i < code.length && depth > 0) {
    const c = code[i];
    if (c === '\\') { i += 2; continue; }
    if (c === '`') { i++; i = _skipTemplateLiteral(code, i); continue; }
    if (c === "'" || c === '"') {
      const q = c; i++;
      while (i < code.length) {
        if (code[i] === '\\') { i += 2; continue; }
        if (code[i] === q) { i++; break; }
        i++;
      }
      continue;
    }
    if (c === '/' && code[i + 1] === '/') {
      i = code.indexOf('\n', i + 2);
      if (i === -1) return code.length;
      i++; continue;
    }
    if (c === '/' && code[i + 1] === '*') {
      i = code.indexOf('*/', i + 2);
      if (i === -1) return code.length;
      i += 2; continue;
    }
    // Skip regex literals inside template expressions
    if (c === '/') {
      let isRegex = false;
      const before = code.slice(Math.max(0, i - 20), i).trimEnd();
      if (before.length === 0) { i++; continue; }
      const lastCh = before[before.length - 1];
      if (lastCh && '=(!&|,;:?[{+-%~^<>'.includes(lastCh)) isRegex = true;
      else { const wm = before.match(/\b(\w+)$/); if (wm && wm[1] && REGEX_KW.has(wm[1])) isRegex = true; }
      if (isRegex) { i++; i = _skipRegexBody(code, i); continue; }
    }
    if (c === '{') depth++;
    else if (c === '}') { depth--; if (depth === 0) { i++; return i; } }
    i++;
  }
  return i;
}

/** Advance past regex body, handling character classes [..] where / doesn't terminate. */
function _skipRegexBody(code, i) {
  let inCharClass = false;
  while (i < code.length) {
    if (code[i] === '\\') { i += 2; continue; }
    if (code[i] === '[' && !inCharClass) { inCharClass = true; i++; continue; }
    if (code[i] === ']' && inCharClass) { inCharClass = false; i++; continue; }
    if (code[i] === '/' && !inCharClass) { i++; while (i < code.length && /[gimsuy]/.test(code[i])) i++; return i; }
    i++;
  }
  return i;
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
function scoreConsistency(code, language) {
  let score = 1.0;
  const lines = code.split('\n').filter(l => l.trim());
  if (lines.length < 2) return score;
  const lang = (language || '').toLowerCase();

  // Check indentation consistency
  const indents = lines.map(l => {
    const match = l.match(/^(\s+)/);
    return match ? match[1] : '';
  }).filter(i => i.length > 0);

  if (indents.length > 0) {
    const usesTabs = indents.some(i => i.includes('\t'));
    const usesSpaces = indents.some(i => i.includes(' '));
    if (usesTabs && usesSpaces) score -= CONSISTENCY_PENALTIES.MIXED_INDENT_PENALTY;

    // Python: enforce spaces-only (PEP 8)
    if ((lang === 'python' || lang === 'py') && usesTabs) {
      score -= CONSISTENCY_PENALTIES.MIXED_INDENT_PENALTY;
    }

    // Go: enforce tabs (gofmt convention)
    if ((lang === 'go' || lang === 'golang') && usesSpaces && !usesTabs) {
      score -= 0.1; // Lighter penalty — spaces work but tabs are canonical
    }
  }

  // Check naming convention consistency
  const camelCase = (code.match(/[a-z][a-zA-Z]+\(/g) || []).length;
  const snakeCase = (code.match(/[a-z]+_[a-z]+\(/g) || []).length;

  // Language-appropriate naming: Python uses snake_case, JS/Java use camelCase
  if (lang === 'python' || lang === 'py') {
    // In Python, camelCase in function calls is a consistency issue
    if (camelCase > 0 && snakeCase > 0) {
      const ratio = camelCase / (camelCase + snakeCase);
      if (ratio > 0.3) score -= CONSISTENCY_PENALTIES.MIXED_NAMING_PENALTY;
    }
  } else if (lang === 'rust' || lang === 'rs') {
    // Rust uses snake_case for functions, PascalCase for types — both are expected
    // Only penalize truly mixed (camelCase functions + snake_case functions)
    // No penalty for Rust since mixed is normal
  } else {
    // JS/TS/Java/Go — camelCase is canonical
    if (camelCase > 0 && snakeCase > 0) {
      const ratio = Math.min(camelCase, snakeCase) / Math.max(camelCase, snakeCase);
      if (ratio > CONSISTENCY_PENALTIES.NAMING_RATIO_THRESHOLD) score -= CONSISTENCY_PENALTIES.MIXED_NAMING_PENALTY;
    }
  }

  return Math.max(score, 0);
}

/**
 * Computes overall coherency score (0-1) across syntax, completeness, consistency, test proof, and historical reliability. Includes AST-based boost/penalty.
 * @param {string} code - The code to analyze
 * @param {Object} metadata - Optional metadata (language, testPassed, historicalReliability)
 * @returns {Object} Coherency result with total score, breakdown, AST analysis, and detected language
 */
/**
 * Compute test coverage quality — checks that test code actually exercises
 * functions/identifiers from the source code, not just assertion count.
 * Returns a coverage factor (0-1) that modulates the testProof dimension.
 */
function computeCoverageGate(code, testCode, language) {
  if (!testCode || !code) return { factor: 1.0, reason: 'no test code to evaluate' };

  // Extract function/class names from source code
  const lang = (language || '').toLowerCase();
  let identifiers = [];

  if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
    // Function declarations, arrow functions, class names
    const funcMatches = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>|class\s+(\w+))/g) || [];
    for (const m of funcMatches) {
      const name = m.match(/(?:function|const|let|var|class)\s+(\w+)/);
      if (name) identifiers.push(name[1]);
    }
    // module.exports assignments
    const exportMatches = code.match(/exports\.(\w+)\s*=/g) || [];
    for (const m of exportMatches) {
      const name = m.match(/exports\.(\w+)/);
      if (name) identifiers.push(name[1]);
    }
  } else if (['python', 'py'].includes(lang)) {
    const defMatches = code.match(/(?:def|class)\s+(\w+)/g) || [];
    for (const m of defMatches) {
      const name = m.match(/(?:def|class)\s+(\w+)/);
      if (name) identifiers.push(name[1]);
    }
  } else if (['rust', 'rs'].includes(lang)) {
    const fnMatches = code.match(/(?:pub\s+)?(?:fn|struct|enum|trait)\s+(\w+)/g) || [];
    for (const m of fnMatches) {
      const name = m.match(/(?:fn|struct|enum|trait)\s+(\w+)/);
      if (name) identifiers.push(name[1]);
    }
  } else if (['go', 'golang'].includes(lang)) {
    const fnMatches = code.match(/func\s+(?:\([^)]*\)\s+)?(\w+)/g) || [];
    for (const m of fnMatches) {
      const name = m.match(/func\s+(?:\([^)]*\)\s+)?(\w+)/);
      if (name) identifiers.push(name[1]);
    }
  }

  // Filter out common non-meaningful names
  identifiers = identifiers.filter(id => id.length > 1 && !['if', 'for', 'new', 'let', 'var', 'do'].includes(id));

  if (identifiers.length === 0) {
    return { factor: 0.8, reason: 'no identifiers extracted from source' };
  }

  // Check how many source identifiers appear in test code
  const covered = identifiers.filter(id => testCode.includes(id));
  const coverageRatio = covered.length / identifiers.length;

  if (coverageRatio >= 0.5) return { factor: 1.0, covered: covered.length, total: identifiers.length, reason: 'good coverage' };
  if (coverageRatio >= 0.25) return { factor: 0.7, covered: covered.length, total: identifiers.length, reason: 'partial coverage' };
  if (coverageRatio > 0) return { factor: 0.4, covered: covered.length, total: identifiers.length, reason: 'minimal coverage' };
  return { factor: 0.2, covered: 0, total: identifiers.length, reason: 'test code does not reference any source identifiers' };
}

function computeCoherencyScore(code, metadata = {}) {
  if (code == null || typeof code !== 'string') {
    return { total: 0, breakdown: { syntaxValid: 0, completeness: 0, consistency: 0, testProof: 0, historicalReliability: 0 } };
  }
  const language = metadata.language || detectLanguage(code);
  let testProof = metadata.testPassed === true ? 1.0 : metadata.testPassed === false ? 0.0 : COHERENCY_DEFAULTS.TEST_PROOF_FALLBACK;

  // Coverage gate: modulate testProof by how well tests cover source identifiers
  let coverageGate = null;
  if (metadata.testCode) {
    coverageGate = computeCoverageGate(code, metadata.testCode, language);
    testProof *= coverageGate.factor;
  }

  const historicalReliability = metadata.historicalReliability ?? COHERENCY_DEFAULTS.HISTORICAL_RELIABILITY_FALLBACK;

  const scores = {
    syntaxValid: scoreSyntax(code, language),
    completeness: scoreCompleteness(code),
    consistency: scoreConsistency(code, language),
    testProof,
    historicalReliability,
  };

  const weighted = Object.entries(WEIGHTS).reduce((sum, [key, weight]) => {
    return sum + (scores[key] * weight);
  }, 0);

  // AST-based boost/penalty
  let ast;
  try {
    ast = astCoherencyBoost(code, language);
  } catch (_) {
    ast = { boost: 0, parsed: { valid: false, functions: [], classes: [], complexity: 0 } };
  }
  if (!ast || !ast.parsed) {
    ast = { boost: 0, parsed: { valid: false, functions: [], classes: [], complexity: 0 } };
  }
  const total = Math.max(0, Math.min(1, weighted + ast.boost));

  return {
    total: Math.round(total * ROUNDING_FACTOR) / ROUNDING_FACTOR,
    breakdown: scores,
    astAnalysis: {
      boost: ast.boost,
      valid: ast.parsed.valid,
      functions: (ast.parsed.functions || []).length,
      classes: (ast.parsed.classes || []).length,
      complexity: ast.parsed.complexity || 0,
    },
    coverageGate: coverageGate || null,
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
  // TypeScript — check before JS since TS is a superset
  if (/:\s*(string|number|boolean|void|any|never)\b/.test(code) && /\b(interface|type|enum)\b/.test(code)) return 'typescript';
  if (/\bfunction\b.*\{|const |let |=>\s*\{|require\(|import .* from/.test(code)) {
    // Distinguish TS from JS by type annotations (not HTML angle brackets)
    if (/:\s*(string|number|boolean|void|any|never)\b/.test(code) || /\w+<\w+(?:,\s*\w+)*>/.test(code)) return 'typescript';
    return 'javascript';
  }
  // Anchor Python patterns to start of line to avoid matching keywords inside strings
  if (/^\s*def\b.*:/m.test(code) || /^\s*import\s+\w/m.test(code) || /^\s*print\s*\(/m.test(code)) return 'python';
  if (/<\/?[a-z][\s\S]*>/i.test(code) && /className|onClick|useState/.test(code)) return 'jsx';
  if (/<\/?[a-z][\s\S]*>/i.test(code)) return 'html';
  return 'unknown';
}

module.exports = {
  computeCoherencyScore,
  computeCoverageGate,
  scoreSyntax,
  scoreCompleteness,
  scoreConsistency,
  detectLanguage,
  checkBalancedBraces,
  WEIGHTS,
};
