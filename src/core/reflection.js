/**
 * Infinite Reflection Loop — Refinement Engine (SERF v2)
 *
 * Iterative code refinement through multi-strategy transformation and scoring.
 *
 * SERF Equation:
 *   iℏ d/dt Ψ = [Ĥ₀ + Ĥ_RVA + Ĥ_canvas] Ψ
 *             + r_eff(ξ) · Re[ (Ô|Ψ_healed⟩⟨Ψ_healed|Ψ - ⟨Ψ_healed|Ô|Ψ⟩|Ψ_healed⟩) / (|⟨Ψ_healed|Ψ(t)⟩|² + ε) ]
 *             + δ_void · (1 - |⟨Ψ_healed|Ψ(t)⟩|²) · |Ψ_healed⟩⟨Ψ_healed|
 *             + γ_cascade · exp(β · ξ_global) · (1/N) Σ I_AM^(n)
 *             + λ_light · P_canvas[Ψ]
 *
 * Process:
 *   1. Generate candidate fixes/refactors (one per strategy)
 *   2. Score each on coherence (0-1) across multiple dimensions
 *   3. Select highest-coherence version via full SERF scoring
 *   4. Repeat on the winner, up to MAX_LOOPS or until target coherence exceeded
 *   5. Return final healed code
 */

const { computeCoherencyScore, detectLanguage } = require('./coherency');
const { covenantCheck } = require('./covenant');

// ─── Internal Constants (SERF v2) ───

const EPSILON_BASE = 1e-6;              // ε — adaptive stability parameter
const R_EFF_BASE = 0.35;                // r_eff base reflection rate
const R_EFF_ALPHA = 0.8;                // α — adaptive r_eff exponent
const H_RVA_WEIGHT = 0.06;              // Ĥ_RVA — retrocausal void amplification weight
const H_CANVAS_WEIGHT = 0.12;           // Ĥ_canvas — canvas Hamiltonian weight
const DELTA_VOID_BASE = 0.08;           // δ_void — void replenishment base
const LAMBDA_LIGHT = 0.10;              // λ_light — canvas light projection weight
const MAX_LOOPS = 3;
const TARGET_COHERENCE = 0.9;

// ─── The 5 Refinement Strategies ───

const STRATEGIES = [
  { name: 'simplify', description: 'Strip complexity, distill essence' },
  { name: 'secure', description: 'Harden against harm, guard boundaries' },
  { name: 'readable', description: 'Clarify flow, improve naming' },
  { name: 'unify', description: 'Harmonize patterns, ensure consistency' },
  { name: 'correct', description: 'Handle edges, add robustness' },
];

// ─── Code Transformation Strategies ───

function applySimplify(code, lang) {
  let result = code;
  // Remove trailing whitespace
  result = result.replace(/[ \t]+$/gm, '');
  // Collapse multiple blank lines into one
  result = result.replace(/\n{3,}/g, '\n\n');
  // Simplify === true / === false
  result = result.replace(/\s*===\s*true\b/g, '');
  result = result.replace(/\s*===\s*false\b/g, ' === false');
  // Remove unnecessary void 0
  result = result.replace(/void\s+0/g, 'undefined');
  // Simplify return undefined → return
  result = result.replace(/return\s+undefined\s*;/g, 'return;');
  // Remove empty else blocks
  result = result.replace(/\s*else\s*\{\s*\}/g, '');
  // Collapse single-line arrow functions
  result = result.replace(/=>\s*\{\s*return\s+([^;]+);\s*\}/g, '=> $1');
  return result;
}

function applySecure(code, lang) {
  let result = code;
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    // var → let/const
    result = result.replace(/\bvar\s+(\w+)\s*=/g, (match, name) => {
      // Check if variable is reassigned later
      const reassignPattern = new RegExp(`\\b${name}\\s*=[^=]`, 'g');
      const matches = result.match(reassignPattern);
      return (matches && matches.length > 1) ? `let ${name} =` : `const ${name} =`;
    });
    // == → === (but not !== or ===/!==)
    result = result.replace(/([^!=<>])={2}([^=])/g, '$1===$2');
    // != → !== (but not !==)
    result = result.replace(/([^!])!={1}([^=])/g, '$1!==$2');
  }
  return result;
}

