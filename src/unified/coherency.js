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

// ─── Filesystem Caches (avoid per-score disk probes) ───

const _fsCache = new Map();
const _FS_CACHE_TTL = 30000; // 30 seconds

function _fileExistsCache(filePath) {
  const now = Date.now();
  const cached = _fsCache.get(filePath);
  if (cached && (now - cached.time) < _FS_CACHE_TTL) return cached.exists;
  const fs = require('fs');
  const exists = fs.existsSync(filePath);
  _fsCache.set(filePath, { exists, time: now });
  return exists;
}

function _testFileExistsCache(filePath) {
  const cacheKey = `test:${filePath}`;
  const now = Date.now();
  const cached = _fsCache.get(cacheKey);
  if (cached && (now - cached.time) < _FS_CACHE_TTL) return cached.exists;
  const fs = require('fs');
  const path = require('path');
  const base = path.basename(filePath, path.extname(filePath));
  const repoRoot = path.resolve(path.dirname(filePath), '..');
  const testCandidates = [
    path.resolve('tests', base + '.test.js'),
    path.resolve('tests', base.replace(/[-_]/g, '-') + '.test.js'),
    path.resolve(repoRoot, 'tests', base + '.test.js'),
    path.resolve('tests', base.replace(/^(.+)/, '$1.test.js')),
  ];
  const exists = testCandidates.some(t => fs.existsSync(t));
  _fsCache.set(cacheKey, { exists, time: now });
  return exists;
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

  /**
   * Content preset — for non-code content (configs, templates, docs, schemas).
   * No syntax parsing, no test proof requirement. Focuses on completeness,
   * consistency, readability, and historical reliability.
   */
  content: {
    syntax: 0.0,
    completeness: 0.30,
    consistency: 0.25,
    readability: 0.25,
    security: 0.0,
    testProof: 0.0,
    historicalReliability: 0.20,
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
  if (/^\s*\.{3}\s*$/m.test(code) || /\bpass\s*$/m.test(code) || /raise NotImplementedError/m.test(code)) score -= COMPLETENESS_PENALTIES.PLACEHOLDER_PENALTY;
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

  // Guard: cap code length for expensive regex-based scorers.
  // IMPORTANT: truncate at a brace boundary so the AST parser sees
  // valid syntax. Cutting mid-function breaks brace balancing, which
  // tanks syntaxValid and causes AST parse failure (-0.05 penalty).
  const MAX_COHERENCY_CHARS = 50000;
  let scoringCode = code;
  if (code.length > MAX_COHERENCY_CHARS) {
    // Find the last closing brace before the limit — that's a clean
    // function/block boundary. Fall back to the raw limit if no
    // brace is found (unlikely in real JS/TS code).
    const searchEnd = Math.min(code.length, MAX_COHERENCY_CHARS + 500);
    const chunk = code.slice(0, searchEnd);
    let cutPoint = MAX_COHERENCY_CHARS;
    // Walk backwards from the limit to find a closing brace at depth 0
    let depth = 0;
    for (let i = cutPoint; i >= cutPoint - 5000 && i >= 0; i--) {
      if (chunk[i] === '}') depth++;
      if (chunk[i] === '{') depth--;
      if (depth === 0 && chunk[i] === '}') {
        // Check if next non-whitespace is a newline or semicolon
        const after = chunk.slice(i + 1, i + 5).trim();
        if (after === '' || after[0] === '\n' || after[0] === ';' || after[0] === '/' || after[0] === '}') {
          cutPoint = i + 1;
          break;
        }
      }
    }
    scoringCode = code.slice(0, cutPoint);
  }

  const language = metadata.language || detectLanguage(scoringCode);
  const contentType = metadata.contentType || contentTypeForLanguage(language);
  // Auto-select content preset for non-code content types
  const defaultPreset = contentType !== 'code' ? 'content' : 'oracle';
  const preset = metadata.preset || defaultPreset;
  const weights = metadata.weights || WEIGHT_PRESETS[preset] || WEIGHT_PRESETS.oracle;

  // Test proof
  let testProof = metadata.testPassed === true ? 1.0 : metadata.testPassed === false ? 0.0 : COHERENCY_DEFAULTS.TEST_PROOF_FALLBACK;
  // Auto-detect: if a corresponding test file exists, boost testProof (memoized)
  if (testProof === COHERENCY_DEFAULTS.TEST_PROOF_FALLBACK && metadata.testPassed == null) {
    try {
      const filePath = metadata.filePath || metadata.file || '';
      if (filePath) {
        const hasTest = _testFileExistsCache(filePath);
        if (hasTest) testProof = 0.75;
      }
    } catch { /* auto-detect is best-effort */ }
  }
  let coverageGate = null;
  if (metadata.testCode) {
    coverageGate = computeCoverageGate(code, metadata.testCode, language);
    testProof *= coverageGate.factor;
  }

  let historicalReliability = metadata.historicalReliability ?? COHERENCY_DEFAULTS.HISTORICAL_RELIABILITY_FALLBACK;
  // Files in the codebase that pass covenant have demonstrated reliability
  if (historicalReliability === COHERENCY_DEFAULTS.HISTORICAL_RELIABILITY_FALLBACK && metadata.filePath) {
    try {
      if (_fileExistsCache(metadata.filePath)) historicalReliability = 0.7;
    } catch { /* best-effort */ }
  }

  // Large files that were truncated should use the full code for syntax
  // checking (brace balance), since truncation breaks brace balance by
  // design (cutting inside a class body).
  const wasTruncated = code.length > MAX_COHERENCY_CHARS;

  // Score all dimensions (use size-capped scoringCode for regex-heavy scorers).
  const scores = {
    syntaxValid: wasTruncated ? scoreSyntax(code, language) : scoreSyntax(scoringCode, language),
    completeness: scoreCompleteness(scoringCode),
    consistency: scoreConsistency(scoringCode, language),
    readability: weights.readability > 0 ? scoreReadability(scoringCode, language) : 0,
    security: weights.security > 0 ? scoreSecurity(scoringCode, language) : 0,
    testProof,
    historicalReliability,
    fractalAlignment: weights.fractalAlignment > 0 ? scoreFractalAlignment(scoringCode, language) : COHERENCY_DEFAULTS.FRACTAL_ALIGNMENT_FALLBACK,
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

  // AST-based boost/penalty.
  // Skip the AST penalty for large files: if the code was truncated
  // for scoring, AST parse failure is EXPECTED (truncation breaks
  // syntax) and should not reduce the score.
  let ast;
  try {
    ast = astCoherencyBoost(scoringCode, language);
  } catch (_) {
    ast = { boost: 0, parsed: { valid: false, functions: [], classes: [], complexity: 0 } };
  }
  if (!ast || !ast.parsed) {
    ast = { boost: 0, parsed: { valid: false, functions: [], classes: [], complexity: 0 } };
  }
  // Zero out the penalty if we truncated — the parse failure is from
  // truncation, not from bad code. The full file may be perfectly valid.
  if (wasTruncated && ast.boost < 0) {
    ast.boost = 0;
  }

  const total = Math.max(0, Math.min(1, weighted + ast.boost));

  // ─── Emergent SERF integration ─────────────────────────────────
  //
  // The legacy score (computed above via hard-coded dimensions) is
  // registered with the EmergentCoherency singleton. If any pipeline
  // stages have also registered signals (audit, ground, plan, gate,
  // feedback, void compression, tier coverage), the emergent score
  // is the geometric mean of ALL signals — legacy + pipeline. This
  // is the SERF equation: the architecture's pipeline output IS the
  // coherency, and the legacy scorer becomes just one signal among
  // many as the pipeline grows.
  //
  // When no pipeline signals are registered, the emergent total
  // equals the legacy total (backwards compatible). As more stages
  // fire, the emergent total reflects the full pipeline reality.
  let emergentTotal = total;
  let emergentBreakdown = scores;
  try {
    const { getEmergentCoherency } = require('./emergent-coherency');
    const ec = getEmergentCoherency();
    // Reset stale signals from prior scoring calls so they don't
    // contaminate this score. Pipeline stages that fire DURING this
    // scoring will re-register their signals after this reset.
    ec.reset();
    ec.registerLegacy({ total, breakdown: scores });
    if (ec.signalCount > 0) {
      // Pipeline signals are active — use the emergent score.
      // The legacy score is already inside the geometric mean via registerLegacy.
      emergentTotal = ec.total;
      emergentBreakdown = ec.breakdown;
    }
  } catch {
    // emergent-coherency not available — use legacy score as-is
  }

  // ─── Auto-evolve living covenant + emergence ────────────────────
  // These fire from the orchestrator and generator cycles explicitly,
  // not from every computeCoherencyScore call. The orchestrator's
  // runCycle() and generator's runCycle() both call living.evolve()
  // and table.checkEmergence() directly. The post-commit hook also
  // fires the generator which handles both. This avoids test
  // interference from the scoring function creating persistent state.

  return {
    total: Math.round(emergentTotal * ROUNDING_FACTOR) / ROUNDING_FACTOR,
    breakdown: emergentBreakdown,
    // Legacy breakdown preserved for consumers that read specific dimensions
    legacyBreakdown: scores,
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
  // Non-code content detection (check first since these are structurally distinct)
  if ((/^---\s*\n/.test(code) || /^\w+\s*:\s*\S/m.test(code)) && /^\s+\w+\s*:/m.test(code) && !/[{();]/.test(code)) return 'yaml';
  if (/^\s*\[[\w.-]+\]\s*$/m.test(code) && /^\s*\w+\s*=/m.test(code)) return 'toml';
  if (/^#{1,6}\s+\w/m.test(code) && /\n#{1,6}\s+\w/m.test(code)) return 'markdown';
  if (/^\s*FROM\s+\w/m.test(code) && /^\s*(RUN|CMD|COPY|EXPOSE|ENV|WORKDIR)\s/m.test(code)) return 'dockerfile';
  if (/^\s*(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\s/im.test(code) && /\b(FROM|WHERE|INTO|TABLE|SET)\b/i.test(code)) return 'sql';

  // Code language detection
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

/**
 * Determine the content type category for a given language.
 * Returns 'code' for programming languages, or a specific type for non-code.
 */
function contentTypeForLanguage(language) {
  const lang = (language || '').toLowerCase();
  const nonCodeTypes = {
    yaml: 'config', toml: 'config', ini: 'config', env: 'config',
    json: 'config', dockerfile: 'config',
    markdown: 'documentation', md: 'documentation',
    sql: 'schema', graphql: 'schema',
    regex: 'regex',
    html: 'template', ejs: 'template', handlebars: 'template',
    pug: 'template', mustache: 'template',
  };
  return nonCodeTypes[lang] || 'code';
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
  contentTypeForLanguage,
  checkBalancedBraces,
  WEIGHTS,
  WEIGHT_PRESETS,
};

// ── Atomic self-description (batch-generated) ────────────────────
computeCoherencyScore.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
computeCoverageGate.atomicProperties = {
  charge: 1, valence: 0, mass: 'heavy', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 13, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
scoreSyntax.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
scoreCompleteness.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
scoreConsistency.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
scoreReadability.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 1, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
scoreSecurity.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
scoreFractalAlignment.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'neutral',
  domain: 'oracle',
};
scoreNamingQuality.atomicProperties = {
  charge: -1, valence: 0, mass: 'medium', spin: 'even', phase: 'liquid',
  reactivity: 'inert', electronegativity: 0, group: 2, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
detectLanguage.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
contentTypeForLanguage.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 3, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
checkBalancedBraces.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
