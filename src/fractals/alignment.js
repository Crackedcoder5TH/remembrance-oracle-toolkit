/**
 * Fractal Alignment Scorer — Measures code's structural alignment with natural fractal patterns.
 * @oracle-dense-code
 * @oracle-pattern-definitions
 *
 * Analyzes code across 5 fractal dimensions and produces a composite alignment score (0-1):
 *   1. Self-Similarity  (Sierpinski)  — How much the code repeats its own structure at different scales
 *   2. Boundary Depth   (Mandelbrot)  — Iterative convergence patterns, boundary richness
 *   3. Growth Cascade   (Barnsley)    — Branching/dispatch patterns, probabilistic flow
 *   4. Stability Tuning (Julia)       — Parameter sensitivity, fixed-point patterns
 *   5. Order Navigation (Lyapunov)    — Chaos/order detection, convergence thresholds
 *
 * The composite score becomes the 6th dimension of coherency: Fractal Alignment (F).
 */

const { FRACTAL_TEMPLATES } = require('./engines');

// ─── Fractal Dimension Weights ───

const FRACTAL_WEIGHTS = {
  selfSimilarity: 0.25,    // Sierpinski — self-similar structure
  boundaryDepth: 0.20,     // Mandelbrot — iterative depth/convergence
  growthCascade: 0.20,     // Barnsley — branching/dispatch patterns
  stabilityTuning: 0.15,   // Julia — parameter sensitivity
  orderNavigation: 0.20,   // Lyapunov — chaos-to-order navigation
};

// ─── 1. Self-Similarity (Sierpinski) ───

/**
 * Measures structural self-similarity in code.
 * Looks for patterns that repeat at different scales:
 *   - Functions calling similar functions (recursive patterns)
 *   - Repeated structural motifs (if-else chains, similar loop bodies)
 *   - Nested structures that mirror parent structures
 *
 * @param {string} code
 * @returns {number} Self-similarity score (0-1)
 */
