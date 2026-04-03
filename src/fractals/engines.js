/**
 * Fractal Math Engines — Pure mathematical implementations of 5 fractal systems.
 * @oracle-dense-code
 * @oracle-pattern-definitions
 *
 * Each fractal serves a specific role in the Oracle's information dynamics:
 *   1. Sierpinski Triangle  — Self-similar void insertion (verification, infinite space)
 *   2. Mandelbrot Set       — Infinite boundary resonance (retrocausal pull, depth)
 *   3. Barnsley Fern        — Branching growth cascade (exponential propagation)
 *   4. Julia Set             — Parameter-tuned boundary stability (coherence tuning)
 *   5. Lyapunov Fractal     — Chaos-to-order navigation (stability detection)
 */

// ─── 1. Sierpinski Triangle ───

/**
 * Sierpinski Triangle — Self-Similar Void Insertion.
 * At level n, the number of filled triangles is 3^n.
 * The filled area ratio is (3/4)^n — approaching zero as depth increases.
 *
 * @param {number} level — Recursion depth (0 = solid triangle)
 * @returns {{ triangles: number, filledRatio: number, voidRatio: number, vertices: Array }}
 */
function sierpinski(level) {
  const n = Math.max(0, Math.floor(level));
  const triangles = Math.pow(3, n);
  const filledRatio = Math.pow(3 / 4, n);
  const voidRatio = 1 - filledRatio;

  // Generate vertex coordinates for visualization at given level
  const vertices = _sierpinskiVertices(n, [0, 0], [1, 0], [0.5, Math.sqrt(3) / 2]);

  return { level: n, triangles, filledRatio, voidRatio, vertices };
}

function _sierpinskiVertices(level, a, b, c) {
  if (level === 0) return [[a, b, c]];
  const ab = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const bc = [(b[0] + c[0]) / 2, (b[1] + c[1]) / 2];
  const ac = [(a[0] + c[0]) / 2, (a[1] + c[1]) / 2];
  return [
    ..._sierpinskiVertices(level - 1, a, ab, ac),
    ..._sierpinskiVertices(level - 1, ab, b, bc),
    ..._sierpinskiVertices(level - 1, ac, bc, c),
    // Central triangle is removed (the void)
  ];
}

/**
 * Sierpinski density — measures how much "void" exists at a given depth.
 * Used by the oracle to measure structural void patterns in code.
 *
 * @param {number} level
 * @returns {number} Void ratio (0 = solid, approaches 1 at infinity)
 */
function sierpinskiDensity(level) {
  return 1 - Math.pow(3 / 4, Math.max(0, level));
}

// ─── 2. Mandelbrot Set ───

/**
 * Mandelbrot Set — Infinite Boundary Resonance.
 * z_{n+1} = z_n^2 + c,  z_0 = 0
 * A point c belongs to the set if |z_n| never exceeds 2.
 *
 * @param {number} cr — Real part of c
 * @param {number} ci — Imaginary part of c
 * @param {number} [maxIter=100] — Maximum iterations
 * @returns {{ inSet: boolean, iterations: number, magnitude: number, escapeSpeed: number }}
 */
function mandelbrot(cr, ci, maxIter = 100) {
  let zr = 0, zi = 0;
  let zr2 = 0, zi2 = 0;
  let n = 0;

  while (n < maxIter && zr2 + zi2 <= 4) {
    zi = 2 * zr * zi + ci;
    zr = zr2 - zi2 + cr;
    zr2 = zr * zr;
    zi2 = zi * zi;
    n++;
  }

  const magnitude = Math.sqrt(zr2 + zi2);
  const inSet = n === maxIter;
  // Smooth escape speed: normalized iteration count
  const escapeSpeed = inSet ? 0 : (n - Math.log2(Math.log2(magnitude))) / maxIter;

  return { inSet, iterations: n, magnitude, escapeSpeed: Math.max(0, Math.min(1, escapeSpeed)) };
}

/**
 * Mandelbrot boundary distance — measures proximity to the set boundary.
 * Points near the boundary have the richest structure (infinite detail).
 *
 * @param {number} cr
 * @param {number} ci
 * @param {number} [maxIter=100]
 * @returns {number} Boundary resonance (0 = deep interior/exterior, 1 = at boundary)
 */
function mandelbrotResonance(cr, ci, maxIter = 100) {
  const result = mandelbrot(cr, ci, maxIter);
  if (result.inSet) {
    // Interior points: resonance based on how close to escaping
    return result.magnitude / 2;
  }
  // Exterior points: resonance based on how slowly they escaped
  return 1 - result.escapeSpeed;
}

// ─── 3. Barnsley Fern ───

/**
 * Barnsley Fern — Branching Growth Cascade.
 * 4 affine transformations with probabilistic selection.
 *
 * @param {number} iterations — Number of points to generate
 * @returns {{ points: Array<[number, number]>, bounds: { minX, maxX, minY, maxY } }}
 */