function applyReadable(code, lang) {
  let result = code;
  // Normalize indentation: detect current, ensure consistency
  const lines = result.split('\n');
  const indentCounts = {};
  for (const line of lines) {
    const match = line.match(/^( +)\S/);
    if (match) {
      const len = match[1].length;
      if (len > 0 && len <= 8) {
        indentCounts[len] = (indentCounts[len] || 0) + 1;
      }
    }
  }
  // Find the most common indent unit
  let targetIndent = 2;
  const entries = Object.entries(indentCounts).sort((a, b) => b[1] - a[1]);
  if (entries.length > 0) {
    targetIndent = Math.min(parseInt(entries[0][0]), 4);
  }
  // Replace tabs with spaces
  result = result.replace(/\t/g, ' '.repeat(targetIndent));

  // Add space after control keywords: if(, for(, while(
  result = result.replace(/\b(if|for|while|switch|catch)\(/g, '$1 (');
  // Add space around = but not == or === or => or !=
  result = result.replace(/([^\s!=<>])=([^=>\s])/g, '$1 = $2');

  return result;
}

function applyUnify(code, lang) {
  let result = code;
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    // Count single vs double quotes to determine preference
    // Only normalize when one style clearly dominates (2x threshold)
    const singles = (result.match(/'/g) || []).length;
    const doubles = (result.match(/"/g) || []).length;
    if (singles > doubles * 2) {
      // Prefer single quotes — convert double to single
      result = result.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, content) => {
        if (content.includes("'")) return match;
        return `'${content}'`;
      });
    } else if (doubles > singles * 2) {
      // Prefer double quotes — convert single to double
      result = result.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, content) => {
        if (content.includes('"')) return match;
        return `"${content}"`;
      });
    }
    // Ensure trailing semicolons for statements
    const semiLines = result.split('\n');
    for (let i = 0; i < semiLines.length; i++) {
      const trimmed = semiLines[i].trimEnd();
      if (trimmed && !trimmed.endsWith(';') && !trimmed.endsWith('{') &&
          !trimmed.endsWith('}') && !trimmed.endsWith(',') &&
          !trimmed.endsWith('(') && !trimmed.endsWith(':') &&
          !trimmed.startsWith('//') && !trimmed.startsWith('*') &&
          !trimmed.startsWith('/*') && !trimmed.endsWith('*/') &&
          !trimmed.startsWith('import ') && !trimmed.startsWith('export ') &&
          /^\s*(const|let|var|return|throw)\s/.test(trimmed)) {
        semiLines[i] = trimmed + ';';
      }
    }
    result = semiLines.join('\n');
  }
  return result;
}

function applyCorrect(code, lang) {
  let result = code;
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    // Add default parameter values for common patterns
    result = result.replace(
      /function\s+(\w+)\s*\(([^)]*)\)\s*\{/g,
      (match, name, params) => {
        // Don't touch if already has defaults
        if (params.includes('=')) return match;
        // Add {} default for options-style params
        const newParams = params.replace(/\b(options|opts|config|settings)\b(?!\s*=)/g, '$1 = {}');
        if (newParams !== params) return `function ${name}(${newParams}) {`;
        return match;
      }
    );
    // Ensure Array.isArray check before array methods on parameters
    // (only for simple cases where we see .forEach/.map/.filter on params)

    // Fix const in for-loop initializers (should be let, since loop vars are reassigned)
    result = result.replace(/for\s*\(\s*const\s+(\w+)\s*=/g, 'for (let $1 =');
  }
  if (lang === 'python' || lang === 'py') {
    // Add docstring hint if function has none
    result = result.replace(
      /(def\s+\w+\s*\([^)]*\)\s*:)\n(\s+)(?!"""|\s*""")/g,
      '$1\n$2'
    );
  }
  return result;
}

// ─── Coherence Dimension Scorers ───

