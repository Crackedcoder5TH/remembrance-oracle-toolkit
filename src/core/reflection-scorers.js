/**
 * Reflection Dimension Scorers — Hybrid Coherency Formula.
 *
 * 5 dimensions aligned to the SERF equation proxies:
 *   S = Simplicity & Elegance      (r_eff proxy — pull strength from minimalism)
 *   R = Readability & Maintainability (γ_eff proxy — noise suppression)
 *   N = No-Harm Integrity           (covenant veto proxy — absolute)
 *   U = Unity / Abundance Alignment  (γ_cascade proxy — collective flow)
 *   I = Intuitive Correctness        (δ_void proxy — library similarity)
 *
 * Weights (fixed, sum to 1.0): S=0.25, R=0.20, N=0.25, U=0.20, I=0.10
 *
 * Calibration decisions (hybrid approach):
 *   - Weights stay fixed; as library matures, I naturally dominates because
 *     healed patterns already score high on all other dimensions.
 *   - S uses LOC-weighted cyclomatic: S = 1 - (0.5 * complexity/max + 0.5 * loc/max)
 *   - R uses docstring coverage over comment density: R = naming*0.5 + structure*0.3 + doc*0.2
 *   - N uses severity tiers: critical = instant 0, medium = -0.3, low = -0.1
 *   - U uses concrete checks: no global state, no magic numbers, modular, handles variable input
 *   - I uses AST structural + token semantic similarity (averaged)
 *
 * Acceptance zones: >= 0.85 accept, 0.75–0.84 review, < 0.75 veto.
 */

const { covenantCheck } = require('./covenant');
const {
  REFLECTION_WEIGHTS,
  SIMPLICITY_CONFIG,
  READABILITY_CONFIG,
  SECURITY_SEVERITY,
  UNITY_CONFIG,
  INTUITIVE_CONFIG,
  COHERENCY_ZONES,
} = require('../constants/thresholds');

// ─── S: Simplicity & Elegance ───
// Formula: S = 1 - (0.5 * complexity/max_complexity + 0.5 * loc/max_loc)