function scoreSelfSimilarity(code) {
  const lines = code.split('\n').filter(l => l.trim());
  if (lines.length < 3) return 0.5; // Too short to measure

  let score = 0.5; // Baseline

  // Detect recursive patterns (function calls matching function name)
  const fnNames = [];
  const fnPattern = /(?:function\s+(\w+)|(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s+)?(?:function|\())/g;
  let match;
  while ((match = fnPattern.exec(code)) !== null) {
    fnNames.push(match[1] || match[2]);
  }
  for (const name of fnNames) {
    const callPattern = new RegExp('\\b' + name + '\\s*\\(', 'g');
    const calls = (code.match(callPattern) || []).length;
    if (calls > 1) score += 0.1; // Recursive or heavily reused
  }

  // Detect repeated structural motifs (similar line patterns)
  const stripped = lines.map(l => l.trim().replace(/\w+/g, '_').replace(/\s+/g, ' '));
  const motifCounts = new Map();
  for (const s of stripped) {
    if (s.length > 5) motifCounts.set(s, (motifCounts.get(s) || 0) + 1);
  }
  const repeatedMotifs = [...motifCounts.values()].filter(c => c >= 2).length;
  const motifRatio = motifCounts.size > 0 ? repeatedMotifs / motifCounts.size : 0;
  score += motifRatio * 0.15;

  // Detect nested self-similarity (indentation patterns repeating)
  const indentLevels = lines.map(l => {
    const m = l.match(/^(\s*)/);
    return m ? m[1].length : 0;
  });
  const indentPattern = indentLevels.join(',');
  // Look for repeating subsequences in indent pattern
  const subLen = Math.min(5, Math.floor(indentLevels.length / 2));
  if (subLen >= 2) {
    const sub = indentLevels.slice(0, subLen).join(',');
    let repeats = 0;
    for (let i = subLen; i <= indentLevels.length - subLen; i++) {
      const candidate = indentLevels.slice(i, i + subLen).join(',');
      if (candidate === sub) repeats++;
    }
    if (repeats > 0) score += Math.min(0.15, repeats * 0.05);
  }

  // Sierpinski void insertion: functions with clear "empty center" (guard clauses that return early)
  const earlyReturns = (code.match(/^\s*(if\s*\(.*\)\s*return|if\s*\(.*\)\s*throw)/gm) || []).length;
  if (earlyReturns > 0 && lines.length > 5) {
    score += Math.min(0.1, earlyReturns * 0.03);
  }

  return Math.max(0, Math.min(1, score));
}

// ─── 2. Boundary Depth (Mandelbrot) ───

/**
 * Measures iterative convergence and boundary richness in code.
 * Looks for:
 *   - While/for loops with convergence conditions
 *   - Iterative refinement patterns (variables updated in loops)
 *   - Boundary detection (threshold checks, guard conditions)
 *
 * @param {string} code
 * @returns {number} Boundary depth score (0-1)
 */
function scoreBoundaryDepth(code) {
  let score = 0.5;

  // Iterative convergence: loops with break conditions
  const iterativeLoops = (code.match(/while\s*\([^)]*[<>=!]+[^)]*\)/g) || []).length;
  const forLoops = (code.match(/for\s*\(/g) || []).length;
  score += Math.min(0.15, (iterativeLoops + forLoops) * 0.03);

  // Variable convergence: variables updated toward a target
  const convergencePatterns = (code.match(/\b\w+\s*[+\-*\/]?=\s*.*\b\w+/g) || []).length;
  const lines = code.split('\n').filter(l => l.trim()).length;
  if (lines > 0) {
    const convergenceDensity = convergencePatterns / lines;
    score += Math.min(0.1, convergenceDensity * 0.1);
  }

  // Boundary detection: threshold comparisons
  const thresholdChecks = (code.match(/[<>=!]=?\s*[\d.]+|[\d.]+\s*[<>=!]=?/g) || []).length;
  score += Math.min(0.1, thresholdChecks * 0.02);

  // Deep nesting (fractal depth)
  let maxDepth = 0, currentDepth = 0;
  for (const ch of code) {
    if (ch === '{' || ch === '(') currentDepth++;
    if (ch === '}' || ch === ')') currentDepth--;
    maxDepth = Math.max(maxDepth, currentDepth);
  }
  // Moderate depth is fractal-aligned; too shallow or too deep isn't
  if (maxDepth >= 2 && maxDepth <= 6) score += 0.1;
  else if (maxDepth >= 7) score += 0.05;

  // Escape analysis patterns (return/break from nested contexts)
  const escapePatterns = (code.match(/\b(break|return|throw|continue)\b/g) || []).length;
  score += Math.min(0.1, escapePatterns * 0.02);

  return Math.max(0, Math.min(1, score));
}

// ─── 3. Growth Cascade (Barnsley) ───

/**
 * Measures branching and cascade patterns in code.
 * The Barnsley fern's power comes from probabilistic weighted dispatch —
 * code that branches into weighted paths mirrors this fractal.
 *
 * @param {string} code
 * @returns {number} Growth cascade score (0-1)
 */