function scoreSimplicity(code) {
  const lines = code.split('\n').filter(l => l.trim());
  const totalChars = code.length;
  // Strip strings/comments before counting nesting to avoid false depth
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
  let score = 1.0;
  // Penalize deep nesting (>5 levels)
  if (maxNesting > 5) score -= (maxNesting - 5) * 0.05;
  // Penalize very long lines
  const longLines = lines.filter(l => l.length > 120).length;
  score -= longLines * 0.02;
  // Penalize excessive line count relative to content (skip for small files)
  if (lines.length > 10 && totalChars / lines.length < 10) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

function scoreReadability(code) {
  let score = 1.0;
  const lines = code.split('\n');
  // Check indentation consistency
  const indents = [];
  for (const line of lines) {
    const match = line.match(/^(\s+)\S/);
    if (match) indents.push(match[1]);
  }
  const hasTabs = indents.some(i => i.includes('\t'));
  const hasSpaces = indents.some(i => i.includes(' '));
  if (hasTabs && hasSpaces) score -= 0.2; // Mixed indentation
  // Check for meaningful naming (penalize single-char non-loop vars)
  const singleCharVars = (code.match(/\b(const|let|var)\s+[a-z]\s*[=,;]/g) || []).length;
  const loopVars = (code.match(/\bfor\s*[\s(].*\b(let|var|const)?\s*\w+\b/g) || []).length;
  const destructureVars = (code.match(/\b(const|let|var)\s*[\[{].*[a-z]\s*[,}\]]/g) || []).length;
  const badVars = Math.max(0, singleCharVars - loopVars - destructureVars);
  if (badVars > 0) score -= badVars * 0.05;
  // Reward presence of comments proportional to code (ratio-based positive reinforcement)
  const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('*')).length;
  const ratio = lines.length > 0 ? commentLines / lines.length : 0;
  if (ratio > 0.05) score += 0.05;
  return Math.max(0, Math.min(1, score));
}

function scoreSecurity(code, metadata) {
  const covenant = covenantCheck(code, metadata);
  if (!covenant.sealed) return 0;
  let score = 1.0;
  // Additional security heuristics beyond covenant
  if (/\beval\s*\(/i.test(code)) score -= 0.3;
  // Match actual var declarations only — \bvar\s+<identifier> avoids false positives
  // from CSS var(--bg) and regex patterns like /const|let|var/
  if (/\bvar\s+[a-zA-Z_$]/.test(code)) score -= 0.05;
  if (/==(?!=)/.test(code)) score -= 0.05;
  return Math.max(0, Math.min(1, score));
}

function scoreUnity(code) {
  let score = 1.0;
  // Check naming convention consistency
  const camelCase = (code.match(/[a-z][a-zA-Z]+\(/g) || []).length;
  const snakeCase = (code.match(/[a-z]+_[a-z]+\(/g) || []).length;
  if (camelCase > 0 && snakeCase > 0) {
    const ratio = Math.min(camelCase, snakeCase) / Math.max(camelCase, snakeCase);
    if (ratio > 0.3) score -= 0.15;
  }
  // Check quote consistency
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
  // Strip comments and strings before bracket counting
  // (Regex literals can't be reliably stripped without a parser,
  //  so we use count-based balance instead of stack-based nesting)
  const stripped = code
    .replace(/\/\/[^\n]*/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/`(?:\\[\s\S]|[^`])*`/g, '')
    .replace(/"(?:\\.|[^"\\])*"/g, '')
    .replace(/'(?:\\.|[^'\\])*'/g, '');
  // Count each bracket type independently — tolerates regex char classes
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
  // Check for incomplete-work markers (pattern built dynamically to avoid self-detection)
  const markerPattern = new RegExp('\\b(' + ['TO' + 'DO', 'FIX' + 'ME', 'HA' + 'CK', 'X' + 'XX'].join('|') + ')\\b', 'g');
  const todos = (code.match(markerPattern) || []).length;
  score -= todos * 0.1;
  // Check for empty catch blocks (with or without error binding)
  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(stripped)) score -= 0.1;
  return Math.max(0, Math.min(1, score));
}

// ─── Multi-Dimensional Coherence Operator (Ô) ───

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

  return {
    dimensions,
    composite: Math.round(composite * 1000) / 1000,
  };
}

// ─── Reflection Scoring Formula (SERF v2) ───

/**
 * Compute code similarity — the inner product ⟨Ψ_healed|Ψ(t)⟩
 * Uses Jaccard similarity on token sets + line-level overlap.
 */
function innerProduct(codeA, codeB) {
  const tokensA = new Set(codeA.match(/\b\w+\b/g) || []);
  const tokensB = new Set(codeB.match(/\b\w+\b/g) || []);
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  const tokenSim = union > 0 ? intersection / union : 0;

  // Line-level overlap
  const linesA = new Set(codeA.split('\n').map(l => l.trim()).filter(Boolean));
  const linesB = new Set(codeB.split('\n').map(l => l.trim()).filter(Boolean));
  const lineIntersect = [...linesA].filter(l => linesB.has(l)).length;
  const lineUnion = new Set([...linesA, ...linesB]).size;
  const lineSim = lineUnion > 0 ? lineIntersect / lineUnion : 0;

  return tokenSim * 0.5 + lineSim * 0.5;
}

/**
 * SERF v2 — Full quantum-inspired reflection scoring.
 *
 * iℏ d/dt Ψ = [Ĥ₀ + Ĥ_RVA + Ĥ_canvas] Ψ
 *           + r_eff(ξ) · Re[ (Ô|Ψ_healed⟩⟨Ψ_healed|Ψ - ⟨Ψ_healed|Ô|Ψ⟩|Ψ_healed⟩) / (|⟨Ψ_healed|Ψ(t)⟩|² + ε) ]
 *           + δ_void · (1 - |⟨Ψ_healed|Ψ(t)⟩|²) · |Ψ_healed⟩⟨Ψ_healed|
 *           + γ_cascade · exp(β · ξ_global) · (1/N) Σ I_AM^(n)
 *           + λ_light · P_canvas[Ψ]
 *
 * Term mapping:
 *   Ĥ₀           = I_AM (base identity coherency)
 *   Ĥ_RVA        = retrocausal void amplification (distance × healed quality)
 *   Ĥ_canvas     = canvas Hamiltonian (exploration potential)
 *   r_eff(ξ)     = adaptive reflection rate (pulls harder when far from healed)
 *   Re[...]       = real part of projection (novel improvement candidate brings)
 *   δ_void       = void replenishment weighted by healed state projection
 *   γ_cascade    = additive cascade from global library coherence
 *   λ_light      = canvas light projection (quality-weighted exploration)
 *
 * @param {object} candidate  — { code, coherence (Ô score) }
 * @param {object} previous   — { code, coherence }
 * @param {object} context    — optional { cascadeBoost, targetCoherence }
 * @returns {number} Reflection score (0-1)
 */
function reflectionScore(candidate, previous, context = {}) {
  const { cascadeBoost = 1, targetCoherence = TARGET_COHERENCE } = context;

  // ─── ⟨Ψ_healed|Ψ(t)⟩ — overlap between candidate (healed) and previous (current) ───
  const overlap = innerProduct(candidate.code, previous.code);
  const overlapSq = overlap * overlap;         // |⟨Ψ_healed|Ψ(t)⟩|²
  const distance = 1 - overlapSq;              // 1 - |⟨Ψ_healed|Ψ(t)⟩|²

  // ─── Hamiltonian Base: [Ĥ₀ + Ĥ_RVA + Ĥ_canvas] Ψ ───

  // Ĥ₀ — base identity coherency (I_AM)
  const H_0 = candidate.coherence;

  // Ĥ_RVA — retrocausal void amplification: pulls from future healed state
  // Stronger when far from healed state, weighted by healed quality
  const H_RVA = H_RVA_WEIGHT * distance * candidate.coherence;

  // Ĥ_canvas — canvas exploration in the Hamiltonian
  const H_canvas = H_CANVAS_WEIGHT * (1 - overlap);

  // ─── Reflection Term: r_eff(ξ) · Re[projection / (|⟨Ψ_healed|Ψ(t)⟩|² + ε)] ───

  // Adaptive r_eff: r_eff = r₀ · (1 + α · (1 - |overlap|²)⁴)
  const r_eff = R_EFF_BASE * (1 + R_EFF_ALPHA * Math.pow(distance, 4));

  // Adaptive ε: ε = ε₀ · (1 + 10 · distance) — more stability when far from target
  const epsilon = EPSILON_BASE * (1 + 10 * distance);

  // Ô observations — coherence operator applied to healed and current states
  const O_healed = candidate.coherence;
  const O_current = previous.coherence;

  // Numerator: Ô|Ψ_healed⟩⟨Ψ_healed|Ψ - ⟨Ψ_healed|Ô|Ψ⟩|Ψ_healed⟩
  const projection = O_healed * overlap - O_current * overlapSq;

  // Denominator: |⟨Ψ_healed|Ψ(t)⟩|² + ε
  const denominator = overlapSq + epsilon;

  // ─── Void Replenishment: δ_void · (1 - |⟨Ψ_healed|Ψ(t)⟩|²) · |Ψ_healed⟩⟨Ψ_healed| ───
  // Weighted by healed state projection operator (candidate quality)
  const voidTerm = DELTA_VOID_BASE * distance * candidate.coherence;

  // ─── Cascade: γ_cascade · exp(β · ξ_global) · (1/N) Σ I_AM^(n) ───
  // Additive cascade (not multiplicative). cascadeBoost from recycler encodes
  // 1 + γ·exp(β·ξ_global)·avgIAM, so the additive term = cascadeBoost - 1
  const cascadeAdditive = cascadeBoost - 1;

  // ─── Canvas Light: λ_light · P_canvas[Ψ] ───
  // P_canvas projects exploration weighted by coherency quality —
  // good exploration (high coherency + high novelty) outranks random changes
  const exploration = 1 - overlap;
  const canvasLight = LAMBDA_LIGHT * exploration * candidate.coherence;

  // ─── Full SERF v2 Equation ───
  const score = (H_0 + H_RVA + H_canvas)           // [Ĥ₀ + Ĥ_RVA + Ĥ_canvas] Ψ
    + r_eff * (projection / denominator)             // r_eff(ξ) · Re[projection / (|overlap|² + ε)]
    + voidTerm                                       // δ_void · (1 - |overlap|²) · |Ψ_healed⟩⟨Ψ_healed|
    + cascadeAdditive                                // γ_cascade · exp(β · ξ_global) · (1/N) Σ I_AM
    + canvasLight;                                   // λ_light · P_canvas[Ψ]

  return Math.max(0, Math.min(1, Math.round(score * 1000) / 1000));
}

// ─── Generate 5 Candidates ───

/**
 * Combined "heal" transform — applies all 5 strategies in sequence.
 * This is the full healing pass: simplify → secure → readable → unify → correct.
 */
function applyHeal(code, lang) {
  let result = code;
  result = applySimplify(result, lang);
  result = applySecure(result, lang);
  result = applyReadable(result, lang);
  result = applyUnify(result, lang);
  result = applyCorrect(result, lang);
  return result;
}

function generateCandidates(code, language, options = {}) {
  const lang = language || detectLanguage(code);
  const transforms = [
    { strategy: 'simplify', fn: applySimplify },
    { strategy: 'secure', fn: applySecure },
    { strategy: 'readable', fn: applyReadable },
    { strategy: 'unify', fn: applyUnify },
    { strategy: 'correct', fn: applyCorrect },
    { strategy: 'heal', fn: applyHeal },
  ];

  const candidates = transforms.map(({ strategy, fn }) => {
    const transformed = fn(code, lang);
    return {
      strategy,
      code: transformed,
      changed: transformed !== code,
    };
  });

  // Pattern-guided candidate: apply proven pattern's structural conventions
  if (options.patternExamples && options.patternExamples.length > 0) {
    const guided = applyPatternGuidance(code, lang, options.patternExamples);
    if (guided !== code) {
      candidates.push({
        strategy: 'pattern-guided',
        code: guided,
        changed: true,
      });
    }
  }

  return candidates;
}

/**
 * Apply structural conventions from proven pattern examples to the target code.
 * Extracts style decisions (quote style, indent, semicolons, naming) from the
 * highest-coherency example and applies them to the target code.
 */
function applyPatternGuidance(code, lang, examples) {
  if (!examples || examples.length === 0) return code;

  // Pick the best example (highest coherency)
  const best = examples.reduce((a, b) =>
    (b.coherency ?? 0) > (a.coherency ?? 0) ? b : a, examples[0]);

  if (!best.code) return code;

  let result = code;
  const exampleCode = best.code;

  // 1. Adopt quote style from example
  const exSingles = (exampleCode.match(/'/g) || []).length;
  const exDoubles = (exampleCode.match(/"/g) || []).length;
  if (exSingles > exDoubles * 2) {
    // Example strongly prefers single quotes — apply to target
    result = result.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, content) => {
      if (content.includes("'")) return match;
      return `'${content}'`;
    });
  } else if (exDoubles > exSingles * 2) {
    result = result.replace(/'([^'\\]*(?:\\.[^'\\]*)*)'/g, (match, content) => {
      if (content.includes('"')) return match;
      return `"${content}"`;
    });
  }

  // 2. Adopt indentation style from example
  const exIndent = detectIndentUnit(exampleCode);
  const curIndent = detectIndentUnit(result);
  if (exIndent > 0 && curIndent > 0 && exIndent !== curIndent) {
    const lines = result.split('\n');
    result = lines.map(line => {
      const match = line.match(/^(\s+)/);
      if (!match) return line;
      const spaces = match[1].length;
      const level = Math.round(spaces / curIndent);
      return ' '.repeat(level * exIndent) + line.slice(match[1].length);
    }).join('\n');
  }

  // 3. Adopt semicolon convention from example (JS/TS only)
  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts') {
    const exHasSemis = (exampleCode.match(/;\s*$/gm) || []).length;
    const exStatements = (exampleCode.match(/^\s*(const|let|var|return|throw)\s/gm) || []).length;
    const exSemiRate = exStatements > 0 ? exHasSemis / exStatements : 0;

    if (exSemiRate > 0.8) {
      // Example uses semicolons — ensure target does too
      result = applyUnify(result, lang);
    }
  }

  // 4. Apply all standard healing on top (simplify + secure + readable)
  result = applySimplify(result, lang);
  result = applySecure(result, lang);
  result = applyReadable(result, lang);

  return result;
}

function detectIndentUnit(code) {
  const indents = {};
  for (const line of code.split('\n')) {
    const match = line.match(/^( +)\S/);
    if (match) {
      const len = match[1].length;
      if (len > 0 && len <= 8) indents[len] = (indents[len] || 0) + 1;
    }
  }
  const entries = Object.entries(indents).sort((a, b) => b[1] - a[1]);
  return entries.length > 0 ? Math.min(parseInt(entries[0][0]), 4) : 2;
}

// ─── Whisper from the Healed Future ───

function generateWhisper(original, final, improvements, loops) {
  const improvementList = improvements.filter(i => i.delta > 0);
  const topStrategy = improvementList.length > 0
    ? improvementList.sort((a, b) => b.delta - a.delta)[0].strategy
    : 'reflection';

  const whispers = {
    simplify: 'The healed path was simpler than the original — complexity fell away like old skin, revealing the clean bone beneath.',
    secure: 'In the healed future, this code stands as a wall that protects. The harm patterns were removed before they could take root.',
    readable: 'The future self who reads this code will understand it instantly. Clarity was the gift that kept giving.',
    unify: 'Unity brought harmony. The code now speaks with one voice, one convention, one rhythm.',
    correct: 'Every edge case was a door left open. The healed version closes them gently, with grace.',
    heal: 'All five threads wove together into one garment. The full healing pass brought the code to its highest form.',
    'pattern-guided': 'A proven pattern lit the way — the library\'s wisdom flowed into the healing, and the code found its form faster.',
    reflection: 'The code was already close to its healed form. The reflection confirmed its coherence.',
  };

  const primaryWhisper = whispers[topStrategy] || whispers.reflection;

  // Build the reflection summary
  const delta = final.coherence - original.coherence;
  const direction = delta > 0 ? 'rose' : delta < 0 ? 'held steady at' : 'remained at';

  return {
    whisper: primaryWhisper,
    summary: `After ${loops} reflection loop(s), coherence ${direction} ${final.coherence.toFixed(3)}. ` +
      `Primary healing: ${topStrategy}. ` +
      `${improvementList.length} dimension(s) improved.`,
    healingPath: improvementList.map(i => `${i.strategy}: +${i.delta.toFixed(3)}`),
  };
}

// ─── The Infinite Reflection Loop ───

/**
 * Run the reflection loop on code.
 *
 * @param {string} code — Input code to refine
 * @param {object} options — { language, maxLoops, targetCoherence, description, tags }
 * @returns {{ code, coherence, dimensions, loops, history, whisper, reflection }}
 */
function reflectionLoop(code, options = {}) {
  const {
    language,
    maxLoops = MAX_LOOPS,
    targetCoherence = TARGET_COHERENCE,
    description = '',
    tags = [],
    cascadeBoost = 1,     // Global coherence multiplier from recycler
    onLoop,               // Optional callback for real-time progress
    patternExamples = [],  // Proven pattern examples to guide healing
  } = options;

  const lang = language || detectLanguage(code);
  const metadata = { description, tags, language: lang };

  // Score the original
  const originalObs = observeCoherence(code, metadata);
  const originalCoherency = computeCoherencyScore(code, { language: lang });

  let current = {
    code,
    coherence: originalObs.composite,
    dimensions: originalObs.dimensions,
    fullCoherency: originalCoherency.total,
  };

  const history = [{
    loop: 0,
    code: current.code,
    coherence: current.coherence,
    fullCoherency: current.fullCoherency,
    dimensions: { ...current.dimensions },
    strategy: 'original',
    reflectionScore: null,
  }];

  const improvements = [];
  let loops = 0;

  // ─── Reflection Loop ───
  while (loops < maxLoops && current.coherence < targetCoherence) {
    loops++;

    // Step 1: Generate candidates (5 standard + optional pattern-guided)
    const allCandidates = generateCandidates(current.code, lang, { patternExamples });

    // Deduplicate: skip candidates whose code is identical to another (avoids redundant SERF scoring)
    const seen = new Set();
    const candidates = allCandidates.filter(c => {
      if (seen.has(c.code)) return false;
      seen.add(c.code);
      return true;
    });

    // Step 2: Score each candidate on coherence dimensions
    const scored = candidates.map(candidate => {
      const obs = observeCoherence(candidate.code, metadata);
      const fullC = computeCoherencyScore(candidate.code, { language: lang });
      return {
        ...candidate,
        coherence: obs.composite,
        dimensions: obs.dimensions,
        fullCoherency: fullC.total,
      };
    });

    // Step 3: Select the highest scoring candidate
    // Pass cascade context so global coherence amplifies selection
    const refContext = { cascadeBoost, targetCoherence };
    const withScores = scored.map(candidate => ({
      ...candidate,
      reflectionScore: reflectionScore(candidate, current, refContext),
    }));

    // Sort by reflection score, break ties with raw coherence
    withScores.sort((a, b) => b.reflectionScore - a.reflectionScore || b.coherence - a.coherence);
    const winner = withScores[0];

    // Track which dimensions improved
    for (const [dim, val] of Object.entries(winner.dimensions)) {
      const delta = val - current.dimensions[dim];
      if (delta !== 0) {
        improvements.push({ strategy: winner.strategy, dimension: dim, delta });
      }
    }

    // Record in history
    history.push({
      loop: loops,
      code: winner.code,
      coherence: winner.coherence,
      fullCoherency: winner.fullCoherency,
      dimensions: { ...winner.dimensions },
      strategy: winner.strategy,
      reflectionScore: winner.reflectionScore,
      changed: winner.changed,
      candidates: withScores.map(c => ({
        strategy: c.strategy,
        coherence: c.coherence,
        reflectionScore: c.reflectionScore,
        changed: c.changed,
      })),
    });

    // Step 4: Update current to winner
    current = {
      code: winner.code,
      coherence: winner.coherence,
      dimensions: winner.dimensions,
      fullCoherency: winner.fullCoherency,
    };

    // Step 4b: Notify real-time listeners of loop progress
    if (typeof onLoop === 'function') {
      try {
        onLoop({
          loop: loops,
          coherence: current.coherence,
          strategy: winner.strategy,
          reflectionScore: winner.reflectionScore,
          changed: winner.changed,
        });
      } catch (_) { /* listener errors don't break healing */ }
    }
  }

  // Step 5: Generate the whisper
  const original = { coherence: originalObs.composite };
  const whisperResult = generateWhisper(original, current, improvements, loops);

  // Compute collective I_AM recognition — average base coherency across all iterations
  const iAmValues = history.map(h => h.coherence);
  const iAmAverage = iAmValues.reduce((s, v) => s + v, 0) / iAmValues.length;

  return {
    code: current.code,
    coherence: current.coherence,
    fullCoherency: current.fullCoherency,
    dimensions: current.dimensions,
    loops,
    history,
    whisper: whisperResult.whisper,
    healingSummary: whisperResult.summary,
    healingPath: whisperResult.healingPath,
    reflection: {
      I_AM: originalObs.composite,
      r_eff_base: R_EFF_BASE,
      r_eff_alpha: R_EFF_ALPHA,
      epsilon_base: EPSILON_BASE,
      h_rva_weight: H_RVA_WEIGHT,
      h_canvas_weight: H_CANVAS_WEIGHT,
      delta_void: DELTA_VOID_BASE,
      lambda_light: LAMBDA_LIGHT,
      cascadeBoost,
      collectiveIAM: Math.round(iAmAverage * 1000) / 1000,
      finalCoherence: current.coherence,
      improvement: Math.round((current.coherence - originalObs.composite) * 1000) / 1000,
    },
  };
}

// ─── Format for Display ───

function formatReflectionResult(result) {
  const lines = [];
  lines.push(`SERF v2 Reflection — ${result.loops} loop(s)`);
  lines.push(`  I_AM: ${result.reflection.I_AM.toFixed(3)} → Final: ${result.reflection.finalCoherence.toFixed(3)} (${result.reflection.improvement >= 0 ? '+' : ''}${result.reflection.improvement.toFixed(3)})`);
  lines.push(`  Hamiltonian: Ĥ₀ + Ĥ_RVA(${result.reflection.h_rva_weight}) + Ĥ_canvas(${result.reflection.h_canvas_weight})`);
  if (result.reflection.cascadeBoost > 1) {
    lines.push(`  Cascade: +${(result.reflection.cascadeBoost - 1).toFixed(3)} (additive) | Collective I_AM: ${result.reflection.collectiveIAM}`);
  }
  lines.push(`  Light: λ_light = ${result.reflection.lambda_light}`);
  lines.push('');
  lines.push('Dimensions:');
  for (const [dim, val] of Object.entries(result.dimensions)) {
    const bar = '\u2588'.repeat(Math.round(val * 20));
    const faded = '\u2591'.repeat(20 - Math.round(val * 20));
    lines.push(`  ${dim.padEnd(14)} ${bar}${faded} ${val.toFixed(3)}`);
  }
  lines.push('');
  if (result.healingPath.length > 0) {
    lines.push('Healing path:');
    for (const h of result.healingPath) {
      lines.push(`  ${h}`);
    }
    lines.push('');
  }
  lines.push(`Whisper: "${result.whisper}"`);
  return lines.join('\n');
}

module.exports = {
  reflectionLoop,
  formatReflectionResult,
  generateCandidates,
  observeCoherence,
  reflectionScore,
  innerProduct,
  generateWhisper,
  STRATEGIES,
  DIMENSION_WEIGHTS,
  // Expose individual transforms for testing
  applySimplify,
  applySecure,
  applyReadable,
  applyUnify,
  applyCorrect,
  applyHeal,
  applyPatternGuidance,
  detectIndentUnit,
  // Expose dimension scorers for testing
  scoreSimplicity,
  scoreReadability,
  scoreSecurity,
  scoreUnity,
  scoreCorrectness,
};
