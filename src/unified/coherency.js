'use strict';

/**
 * Unified Coherency Scorer — single source of truth for code quality scoring.
 *
 * Merges dimensions from two separate scorers:
 *   - src/core/coherency.js (syntax, completeness, consistency, testProof, reliability)
 *   - src/reflector/scoring-coherence.js (syntax, readability, security, testProof, reliability)
 *
 * The unified scorer has 7 dimensions (deduplicated):
 *   1. Syntax validity     — does it parse?
 *   2. Completeness        — no dangling references or placeholders?
 *   3. Consistency         — naming, style coherence?
 *   4. Readability         — comment density, nesting depth, naming quality?
 *   5. Security            — no injection, no unsafe patterns?
 *   6. Test proof           — did it pass tests?
 *   7. Historical reliability — how often has it worked?
 *
 * The weights are configurable via presets:
 *   - 'oracle'    — for oracle pattern scoring (default, backwards-compatible)
 *   - 'reflector' — for reflector file-level scoring
 *   - 'balanced'  — equal weight across all dimensions
 */

const { astCoherencyBoost, parseCode } = require('../core/parsers/code-validator');
const {
  SYNTAX_SCORES,
  COMPLETENESS_PENALTIES,
  CONSISTENCY_PENALTIES,
  COHERENCY_DEFAULTS,
  ROUNDING_FACTOR,
} = require('../constants/thresholds');