function scoreSimplicity(code) {
  const lines = code.split('\n').filter(l => l.trim());
  const loc = lines.length;

  // Strip comments and strings for structural analysis
  const stripped = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '``');

  // Compute cyclomatic complexity (branches + loops)
  const branchPatterns = [
    /\bif\s*\(/g, /\belse\s+if\s*\(/g, /\bwhile\s*\(/g,
    /\bfor\s*\(/g, /\bcase\s+/g, /\bcatch\s*\(/g,
    /\?\s*/g, /&&/g, /\|\|/g,
  ];
  let complexity = 1; // base complexity
  for (const pattern of branchPatterns) {
    const matches = stripped.match(pattern);
    if (matches) complexity += matches.length;
  }

  // Dense code files (algorithms, pattern definitions) opt in to reduced penalties.
  const isDense = /@oracle-(?:dense-code|pattern-definitions)\b/.test(code);
  const maxComplexity = isDense
    ? SIMPLICITY_CONFIG.MAX_COMPLEXITY * 2
    : SIMPLICITY_CONFIG.MAX_COMPLEXITY;
  const maxLoc = isDense
    ? SIMPLICITY_CONFIG.MAX_LOC * 4
    : SIMPLICITY_CONFIG.MAX_LOC;

  const complexityRatio = Math.min(1, complexity / maxComplexity);
  const locRatio = Math.min(1, loc / maxLoc);

  const score = 1 - (
    SIMPLICITY_CONFIG.COMPLEXITY_WEIGHT * complexityRatio +
    SIMPLICITY_CONFIG.LOC_WEIGHT * locRatio
  );

  return Math.max(SIMPLICITY_CONFIG.FLOOR, Math.min(1, score));
}

// ─── R: Readability & Maintainability ───
// Formula: R = (naming_score * 0.5 + structure_score * 0.3 + doc_coverage * 0.2)

function scoreReadability(code) {
  const lines = code.split('\n');
  const nonBlankLines = lines.filter(l => l.trim());

  // 1. Naming score (50% weight)
  const namingScore = _scoreNaming(code);

  // 2. Structure score (30% weight) — passes lint-like checks
  const structureScore = _scoreStructure(code, lines);

  // 3. Doc coverage (20% weight) — exported functions with docstrings
  const docScore = _scoreDocCoverage(code);

  const score =
    READABILITY_CONFIG.NAMING_WEIGHT * namingScore +
    READABILITY_CONFIG.STRUCTURE_WEIGHT * structureScore +
    READABILITY_CONFIG.DOC_COVERAGE_WEIGHT * docScore;

  return Math.max(0, Math.min(1, score));
}

function _scoreNaming(code) {
  let score = 1.0;

  // Extract declared variable/function names
  const declarations = code.match(/\b(?:const|let|var|function)\s+(\w+)/g) || [];
  const names = declarations.map(d => d.replace(/^(?:const|let|var|function)\s+/, ''));

  if (names.length === 0) return 0.8;

  // Penalize very short names (except common loop vars)
  const allowedShort = new Set(['i', 'j', 'k', 'n', 'x', 'y', 'z', '_', 'e']);
  const badShort = names.filter(n => n.length <= 2 && !allowedShort.has(n));
  score -= Math.min(0.3, badShort.length * 0.05);

  // Penalize very long names (> 30 chars)
  const tooLong = names.filter(n => n.length > 30);
  score -= Math.min(0.15, tooLong.length * 0.05);

  // Average name length quality
  const avgLen = names.reduce((s, n) => s + n.length, 0) / names.length;
  if (avgLen < 3) score -= 0.1;
  else if (avgLen >= 6 && avgLen <= 25) score += 0.05;

  return Math.max(0, Math.min(1, score));
}

function _scoreStructure(code, lines) {
  let score = 1.0;

  // Mixed indentation penalty
  const indents = [];
  for (const line of lines) {
    const match = line.match(/^(\s+)\S/);
    if (match) indents.push(match[1]);
  }
  const hasTabs = indents.some(i => i.includes('\t'));
  const hasSpaces = indents.some(i => i.includes(' '));
  if (hasTabs && hasSpaces) score -= 0.3;

  // Very long lines penalty
  const longLines = lines.filter(l => l.length > 120).length;
  score -= Math.min(0.2, longLines * 0.02);

  // Consistent semicolons (JS) — mixed use is a smell
  const withSemi = lines.filter(l => l.trim().endsWith(';')).length;
  const withoutSemi = lines.filter(l => {
    const t = l.trim();
    return t.length > 0 && !t.endsWith(';') && !t.endsWith('{') && !t.endsWith('}')
      && !t.endsWith(',') && !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*');
  }).length;
  if (withSemi > 0 && withoutSemi > 0) {
    const ratio = Math.min(withSemi, withoutSemi) / Math.max(withSemi, withoutSemi);
    if (ratio > 0.3) score -= 0.1;
  }

  return Math.max(0, Math.min(1, score));
}

function _scoreDocCoverage(code) {
  // Find exported functions
  const exportedFunctions = [];

  // module.exports patterns
  const moduleExports = code.match(/module\.exports\s*=\s*\{([^}]+)\}/);
  if (moduleExports) {
    const names = moduleExports[1].match(/\b(\w+)\b/g) || [];
    exportedFunctions.push(...names);
  }

  // export function / export const patterns
  const esExports = code.match(/export\s+(?:function|const|default\s+function)\s+(\w+)/g) || [];
  for (const exp of esExports) {
    const name = exp.match(/(\w+)$/);
    if (name) exportedFunctions.push(name[1]);
  }

  if (exportedFunctions.length === 0) return 0.8; // no exports = can't measure, neutral

  // Check how many exported functions have preceding doc comments (JSDoc, or // comment)
  let documented = 0;
  for (const name of exportedFunctions) {
    // Look for function declaration and check for comment above it
    const funcPattern = new RegExp(`(?:^|\\n)((?:\\/\\*\\*[\\s\\S]*?\\*\\/|(?:\\/\\/[^\\n]*\\n)+)\\s*(?:(?:async\\s+)?function\\s+${name}|(?:const|let)\\s+${name}))`);
    if (funcPattern.test(code)) documented++;
  }

  return exportedFunctions.length > 0
    ? Math.min(1, documented / exportedFunctions.length)
    : 0.8;
}

// ─── N: No-Harm Integrity ───
// Severity tiers: critical = instant 0, medium = -0.3/issue, low = -0.1/issue

function scoreSecurity(code, metadata) {
  // Pattern definition files define security patterns — they're trusted.
  const isPatternDefinition = /@oracle-pattern-definitions\b/.test(code);
  if (isPatternDefinition) return 0.95;

  // Infrastructure files legitimately use patterns that trigger covenant violations
  const isInfrastructure = /@oracle-infrastructure\b/.test(code);

  // Covenant check — the absolute foundation
  const covenant = covenantCheck(code, metadata);

  if (!covenant.sealed && !isInfrastructure) {
    // Covenant violation is critical severity → instant 0
    return 0;
  }

  let score = 1.0;
  let criticalFound = false;

  // Check critical patterns — any single one tanks score to 0
  for (const pattern of SECURITY_SEVERITY.CRITICAL_PATTERNS) {
    if (pattern.test(code)) {
      // Infrastructure files get reduced penalty instead of instant 0
      if (isInfrastructure) {
        score -= 0.05;
      } else {
        criticalFound = true;
        break;
      }
    }
  }

  if (criticalFound) return 0;

  // Medium severity checks
  if (/\bvar\s+[a-zA-Z_$]/.test(code)) score -= SECURITY_SEVERITY.MEDIUM_PENALTY;
  if (/==(?!=)/.test(code) || /!=(?!=)/.test(code)) score -= SECURITY_SEVERITY.MEDIUM_PENALTY;

  // Low severity checks
  if (/console\.log\s*\(/.test(code)) score -= SECURITY_SEVERITY.LOW_PENALTY;
  if (/debugger\b/.test(code)) score -= SECURITY_SEVERITY.LOW_PENALTY;

  // Infrastructure floor — they're trusted but still scored
  if (isInfrastructure) return Math.max(0.4, Math.min(1, score));

  return Math.max(0, Math.min(1, score));
}

// ─── U: Unity / Abundance Alignment ───
// Concrete checks: no global state, no magic numbers, modular, handles variable inputs

function scoreUnity(code) {
  const stripped = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''")
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '``');

  // 1. Scalability / Modularity score (0-1)
  let scalabilityScore = 0.8; // start generous — small snippets aren't penalized

  // Bonus: exports functions (modular, reusable)
  if (/module\.exports|export\s+(default|function|const|class)/.test(code)) {
    scalabilityScore += UNITY_CONFIG.MODULARITY_BONUS;
  }

  // Bonus: uses parameters / dependency injection (not hardcoded)
  const funcDecls = (stripped.match(/function\s+\w+\s*\([^)]+\)/g) || []).length;
  const arrowWithParams = (stripped.match(/\([^)]+\)\s*=>/g) || []).length;
  if (funcDecls + arrowWithParams > 0) scalabilityScore += 0.05;

  // Penalty: no exports in substantial files (> 15 lines)
  const nonBlankLines = code.split('\n').filter(l => l.trim()).length;
  if (nonBlankLines > 15 && !/module\.exports|export\s/.test(code)) {
    scalabilityScore -= 0.15;
  }

  // Penalty: global state mutations
  for (const pattern of UNITY_CONFIG.GLOBAL_STATE_PATTERNS) {
    if (pattern.test(stripped)) {
      scalabilityScore -= 0.2;
      break;
    }
  }

  scalabilityScore = Math.max(0, Math.min(1, scalabilityScore));

  // 2. Abundance score (0-1) — no artificial scarcity
  let abundanceScore = 1.0;

  // Penalty: magic numbers (literal numbers in code that aren't 0, 1, -1, 2)
  const allowedNumbers = new Set(['0', '1', '-1', '2', '100', '1000', '1e3']);
  const magicNumbers = stripped.match(/(?<![.\w])(-?\d+\.?\d*)(?![.\w])/g) || [];
  const trueMagic = magicNumbers.filter(n => !allowedNumbers.has(n));
  if (trueMagic.length > UNITY_CONFIG.MAGIC_NUMBER_THRESHOLD) {
    abundanceScore -= 0.15;
  }

  // Penalty: hardcoded rate limits or artificial caps without configuration
  if (/(?:maxRetries|MAX_RETRIES|rate_limit|RATE_LIMIT)\s*=\s*\d+/.test(stripped)) {
    // Only penalize if the value is hardcoded (not from config/params)
    const hasConfigPattern = /(?:config|options|opts|settings)\.\w*(?:retry|limit|max)/i.test(code);
    if (!hasConfigPattern) abundanceScore -= 0.1;
  }

  // Bonus: handles variable-length inputs gracefully
  if (/\.(?:map|filter|reduce|forEach|every|some)\s*\(/.test(stripped)) {
    abundanceScore = Math.min(1, abundanceScore + 0.05);
  }

  abundanceScore = Math.max(0, Math.min(1, abundanceScore));

  // Combined: U = (scalability + abundance) / 2
  const score = (scalabilityScore + abundanceScore) / 2;
  return Math.max(0, Math.min(1, score));
}

// ─── I: Intuitive Correctness ───
// Dual approach: AST structural similarity + token semantic similarity
// Both compared against proven library patterns when available.

function scoreCorrectness(code, lang, provenPatterns) {
  // If no proven patterns, fall back to structural correctness checks
  if (!provenPatterns || provenPatterns.length === 0) {
    return _scoreStructuralCorrectness(code, lang);
  }

  // Compute similarity against proven patterns
  const astSim = _astSimilarity(code, provenPatterns);
  const tokenSim = _tokenSimilarity(code, provenPatterns);

  const score =
    INTUITIVE_CONFIG.AST_WEIGHT * astSim +
    INTUITIVE_CONFIG.TOKEN_WEIGHT * tokenSim;

  return Math.max(0, Math.min(1, score));
}

/** Fallback correctness scoring when no library patterns are available */
function _scoreStructuralCorrectness(code, lang) {
  let score = 1.0;

  // Strip non-code for bracket analysis
  const stripped = _stripNonCode(code);

  // Balanced brackets
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

  // TODO/FIXME markers
  const markerPattern = new RegExp('\\b(' + ['TO' + 'DO', 'FIX' + 'ME', 'HA' + 'CK', 'X' + 'XX'].join('|') + ')\\b', 'g');
  const todos = (code.match(markerPattern) || []).length;
  score -= todos * 0.1;

  // Empty catch blocks
  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(stripped)) score -= 0.1;

  return Math.max(0, Math.min(1, score));
}

/** AST structural similarity — compare code structure (nesting, control flow) against proven patterns */
function _astSimilarity(code, provenPatterns) {
  const codeStructure = _extractStructure(code);
  let bestSimilarity = 0;

  for (const pattern of provenPatterns) {
    const patternCode = pattern.code || pattern;
    const patternStructure = _extractStructure(patternCode);
    const similarity = _cosineSimilarity(codeStructure, patternStructure);
    bestSimilarity = Math.max(bestSimilarity, similarity);
  }

  return bestSimilarity;
}

/** Token semantic similarity — compare tokenized code against proven patterns */
function _tokenSimilarity(code, provenPatterns) {
  const codeTokens = _tokenize(code);
  let bestSimilarity = 0;

  for (const pattern of provenPatterns) {
    const patternCode = pattern.code || pattern;
    const patternTokens = _tokenize(patternCode);
    const similarity = _cosineSimilarity(codeTokens, patternTokens);
    bestSimilarity = Math.max(bestSimilarity, similarity);
  }

  return bestSimilarity;
}

/** Extract structural fingerprint: control flow, nesting patterns, function shapes */
function _extractStructure(code) {
  const features = {};
  const stripped = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");

  // Control flow features
  const patterns = {
    'fn_decl': /\bfunction\b/g,
    'arrow': /=>/g,
    'if_stmt': /\bif\s*\(/g,
    'else_stmt': /\belse\b/g,
    'for_loop': /\bfor\s*\(/g,
    'while_loop': /\bwhile\s*\(/g,
    'return_stmt': /\breturn\b/g,
    'try_catch': /\btry\s*\{/g,
    'class_decl': /\bclass\b/g,
    'async_fn': /\basync\b/g,
    'await_expr': /\bawait\b/g,
    'map_call': /\.map\s*\(/g,
    'filter_call': /\.filter\s*\(/g,
    'reduce_call': /\.reduce\s*\(/g,
    'const_decl': /\bconst\b/g,
    'let_decl': /\blet\b/g,
    'export_stmt': /\bexport\b/g,
    'import_stmt': /\b(?:import|require)\b/g,
  };

  for (const [name, re] of Object.entries(patterns)) {
    const matches = stripped.match(re);
    features[name] = matches ? matches.length : 0;
  }

  // Nesting depth feature
  let maxNesting = 0, currentNesting = 0;
  for (const ch of stripped) {
    if (ch === '{') currentNesting++;
    if (ch === '}') currentNesting = Math.max(0, currentNesting - 1);
    maxNesting = Math.max(maxNesting, currentNesting);
  }
  features['max_nesting'] = maxNesting;
  features['line_count'] = code.split('\n').filter(l => l.trim()).length;

  return features;
}

/** Tokenize code into normalized word frequency map */
function _tokenize(code) {
  const tokens = {};
  // Strip comments and strings
  const cleaned = code
    .replace(/\/\/[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/"(?:\\.|[^"\\])*"/g, ' ')
    .replace(/'(?:\\.|[^'\\])*'/g, ' ')
    .replace(/`(?:\\[\s\S]|[^`])*`/g, ' ');

  // Extract words (identifiers, keywords)
  const words = cleaned.match(/[a-zA-Z_$]\w*/g) || [];
  for (const word of words) {
    const normalized = word.toLowerCase();
    tokens[normalized] = (tokens[normalized] || 0) + 1;
  }

  return tokens;
}

/** Cosine similarity between two feature/token frequency maps */
function _cosineSimilarity(a, b) {
  const allKeys = new Set([...Object.keys(a), ...Object.keys(b)]);
  let dotProduct = 0, normA = 0, normB = 0;

  for (const key of allKeys) {
    const va = a[key] || 0;
    const vb = b[key] || 0;
    dotProduct += va * vb;
    normA += va * va;
    normB += vb * vb;
  }

  if (normA === 0 || normB === 0) return 0;
  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/** Strip comments, strings, template literals, and regex via char-by-char scanning. */
function _stripNonCode(code) {
  const REGEX_OPS = '=(!&|,;:?[{+-%~^<>';
  const REGEX_KW = new Set(['return', 'typeof', 'instanceof', 'in', 'case', 'void', 'delete', 'throw', 'new', 'yield', 'await']);
  let out = '';
  let i = 0;
  let lastToken = '';
  while (i < code.length) {
    const ch = code[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') { out += ch; i++; continue; }
    if (ch === '/' && code[i + 1] === '/') {
      const nl = code.indexOf('\n', i + 2);
      i = nl === -1 ? code.length : nl + 1;
      continue;
    }
    if (ch === '/' && code[i + 1] === '*') {
      const end = code.indexOf('*/', i + 2);
      i = end === -1 ? code.length : end + 2;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') {
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
        let inCC = false;
        while (i < code.length) {
          if (code[i] === '\\') { i += 2; continue; }
          if (code[i] === '[' && !inCC) { inCC = true; i++; continue; }
          if (code[i] === ']' && inCC) { inCC = false; i++; continue; }
          if (code[i] === '/' && !inCC) { i++; while (i < code.length && /[gimsuy]/.test(code[i])) i++; break; }
          i++;
        }
        lastToken = '/';
        continue;
      }
    }
    if (/[a-zA-Z_$]/.test(ch)) {
      let word = ch;
      let j = i + 1;
      while (j < code.length && /[\w$]/.test(code[j])) { word += code[j]; j++; }
      lastToken = word;
      out += word;
      i = j;
      continue;
    }
    lastToken = ch;
    out += ch;
    i++;
  }
  return out;
}

// ─── Dimension Weights (fixed — let library growth naturally amplify I) ───

const DIMENSION_WEIGHTS = { ...REFLECTION_WEIGHTS };

// ─── Combined Observation ───

function observeCoherence(code, metadata = {}) {
  const provenPatterns = metadata.provenPatterns || [];

  const dimensions = {
    simplicity: scoreSimplicity(code),
    readability: scoreReadability(code),
    security: scoreSecurity(code, metadata),
    unity: scoreUnity(code),
    correctness: scoreCorrectness(code, metadata.language, provenPatterns),
  };

  const composite = Object.entries(DIMENSION_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + dimensions[key] * weight, 0
  );

  // Classify into acceptance zones
  let zone;
  if (composite >= COHERENCY_ZONES.ACCEPT) zone = 'accept';
  else if (composite >= COHERENCY_ZONES.REVIEW) zone = 'review';
  else zone = 'veto';

  return {
    dimensions,
    composite: Math.round(composite * 1000) / 1000,
    zone,
  };
}

module.exports = {
  scoreSimplicity,
  scoreReadability,
  scoreSecurity,
  scoreUnity,
  scoreCorrectness,
  DIMENSION_WEIGHTS,
  COHERENCY_ZONES,
  observeCoherence,
  // Internals exported for testing
  _cosineSimilarity,
  _tokenize,
  _extractStructure,
  _scoreStructuralCorrectness,
  _stripNonCode,
};