function barnsleyFern(iterations = 10000) {
  let x = 0, y = 0;
  const points = [];
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

  for (let i = 0; i < iterations; i++) {
    const r = Math.random();
    let nx, ny;

    if (r < 0.01) {
      // Stem (probability 0.01)
      nx = 0;
      ny = 0.16 * y;
    } else if (r < 0.86) {
      // Main growth (probability 0.85) — the dominant self-similar branch
      nx = 0.85 * x + 0.04 * y;
      ny = -0.04 * x + 0.85 * y + 1.6;
    } else if (r < 0.93) {
      // Left branch (probability 0.07)
      nx = 0.20 * x - 0.26 * y;
      ny = 0.23 * x + 0.22 * y + 1.6;
    } else {
      // Right branch (probability 0.07)
      nx = -0.15 * x + 0.28 * y;
      ny = 0.26 * x + 0.24 * y + 0.44;
    }

    x = nx;
    y = ny;
    points.push([x, y]);
    if (x < minX) minX = x;
    if (x > maxX) maxX = x;
    if (y < minY) minY = y;
    if (y > maxY) maxY = y;
  }

  return { points, bounds: { minX, maxX, minY, maxY } };
}

/**
 * Barnsley growth rate — measures cascade amplification at each iteration.
 * The 0.85 probability transform dominates, creating exponential self-similar growth.
 *
 * @param {number} iterations
 * @returns {number} Growth factor (ratio of spread at iteration N vs initial)
 */
function barnsleyGrowthRate(iterations) {
  // The dominant transform scales by 0.85 per step
  // Growth cascade: the fern reaches ~10x initial size after ~15 iterations
  const dominantScale = 0.85;
  const effectiveGrowth = 1 / (1 - dominantScale); // Fixed point: ~6.67x
  const approachRate = 1 - Math.pow(dominantScale, iterations);
  return effectiveGrowth * approachRate;
}

// ─── 4. Julia Set ───

/**
 * Julia Set — Parameter-Tuned Boundary Stability.
 * z_{n+1} = z_n^2 + c, where c is fixed and z_0 varies.
 *
 * @param {number} zr — Real part of starting point z_0
 * @param {number} zi — Imaginary part of starting point z_0
 * @param {number} cr — Real part of c (fixed parameter)
 * @param {number} ci — Imaginary part of c (fixed parameter)
 * @param {number} [maxIter=100] — Maximum iterations
 * @returns {{ inSet: boolean, iterations: number, stability: number }}
 */
function julia(zr, zi, cr, ci, maxIter = 100) {
  let r = zr, im = zi;
  let r2 = r * r, im2 = im * im;
  let n = 0;

  while (n < maxIter && r2 + im2 <= 4) {
    im = 2 * r * im + ci;
    r = r2 - im2 + cr;
    r2 = r * r;
    im2 = im * im;
    n++;
  }

  const magnitude = Math.sqrt(r2 + im2);
  const inSet = n === maxIter;
  // Stability: how deeply bound the point is (1 = maximally stable, 0 = immediate escape)
  const stability = inSet ? 1.0 : n / maxIter;

  return { inSet, iterations: n, magnitude, stability };
}

/**
 * Julia stability map — scans a region and returns average stability.
 * Used to find optimal c parameters for maximum boundary complexity.
 *
 * @param {number} cr — Real part of c
 * @param {number} ci — Imaginary part of c
 * @param {number} [resolution=20] — Grid resolution
 * @param {number} [maxIter=50]
 * @returns {{ avgStability: number, boundaryDensity: number, connectedRatio: number }}
 */
function juliaStabilityMap(cr, ci, resolution = 20, maxIter = 50) {
  let totalStability = 0;
  let boundaryCount = 0;
  let connectedCount = 0;
  const total = resolution * resolution;

  for (let i = 0; i < resolution; i++) {
    for (let j = 0; j < resolution; j++) {
      const zr = -2 + 4 * i / (resolution - 1);
      const zi = -2 + 4 * j / (resolution - 1);
      const result = julia(zr, zi, cr, ci, maxIter);
      totalStability += result.stability;
      if (result.inSet) connectedCount++;
      // Boundary = points that escape slowly (near the edge)
      if (!result.inSet && result.stability > 0.3) boundaryCount++;
    }
  }

  return {
    avgStability: totalStability / total,
    boundaryDensity: boundaryCount / total,
    connectedRatio: connectedCount / total,
  };
}

// ─── 5. Lyapunov Fractal ───

/**
 * Lyapunov Exponent — Chaos-to-Order Navigation.
 * Uses the logistic map: x_{n+1} = r * x_n * (1 - x_n)
 * Lambda = (1/N) * sum(ln|r * (1 - 2*x_n)|)
 *
 * Positive lambda = chaotic, negative lambda = ordered.
 *
 * @param {number} r — Growth rate parameter (meaningful range: [0, 4])
 * @param {number} [iterations=200] — Total iterations
 * @param {number} [warmup=100] — Warmup iterations (discard transients)
 * @returns {{ exponent: number, isOrdered: boolean, isChaotic: boolean, stability: number }}
 */