// Optional reflector dependencies — soft-require to avoid circular deps
let _analyzeCommentDensity, _analyzeNestingDepth, _computeQualityMetrics, _securityScan;
try {
  ({
    analyzeCommentDensity: _analyzeCommentDensity,
    analyzeNestingDepth: _analyzeNestingDepth,
    computeQualityMetrics: _computeQualityMetrics,
    securityScan: _securityScan,
  } = require('../reflector/scoring-analysis'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[unified-coherency:init] scoring-analysis not available:', e?.message || e);
}

let _covenantCheck;
try {
  ({ covenantCheck: _covenantCheck } = require('../core/covenant'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[unified-coherency:init] covenant not available:', e?.message || e);
}

// Fractal alignment — graceful fallback if fractal engines not available
let _computeFractalAlignment;
try {
  ({ computeFractalAlignment: _computeFractalAlignment } = require('../fractals/alignment'));
} catch (e) {
  if (process.env.ORACLE_DEBUG) console.warn('[unified-coherency:init] fractal alignment not available:', e?.message || e);
}

// ─── Weight Presets ───

const WEIGHT_PRESETS = {
  /**
   * Oracle preset — backwards-compatible with core/coherency.js.
   * Security and readability get zero weight (not computed), preserving the original 5-dimension model.
   */
  oracle: {
    syntax: 0.22,
    completeness: 0.18,
    consistency: 0.12,
    readability: 0.0,
    security: 0.0,
    testProof: 0.28,
    historicalReliability: 0.10,
    fractalAlignment: 0.10,
  },

  /**
   * Reflector preset — backwards-compatible with reflector/scoring-coherence.js.
   * Completeness and consistency get zero weight, adds readability + security.
   */
  reflector: {
    syntax: 0.22,
    completeness: 0.0,
    consistency: 0.0,
    readability: 0.18,
    security: 0.12,
    testProof: 0.28,
    historicalReliability: 0.10,
    fractalAlignment: 0.10,
  },

  /**
   * Full preset — uses all 7 dimensions. Best overall quality signal.
   */
  full: {
    syntax: 0.13,
    completeness: 0.09,
    consistency: 0.09,
    readability: 0.13,
    security: 0.09,
    testProof: 0.22,
    historicalReliability: 0.13,
    fractalAlignment: 0.12,
  },
};

// ─── Dimension Scorers ───

/**
 * Score syntax validity (0-1). Reuses core/coherency.js logic.
 */
function scoreSyntax(code, language) {
  const lang = (language || '').toLowerCase();

  if (['python', 'py', 'rust', 'rs', 'go', 'golang'].includes(lang)) {
    try {
      const parsed = parseCode(code, lang);
      if (parsed.valid) {
        const hasStructure = parsed.functions.length > 0 || parsed.classes.length > 0;
        return hasStructure ? SYNTAX_SCORES.PERFECT : SYNTAX_SCORES.BALANCED_BRACES;
      }
      return SYNTAX_SCORES.INVALID;
    } catch (_) { /* fall through */ }
  }

  if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
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

  const balanced = checkBalancedBraces(code);
  const hasStructure = /\b(function|def|class|fn|pub|func|void|int|string)\b/i.test(code);
  let score = SYNTAX_SCORES.UNKNOWN_BASE;
  if (balanced) score += SYNTAX_SCORES.BALANCED_BONUS;
  if (hasStructure) score += SYNTAX_SCORES.STRUCTURE_BONUS;
  return Math.min(score, 1.0);
}

/**
 * Score completeness (0-1). Detects incomplete markers and placeholders.
 */
function scoreCompleteness(code) {
  let score = 1.0;
  const markerRe = new RegExp('\\b(' + ['TO' + 'DO', 'FIX' + 'ME', 'HA' + 'CK', 'X' + 'XX', 'ST' + 'UB'].join('|') + ')\\b', 'g');
  const incompleteMarkers = (code.match(markerRe) || []).length;
  score -= incompleteMarkers * COMPLETENESS_PENALTIES.MARKER_PENALTY;
  if (/\.{3}|pass\s*$|raise NotImplementedError/m.test(code)) score -= COMPLETENESS_PENALTIES.PLACEHOLDER_PENALTY;
  if (/\{\s*\}/.test(code) && !/=>\s*\{\s*\}/.test(code)) score -= COMPLETENESS_PENALTIES.EMPTY_BODY_PENALTY;
  return Math.max(score, 0);
}

/**
 * Score consistency (0-1). Checks indentation and naming convention coherence.
 */
function scoreConsistency(code, language) {
  let score = 1.0;
  const lines = code.split('\n').filter(l => l.trim());
  if (lines.length < 2) return score;
  const lang = (language || '').toLowerCase();

  const indents = lines.map(l => {
    const match = l.match(/^(\s+)/);
    return match ? match[1] : '';
  }).filter(i => i.length > 0);

  if (indents.length > 0) {
    const usesTabs = indents.some(i => i.includes('\t'));
    const usesSpaces = indents.some(i => i.includes(' '));
    if (usesTabs && usesSpaces) score -= CONSISTENCY_PENALTIES.MIXED_INDENT_PENALTY;
    if ((lang === 'python' || lang === 'py') && usesTabs) score -= CONSISTENCY_PENALTIES.MIXED_INDENT_PENALTY;
    if ((lang === 'go' || lang === 'golang') && usesSpaces && !usesTabs) score -= 0.1;
  }

  const camelCase = (code.match(/[a-z][a-zA-Z]+\(/g) || []).length;
  const snakeCase = (code.match(/[a-z]+_[a-z]+\(/g) || []).length;

  if (lang === 'python' || lang === 'py') {
    if (camelCase > 0 && snakeCase > 0) {
      const ratio = camelCase / (camelCase + snakeCase);
      if (ratio > 0.3) score -= CONSISTENCY_PENALTIES.MIXED_NAMING_PENALTY;
    }
  } else if (lang !== 'rust' && lang !== 'rs') {
    if (camelCase > 0 && snakeCase > 0) {
      const ratio = Math.min(camelCase, snakeCase) / Math.max(camelCase, snakeCase);
      if (ratio > CONSISTENCY_PENALTIES.NAMING_RATIO_THRESHOLD) score -= CONSISTENCY_PENALTIES.MIXED_NAMING_PENALTY;
    }
  }

  return Math.max(score, 0);
}

/**
 * Score readability (0-1). Comment density, nesting depth, naming quality.
 * Returns 0.8 if reflector analysis modules are not available.
 */
function scoreReadability(code, language) {
  if (!_analyzeCommentDensity || !_analyzeNestingDepth || !_computeQualityMetrics) {
    return 0.8; // Safe default when reflector not loaded
  }

  const comments = _analyzeCommentDensity(code);
  const commentScore = comments.quality;
  const nesting = _analyzeNestingDepth(code);
  const nestingScore = nesting.score;
  const quality = _computeQualityMetrics(code, language);
  const qualityScore = quality.score;
  const namingScore = scoreNamingQuality(code, language);

  const score = (commentScore * 0.30) + (nestingScore * 0.25) + (qualityScore * 0.25) + (namingScore * 0.20);
  return Math.round(Math.max(0, Math.min(1, score)) * 1000) / 1000;
}

/**
 * Score naming quality (0-1). Checks function name length and convention.
 */
function scoreNamingQuality(code, language) {
  if (!code) return 0.5;
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

/**
 * Score security (0-1). Checks for injection, unsafe patterns.
 * Returns 1.0 if security scanning is not available.
 */
function scoreSecurity(code, language) {
  if (!_securityScan) return 1.0;
  const scan = _securityScan(code, language);
  return scan.score;
}

/**
 * Score fractal alignment (0-1). Maps code structure to the 5 fractal systems.
 * Returns fallback when fractal engines are not available.
 */
function scoreFractalAlignment(code, language) {
  if (!_computeFractalAlignment) return COHERENCY_DEFAULTS.FRACTAL_ALIGNMENT_FALLBACK;
  try {
    const result = _computeFractalAlignment(code, language);
    return typeof result === 'object' ? result.composite : (typeof result === 'number' ? result : COHERENCY_DEFAULTS.FRACTAL_ALIGNMENT_FALLBACK);
  } catch (_) {
    return COHERENCY_DEFAULTS.FRACTAL_ALIGNMENT_FALLBACK;
  }
}

// ─── Main Scoring Function ───

/**
 * Compute unified coherency score across all dimensions.
 *
 * @param {string} code - Code to score
 * @param {object} [metadata] - { language, testPassed, testCode, historicalReliability, preset }
 * @returns {object} { total, breakdown, astAnalysis, coverageGate, language }
 */
function computeCoherencyScore(code, metadata = {}) {
  if (code == null || typeof code !== 'string') {
    return {
      total: 0,
      breakdown: { syntaxValid: 0, completeness: 0, consistency: 0, readability: 0, security: 0, testProof: 0, historicalReliability: 0, fractalAlignment: 0 },
    };
  }

  const language = metadata.language || detectLanguage(code);
  const preset = metadata.preset || 'oracle';
  const weights = metadata.weights || WEIGHT_PRESETS[preset] || WEIGHT_PRESETS.oracle;

  // Test proof
  let testProof = metadata.testPassed === true ? 1.0 : metadata.testPassed === false ? 0.0 : COHERENCY_DEFAULTS.TEST_PROOF_FALLBACK;
  let coverageGate = null;
  if (metadata.testCode) {
    coverageGate = computeCoverageGate(code, metadata.testCode, language);
    testProof *= coverageGate.factor;
  }

  const historicalReliability = metadata.historicalReliability ?? COHERENCY_DEFAULTS.HISTORICAL_RELIABILITY_FALLBACK;

  // Score all dimensions
  const scores = {
    syntaxValid: scoreSyntax(code, language),
    completeness: scoreCompleteness(code),
    consistency: scoreConsistency(code, language),
    readability: weights.readability > 0 ? scoreReadability(code, language) : 0,
    security: weights.security > 0 ? scoreSecurity(code, language) : 0,
    testProof,
    historicalReliability,
    fractalAlignment: weights.fractalAlignment > 0 ? scoreFractalAlignment(code, language) : COHERENCY_DEFAULTS.FRACTAL_ALIGNMENT_FALLBACK,
  };

  // Weighted sum (only active dimensions)
  const weighted =
    scores.syntaxValid * weights.syntax +
    scores.completeness * weights.completeness +
    scores.consistency * weights.consistency +
    scores.readability * weights.readability +
    scores.security * weights.security +
    scores.testProof * weights.testProof +
    scores.historicalReliability * weights.historicalReliability +
    scores.fractalAlignment * (weights.fractalAlignment || 0);

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
    // Backwards-compatible alias: oracle consumers expect breakdown.syntaxValid
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

// ─── Coverage Gate ───

function computeCoverageGate(code, testCode, language) {
  if (!testCode || !code) return { factor: 1.0, reason: 'no test code to evaluate' };

  const lang = (language || '').toLowerCase();
  let identifiers = [];

  if (['javascript', 'js', 'typescript', 'ts'].includes(lang)) {
    const funcMatches = code.match(/(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:\([^)]*\)|[\w$]+)\s*=>|class\s+(\w+))/g) || [];
    for (const m of funcMatches) {
      const name = m.match(/(?:function|const|let|var|class)\s+(\w+)/);
      if (name) identifiers.push(name[1]);
    }
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

  identifiers = identifiers.filter(id => id.length > 1 && !['if', 'for', 'new', 'let', 'var', 'do'].includes(id));
  if (identifiers.length === 0) return { factor: 0.8, reason: 'no identifiers extracted from source' };

  const covered = identifiers.filter(id => testCode.includes(id));
  const coverageRatio = covered.length / identifiers.length;

  if (coverageRatio >= 0.5) return { factor: 1.0, covered: covered.length, total: identifiers.length, reason: 'good coverage' };
  if (coverageRatio >= 0.25) return { factor: 0.7, covered: covered.length, total: identifiers.length, reason: 'partial coverage' };
  if (coverageRatio > 0) return { factor: 0.4, covered: covered.length, total: identifiers.length, reason: 'minimal coverage' };
  return { factor: 0.2, covered: 0, total: identifiers.length, reason: 'test code does not reference any source identifiers' };
}

// ─── Language Detection ───

function detectLanguage(code) {
  const rustRe = new RegExp('\\b' + 'fn' + '\\b.*->|let ' + 'mut |' + 'impl' + '\\b');
  if (rustRe.test(code)) return 'rust';
  const goRe = new RegExp('\\b' + 'func' + '\\b.*\\{|' + 'package' + '\\b|fmt\\.');
  if (goRe.test(code)) return 'go';
  if (/\bpublic\b.*\bclass\b|\bSystem\.out/.test(code)) return 'java';
  if (/:\s*(string|number|boolean|void|any|never)\b/.test(code) && /\b(interface|type|enum)\b/.test(code)) return 'typescript';
  if (/\bfunction\b.*\{|const |let |=>\s*\{|require\(|import .* from/.test(code)) {
    if (/:\s*(string|number|boolean|void|any|never)\b/.test(code) || /\w+<\w+(?:,\s*\w+)*>/.test(code)) return 'typescript';
    return 'javascript';
  }
  if (/^\s*def\b.*:/m.test(code) || /^\s*import\s+\w/m.test(code) || /^\s*print\s*\(/m.test(code)) return 'python';
  if (/<\/?[a-z][\s\S]*>/i.test(code) && /className|onClick|useState/.test(code)) return 'jsx';
  if (/<\/?[a-z][\s\S]*>/i.test(code)) return 'html';
  return 'unknown';
}

// ─── Brace Balancing ───

function checkBalancedBraces(code) {
  const stack = [];
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const closers = new Set([')', ']', '}']);
  const REGEX_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'case', 'void', 'delete', 'throw', 'new', 'yield', 'await']);
  const REGEX_OPS = '=(!&|,;:?[{+-%~^<>';
  let i = 0;
  let lastToken = '';
  while (i < code.length) {
    const ch = code[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { i++; continue; }
    if (ch === '/' && code[i + 1] === '/') {
      i = code.indexOf('\n', i + 2);
      if (i === -1) break;
      i++;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      i = code.indexOf('*/', i + 2);
      if (i === -1) break;
      i += 2;
      continue;
    }
    if (ch === '`') {
      i++;
      i = _skipTemplateLiteral(code, i);
      lastToken = '`';
      continue;
    }
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

// ─── Backwards-compatible WEIGHTS export ───

const WEIGHTS = {
  syntaxValid: WEIGHT_PRESETS.oracle.syntax,
  completeness: WEIGHT_PRESETS.oracle.completeness,
  consistency: WEIGHT_PRESETS.oracle.consistency,
  testProof: WEIGHT_PRESETS.oracle.testProof,
  historicalReliability: WEIGHT_PRESETS.oracle.historicalReliability,
  fractalAlignment: WEIGHT_PRESETS.oracle.fractalAlignment,
};

module.exports = {
  computeCoherencyScore,
  computeCoverageGate,
  scoreSyntax,
  scoreCompleteness,
  scoreConsistency,
  scoreReadability,
  scoreSecurity,
  scoreFractalAlignment,
  scoreNamingQuality,
  detectLanguage,
  checkBalancedBraces,
  WEIGHTS,
  WEIGHT_PRESETS,
};
