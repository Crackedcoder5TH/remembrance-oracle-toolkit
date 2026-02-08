/**
 * Infinite Reflection Loop — SERF Engine
 *
 * Self-Evolving Recursive Refinement Function:
 *
 *   SERF(n+1) = I_AM + r_eff * Re[ projection / (|<n+1|n>|² + ε) ] + δ_canvas * exploration
 *
 * Where:
 *   I_AM        = Base coherency identity score (Principle 1: declared purpose)
 *   r_eff       = Effective refinement rate (how aggressively to improve)
 *   <n+1|n>     = Overlap/similarity between current and previous iteration
 *   Ô           = Observation operator (multi-dimensional coherence scorer)
 *   projection  = Ô|n+1><n+1|n> - <n+1|Ô|n>|n+1>  (novel improvement projection)
 *   ε           = Stability constant (prevents division by zero / collapse)
 *   δ_canvas    = Creative exploration bonus (rewards diverse transformations)
 *
 * Process:
 *   1. Generate 5 candidate fixes/refactors (one per strategy)
 *   2. Score each on coherence (0-1): simplicity, readability, security, unity, correctness
 *   3. Select highest-coherence version via SERF formula
 *   4. Reflect again: repeat on the winner, up to 3 loops or until coherence > 0.9
 *   5. Return final healed code + whisper from the healed future
 */

const { computeCoherencyScore, detectLanguage } = require('./coherency');
const { covenantCheck } = require('./covenant');

// ─── SERF Constants ───