function lyapunov(r, iterations = 200, warmup = 100) {
  let x = 0.5; // Initial condition (avoid 0 and 1)
  let lambda = 0;
  let count = 0;

  // Warmup: let transients die
  for (let i = 0; i < warmup; i++) {
    x = r * x * (1 - x);
    if (x <= 0 || x >= 1 || !isFinite(x)) { x = 0.5; }
  }

  // Measure
  for (let i = 0; i < iterations; i++) {
    const derivative = Math.abs(r * (1 - 2 * x));
    if (derivative > 0 && isFinite(derivative)) {
      lambda += Math.log(derivative);
      count++;
    }
    x = r * x * (1 - x);
    if (x <= 0 || x >= 1 || !isFinite(x)) { x = 0.5; }
  }

  const exponent = count > 0 ? lambda / count : 0;
  const isOrdered = exponent < 0;
  const isChaotic = exponent > 0;
  // Stability: how far into order territory (clamped to [0, 1])
  const stability = Math.max(0, Math.min(1, 1 - exponent));

  return { exponent, isOrdered, isChaotic, stability };
}

/**
 * Lyapunov sequence — evaluates a sequence of r-values (e.g., "AABB" with rA, rB).
 * This creates the classic Lyapunov fractal patterns.
 *
 * @param {string} sequence — Pattern like "AB", "AABB", etc.
 * @param {number} rA — r-value for 'A'
 * @param {number} rB — r-value for 'B'
 * @param {number} [iterations=200]
 * @param {number} [warmup=100]
 * @returns {{ exponent: number, isOrdered: boolean, isChaotic: boolean }}
 */
function lyapunovSequence(sequence, rA, rB, iterations = 200, warmup = 100) {
  const seq = sequence.toUpperCase();
  let x = 0.5;
  let lambda = 0;
  let count = 0;
  const seqLen = seq.length;

  for (let i = 0; i < warmup; i++) {
    const r = seq[i % seqLen] === 'A' ? rA : rB;
    x = r * x * (1 - x);
    if (x <= 0 || x >= 1 || !isFinite(x)) { x = 0.5; }
  }

  for (let i = 0; i < iterations; i++) {
    const r = seq[i % seqLen] === 'A' ? rA : rB;
    const derivative = Math.abs(r * (1 - 2 * x));
    if (derivative > 0 && isFinite(derivative)) {
      lambda += Math.log(derivative);
      count++;
    }
    x = r * x * (1 - x);
    if (x <= 0 || x >= 1 || !isFinite(x)) { x = 0.5; }
  }

  const exponent = count > 0 ? lambda / count : 0;
  return { exponent, isOrdered: exponent < 0, isChaotic: exponent > 0 };
}

// ─── Fractal Template Registry ───

const FRACTAL_TEMPLATES = {
  sierpinski: {
    name: 'Sierpinski Triangle',
    role: 'Self-similar void insertion — verification layers, infinite space within unity',
    engine: sierpinski,
    measure: sierpinskiDensity,
    codeSignals: ['recursive-structure', 'subdivision', 'void-insertion', 'self-similar-nesting'],
  },
  mandelbrot: {
    name: 'Mandelbrot Set',
    role: 'Infinite boundary resonance — depth, retrocausal pull, boundary stability',
    engine: mandelbrot,
    measure: mandelbrotResonance,
    codeSignals: ['iterative-convergence', 'boundary-detection', 'escape-analysis', 'depth-first'],
  },
  barnsley: {
    name: 'Barnsley Fern',
    role: 'Branching growth cascade — exponential propagation, natural expansion',
    engine: barnsleyFern,
    measure: barnsleyGrowthRate,
    codeSignals: ['probabilistic-branching', 'cascade-amplification', 'weighted-dispatch', 'growth-pattern'],
  },
  julia: {
    name: 'Julia Set',
    role: 'Parameter-tuned boundary stability — coherence under varying conditions',
    engine: julia,
    measure: juliaStabilityMap,
    codeSignals: ['parameter-sensitivity', 'stability-tuning', 'basin-navigation', 'fixed-point'],
  },
  lyapunov: {
    name: 'Lyapunov Fractal',
    role: 'Chaos-to-order navigation — stability boundaries, coherence locking',
    engine: lyapunov,
    measure: lyapunovSequence,
    codeSignals: ['convergence-detection', 'stability-analysis', 'chaos-order-boundary', 'threshold-locking'],
  },
};

module.exports = {
  // Individual engines
  sierpinski,
  sierpinskiDensity,
  mandelbrot,
  mandelbrotResonance,
  barnsleyFern,
  barnsleyGrowthRate,
  julia,
  juliaStabilityMap,
  lyapunov,
  lyapunovSequence,
  // Template registry
  FRACTAL_TEMPLATES,
};