function scoreGrowthCascade(code) {
  let score = 0.5;

  // Branching patterns: if-else chains, switch-case, ternary
  const ifElse = (code.match(/\bif\s*\(/g) || []).length;
  const switchCase = (code.match(/\bcase\s+/g) || []).length;
  const ternary = (code.match(/\?\s*[^?:]+\s*:/g) || []).length;
  const totalBranches = ifElse + switchCase + ternary;
  score += Math.min(0.15, totalBranches * 0.02);

  // Probabilistic/weighted dispatch (Math.random, probability, weight keywords)
  const probabilistic = (code.match(/\b(Math\.random|probability|weight|chance|random|odds)\b/gi) || []).length;
  score += Math.min(0.1, probabilistic * 0.05);

  // Cascade patterns: chained calls, promise chains, pipe
  const chains = (code.match(/\.\w+\([^)]*\)\s*\.\w+\(/g) || []).length;
  score += Math.min(0.1, chains * 0.03);

  // Array/Map/Reduce cascade
  const funcCascade = (code.match(/\.(map|filter|reduce|forEach|flatMap|some|every)\s*\(/g) || []).length;
  score += Math.min(0.1, funcCascade * 0.03);

  // Exponential growth signals (multiplication, power, scaling)
  const growth = (code.match(/\b(Math\.pow|Math\.exp|\*\*|\bscale\b|\bamplif)/g) || []).length;
  score += Math.min(0.1, growth * 0.03);

  return Math.max(0, Math.min(1, score));
}

// ─── 4. Stability Tuning (Julia) ───

/**
 * Measures parameter sensitivity and stability patterns in code.
 * Julia sets are defined by how changing parameters affects basin boundaries —
 * code with configurable parameters and stability checks mirrors this.
 *
 * @param {string} code
 * @returns {number} Stability tuning score (0-1)
 */
function scoreStabilityTuning(code) {
  let score = 0.5;

  // Configurable parameters (default values, options objects)
  const defaults = (code.match(/=\s*(?:options\.\w+|params\.\w+|config\.\w+|\w+\s*\|\||.*\?\?)/g) || []).length;
  score += Math.min(0.15, defaults * 0.03);

  // Clamping/bounding (Math.min, Math.max, clamp patterns)
  const clamping = (code.match(/\bMath\.(min|max)\b|\bclamp\b/g) || []).length;
  score += Math.min(0.1, clamping * 0.03);

  // Guard clauses (input validation, type checks)
  const guards = (code.match(/\b(typeof|instanceof|Array\.isArray|Number\.isNaN|isFinite)\b/g) || []).length;
  score += Math.min(0.1, guards * 0.03);

  // Tolerance/epsilon comparisons
  const tolerance = (code.match(/\b(epsilon|tolerance|threshold|delta|margin|EPSILON)\b/gi) || []).length;
  score += Math.min(0.1, tolerance * 0.05);

  // Fixed-point iteration (converging to stable values)
  const fixedPoint = (code.match(/\b(converge|stable|equilibrium|fixedPoint|steady)\b/gi) || []).length;
  score += Math.min(0.1, fixedPoint * 0.05);

  return Math.max(0, Math.min(1, score));
}

// ─── 5. Order Navigation (Lyapunov) ───

/**
 * Measures chaos-to-order navigation patterns in code.
 * The Lyapunov exponent detects the boundary between chaos and order —
 * code that sorts, normalizes, or imposes structure mirrors this.
 *
 * @param {string} code
 * @returns {number} Order navigation score (0-1)
 */
function scoreOrderNavigation(code) {
  let score = 0.5;

  // Sorting and ordering (bringing chaos to order)
  const sorting = (code.match(/\b(sort|order|rank|compare|priority|queue)\b/gi) || []).length;
  score += Math.min(0.1, sorting * 0.03);

  // Normalization (constraining to ranges)
  const normalization = (code.match(/\b(normalize|standardize|clamp|constrain|bound|limit|cap)\b/gi) || []).length;
  score += Math.min(0.1, normalization * 0.04);

  // Error handling structure (preventing chaos)
  const errorHandling = (code.match(/\b(try|catch|finally|throw|Error|assert)\b/g) || []).length;
  score += Math.min(0.1, errorHandling * 0.02);

  // State machines / finite automata (explicit order from chaos)
  const stateMachine = (code.match(/\b(state|status|phase|stage|mode|transition)\b/gi) || []).length;
  score += Math.min(0.1, stateMachine * 0.02);

  // Convergence detection (explicit convergence logic)
  const convergence = (code.match(/\b(converge|diverge|stabilize|oscillate|dampen|decay|approach)\b/gi) || []).length;
  score += Math.min(0.1, convergence * 0.05);

  // Logarithmic patterns (Lyapunov uses ln)
  const logarithmic = (code.match(/\b(Math\.log|Math\.log2|Math\.log10|ln|logarithm)\b/g) || []).length;
  score += Math.min(0.1, logarithmic * 0.05);

  return Math.max(0, Math.min(1, score));
}

// ─── Composite Fractal Alignment ───

/**
 * Compute the full fractal alignment score for a piece of code.
 * Returns individual dimension scores and a weighted composite.
 *
 * @param {string} code — Code to analyze
 * @param {Object} [metadata] — Optional metadata (language, tags, description)
 * @returns {{ dimensions: Object, composite: number, dominantFractal: string, resonanceMap: Object }}
 */
function computeFractalAlignment(code, metadata = {}) {
  if (!code || typeof code !== 'string') {
    return {
      dimensions: { selfSimilarity: 0, boundaryDepth: 0, growthCascade: 0, stabilityTuning: 0, orderNavigation: 0 },
      composite: 0,
      dominantFractal: 'none',
      resonanceMap: {},
    };
  }

  const dimensions = {
    selfSimilarity: scoreSelfSimilarity(code),
    boundaryDepth: scoreBoundaryDepth(code),
    growthCascade: scoreGrowthCascade(code),
    stabilityTuning: scoreStabilityTuning(code),
    orderNavigation: scoreOrderNavigation(code),
  };

  const composite = Object.entries(FRACTAL_WEIGHTS).reduce(
    (sum, [key, weight]) => sum + dimensions[key] * weight, 0
  );

  // Map dimensions to their fractal templates
  const resonanceMap = {
    sierpinski: dimensions.selfSimilarity,
    mandelbrot: dimensions.boundaryDepth,
    barnsley: dimensions.growthCascade,
    julia: dimensions.stabilityTuning,
    lyapunov: dimensions.orderNavigation,
  };

  // Find dominant fractal (highest-scoring dimension)
  let dominantFractal = 'sierpinski';
  let maxScore = 0;
  for (const [fractal, score] of Object.entries(resonanceMap)) {
    if (score > maxScore) {
      maxScore = score;
      dominantFractal = fractal;
    }
  }

  return {
    dimensions,
    composite: Math.round(composite * 1000) / 1000,
    dominantFractal,
    resonanceMap,
  };
}

/**
 * Select the most resonant fractal template for a given task/code.
 *
 * @param {string} code — Code to analyze
 * @param {string} [taskDescription] — What the code should do
 * @returns {{ fractal: string, template: Object, resonance: number, reason: string }}
 */
function selectResonantFractal(code, taskDescription = '') {
  const alignment = computeFractalAlignment(code);
  const template = FRACTAL_TEMPLATES[alignment.dominantFractal];

  // Cross-reference with task description for better matching
  const descLower = taskDescription.toLowerCase();
  let bestFractal = alignment.dominantFractal;
  let bestScore = alignment.resonanceMap[bestFractal];

  for (const [name, tmpl] of Object.entries(FRACTAL_TEMPLATES)) {
    const signalMatch = tmpl.codeSignals.filter(s => {
      const words = s.split('-');
      return words.some(w => descLower.includes(w));
    }).length;
    if (signalMatch > 0) {
      const boosted = (alignment.resonanceMap[name] || 0.5) + signalMatch * 0.1;
      if (boosted > bestScore) {
        bestScore = boosted;
        bestFractal = name;
      }
    }
  }

  const chosen = FRACTAL_TEMPLATES[bestFractal];
  return {
    fractal: bestFractal,
    template: chosen,
    resonance: Math.min(1, bestScore),
    reason: `Code resonates with ${chosen.name}: ${chosen.role}`,
  };
}

module.exports = {
  // Individual scorers
  scoreSelfSimilarity,
  scoreBoundaryDepth,
  scoreGrowthCascade,
  scoreStabilityTuning,
  scoreOrderNavigation,
  // Composite
  computeFractalAlignment,
  selectResonantFractal,
  // Weights
  FRACTAL_WEIGHTS,
};