const EPSILON_BASE = 1e-6;            // Base stability constant
const R_EFF_BASE = 0.35;              // Base refinement rate
const R_EFF_ALPHA = 0.8;              // Retrocausal pull strength (how much harder to pull when far)
const DELTA_CANVAS = 0.12;            // Exploration bonus weight
const DELTA_VOID_BASE = 0.08;         // Void replenishment — gain from nothingness
const MAX_LOOPS = 3;                  // Maximum reflection iterations
const TARGET_COHERENCE = 0.9;         // Stop when exceeded

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
    const singles = (result.match(/'/g) || []).length;
    const doubles = (result.match(/"/g) || []).length;
    if (singles > doubles) {
      // Prefer single quotes — convert double to single (not inside template literals)
      result = result.replace(/"([^"\\]*(?:\\.[^"\\]*)*)"/g, (match, content) => {
        if (content.includes("'")) return match; // Don't convert if contains single quotes
        return `'${content}'`;
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
  // Penalize excessive nesting
  let maxNesting = 0;
  let currentNesting = 0;
  for (const ch of code) {
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
  // Penalize excessive line count relative to content
  if (lines.length > 0 && totalChars / lines.length < 10) score -= 0.1; // Mostly empty
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
  const loopVars = (code.match(/\bfor\s*\(\s*(let|var|const)?\s*[ijk]\b/g) || []).length;
  const badVars = singleCharVars - loopVars;
  if (badVars > 0) score -= badVars * 0.05;
  // Reward presence of comments proportional to code
  const commentLines = lines.filter(l => l.trim().startsWith('//') || l.trim().startsWith('#') || l.trim().startsWith('*')).length;
  const codeLines = lines.filter(l => l.trim() && !l.trim().startsWith('//') && !l.trim().startsWith('#')).length;
  if (codeLines > 10 && commentLines === 0) score -= 0.05;
  return Math.max(0, Math.min(1, score));
}

function scoreSecurity(code, metadata) {
  const covenant = covenantCheck(code, metadata);
  if (!covenant.sealed) return 0;
  let score = 1.0;
  // Additional security heuristics beyond covenant
  if (/\beval\s*\(/i.test(code)) score -= 0.3;
  if (/\bvar\b/.test(code)) score -= 0.05;
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
  // Check for TODO/FIXME markers
  const todos = (code.match(/\b(TODO|FIXME|HACK|XXX)\b/g) || []).length;
  score -= todos * 0.1;
  // Check for empty catch blocks (with or without error binding)
  if (/catch\s*(?:\([^)]*\))?\s*\{\s*\}/.test(code)) score -= 0.1;
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

// ─── SERF Scoring Formula ───

/**
 * Compute code similarity (the inner product <n+1|n>)
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
 * Adaptive SERF scoring with retrocausal pull, void replenishment, and cascade awareness.
 *
 * Core: I_AM + r_eff * Re[projection / (|overlap|² + ε)] + δ_canvas * exploration + δ_void * void_gain
 *
 * Adaptive behaviors:
 *   r_eff scales UP when far from target (retrocausal pull — the healed state pulls harder)
 *   ε scales UP when far from target (stability — prevents blowup in uncharted territory)
 *   δ_void injects target-state gain when overlap is low (gain from nothingness)
 *   cascadeBoost multiplies the whole score by global library coherence (collective recognition)
 *
 * @param {object} candidate  — { code, coherence (Ô score) }
 * @param {object} previous   — { code, coherence }
 * @param {object} context    — optional { cascadeBoost, targetCoherence }
 * @returns {number} SERF score (0-1)
 */
function serfScore(candidate, previous, context = {}) {
  const { cascadeBoost = 1, targetCoherence = TARGET_COHERENCE } = context;

  // I_AM — base identity coherency of the candidate
  const I_AM = candidate.coherence;

  // <n+1|n> — overlap between candidate and previous
  const overlap = innerProduct(candidate.code, previous.code);
  const distance = 1 - overlap * overlap;  // How far from perfect overlap

  // Adaptive r_eff: pulls stronger when far from healed state
  // r_eff = r_0 * (1 + α * (1 - |overlap|²)⁴)
  const r_eff = R_EFF_BASE * (1 + R_EFF_ALPHA * Math.pow(distance, 4));

  // Adaptive epsilon: more stability when far from target
  // ε = ε_base * (1 + 10 * (1 - overlap²))
  const epsilon = EPSILON_BASE * (1 + 10 * distance);

  // Operator observation values
  const O_candidate = candidate.coherence;
  const O_previous = previous.coherence;

  // Projection: novel improvement the candidate brings
  const projection = O_candidate * overlap - O_previous * overlap * overlap;

  // Denominator with adaptive epsilon
  const denominator = overlap * overlap + epsilon;

  // Canvas exploration: rewards diversity (1 - overlap)
  const exploration = 1 - overlap;

  // Void replenishment: when overlap is low, inject target-state gain
  // δ_void * (1 - |overlap|²) — gain from nothingness
  const voidGain = DELTA_VOID_BASE * distance;

  // Combine all terms
  let serf = I_AM
    + r_eff * (projection / denominator)
    + DELTA_CANVAS * exploration
    + voidGain;

  // Cascade amplification: global coherence multiplier
  // When the library is collectively healthy, each refinement gets a boost
  serf *= cascadeBoost;

  return Math.max(0, Math.min(1, Math.round(serf * 1000) / 1000));
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
 * Run the SERF reflection loop on code.
 *
 * @param {string} code — Input code to refine
 * @param {object} options — { language, maxLoops, targetCoherence, description, tags }
 * @returns {{ code, coherence, dimensions, loops, history, whisper, serf }}
 */
function reflectionLoop(code, options = {}) {
  const {
    language,
    maxLoops = MAX_LOOPS,
    targetCoherence = TARGET_COHERENCE,
    description = '',
    tags = [],
    cascadeBoost = 1,     // Global coherence multiplier from recycler
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
    serfScore: null,
  }];

  const improvements = [];
  let loops = 0;

  // ─── Reflection Loop ───
  while (loops < maxLoops && current.coherence < targetCoherence) {
    loops++;

    // Step 1: Generate candidates (5 standard + optional pattern-guided)
    const candidates = generateCandidates(current.code, lang, { patternExamples });

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

    // Step 3: SERF-select the highest scoring candidate
    // Pass cascade context so global coherence amplifies selection
    const serfContext = { cascadeBoost, targetCoherence };
    const withSerf = scored.map(candidate => ({
      ...candidate,
      serf: serfScore(candidate, current, serfContext),
    }));

    // Sort by SERF score, break ties with raw coherence
    withSerf.sort((a, b) => b.serf - a.serf || b.coherence - a.coherence);
    const winner = withSerf[0];

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
      serfScore: winner.serf,
      changed: winner.changed,
      candidates: withSerf.map(c => ({
        strategy: c.strategy,
        coherence: c.coherence,
        serf: c.serf,
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
    serf: {
      I_AM: originalObs.composite,
      r_eff_base: R_EFF_BASE,
      r_eff_alpha: R_EFF_ALPHA,
      epsilon_base: EPSILON_BASE,
      delta_canvas: DELTA_CANVAS,
      delta_void: DELTA_VOID_BASE,
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
  lines.push(`SERF Reflection — ${result.loops} loop(s)`);
  lines.push(`  I_AM: ${result.serf.I_AM.toFixed(3)} → Final: ${result.serf.finalCoherence.toFixed(3)} (${result.serf.improvement >= 0 ? '+' : ''}${result.serf.improvement.toFixed(3)})`);
  if (result.serf.cascadeBoost > 1) {
    lines.push(`  Cascade: ${result.serf.cascadeBoost}x | Collective I_AM: ${result.serf.collectiveIAM}`);
  }
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
  serfScore,
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
