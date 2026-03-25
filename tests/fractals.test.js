const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  // Engines
  sierpinski, sierpinskiDensity,
  mandelbrot, mandelbrotResonance,
  barnsleyFern, barnsleyGrowthRate,
  julia, juliaStabilityMap,
  lyapunov, lyapunovSequence,
  FRACTAL_TEMPLATES,
  // Alignment
  computeFractalAlignment, selectResonantFractal,
  scoreSelfSimilarity, scoreBoundaryDepth, scoreGrowthCascade,
  scoreStabilityTuning, scoreOrderNavigation,
  FRACTAL_WEIGHTS,
} = require('../src/fractals');

// ─── Sierpinski Triangle ───

describe('Sierpinski Triangle', () => {
  it('level 0 is a single solid triangle', () => {
    const result = sierpinski(0);
    assert.equal(result.triangles, 1);
    assert.equal(result.filledRatio, 1);
    assert.equal(result.voidRatio, 0);
    assert.equal(result.vertices.length, 1);
  });

  it('level 1 has 3 triangles', () => {
    const result = sierpinski(1);
    assert.equal(result.triangles, 3);
    assert.equal(result.vertices.length, 3);
  });

  it('level n has 3^n triangles', () => {
    for (let n = 0; n <= 6; n++) {
      assert.equal(sierpinski(n).triangles, Math.pow(3, n));
    }
  });

  it('void ratio increases with level', () => {
    const v2 = sierpinski(2).voidRatio;
    const v5 = sierpinski(5).voidRatio;
    assert.ok(v5 > v2, `level 5 void (${v5}) should exceed level 2 void (${v2})`);
  });

  it('sierpinskiDensity returns correct void ratio', () => {
    assert.equal(sierpinskiDensity(0), 0);
    assert.ok(sierpinskiDensity(10) > 0.9);
  });
});

// ─── Mandelbrot Set ───

describe('Mandelbrot Set', () => {
  it('origin (0,0) is in the set', () => {
    const result = mandelbrot(0, 0);
    assert.ok(result.inSet);
    assert.equal(result.escapeSpeed, 0);
  });

  it('(-1, 0) is in the set', () => {
    assert.ok(mandelbrot(-1, 0).inSet);
  });

  it('(2, 2) escapes immediately', () => {
    const result = mandelbrot(2, 2, 100);
    assert.ok(!result.inSet);
    assert.ok(result.iterations < 10);
  });

  it('escape speed is between 0 and 1', () => {
    const result = mandelbrot(0.5, 0.5);
    assert.ok(result.escapeSpeed >= 0 && result.escapeSpeed <= 1);
  });

  it('mandelbrotResonance returns 0-1', () => {
    const r = mandelbrotResonance(-0.75, 0.1);
    assert.ok(r >= 0 && r <= 1);
  });
});

// ─── Barnsley Fern ───

describe('Barnsley Fern', () => {
  it('generates requested number of points', () => {
    const result = barnsleyFern(100);
    assert.equal(result.points.length, 100);
  });

  it('points have valid coordinates', () => {
    const result = barnsleyFern(50);
    for (const [x, y] of result.points) {
      assert.ok(isFinite(x) && isFinite(y));
    }
  });

  it('bounds are computed correctly', () => {
    const result = barnsleyFern(1000);
    assert.ok(result.bounds.minX <= result.bounds.maxX);
    assert.ok(result.bounds.minY <= result.bounds.maxY);
  });

  it('barnsleyGrowthRate increases with iterations', () => {
    const g5 = barnsleyGrowthRate(5);
    const g50 = barnsleyGrowthRate(50);
    assert.ok(g50 > g5);
  });
});

// ─── Julia Set ───

describe('Julia Set', () => {
  it('origin with c=0 stays in set', () => {
    const result = julia(0, 0, 0, 0);
    assert.ok(result.inSet);
    assert.equal(result.stability, 1.0);
  });

  it('far points escape', () => {
    const result = julia(10, 10, -0.7, 0.27);
    assert.ok(!result.inSet);
  });

  it('stability is between 0 and 1', () => {
    const result = julia(0.5, 0.5, -0.7, 0.27015);
    assert.ok(result.stability >= 0 && result.stability <= 1);
  });

  it('juliaStabilityMap returns valid metrics', () => {
    const result = juliaStabilityMap(-0.7, 0.27015, 10);
    assert.ok(result.avgStability >= 0 && result.avgStability <= 1);
    assert.ok(result.boundaryDensity >= 0 && result.boundaryDensity <= 1);
    assert.ok(result.connectedRatio >= 0 && result.connectedRatio <= 1);
  });
});

// ─── Lyapunov Fractal ───

describe('Lyapunov Fractal', () => {
  it('r=2.5 is ordered (period-1)', () => {
    const result = lyapunov(2.5);
    assert.ok(result.isOrdered, `r=2.5 should be ordered, got exponent=${result.exponent}`);
  });

  it('r=3.9 is chaotic', () => {
    const result = lyapunov(3.9);
    assert.ok(result.isChaotic, `r=3.9 should be chaotic, got exponent=${result.exponent}`);
  });

  it('stability is between 0 and 1', () => {
    const result = lyapunov(3.2);
    assert.ok(result.stability >= 0 && result.stability <= 1);
  });

  it('lyapunovSequence computes for AB pattern', () => {
    const result = lyapunovSequence('AB', 3.5, 3.8);
    assert.ok(typeof result.exponent === 'number');
    assert.ok(typeof result.isOrdered === 'boolean');
    assert.ok(typeof result.isChaotic === 'boolean');
    assert.ok(result.isOrdered !== result.isChaotic || result.exponent === 0);
  });
});

// ─── Fractal Template Registry ───

describe('Fractal Template Registry', () => {
  it('has all 5 fractals', () => {
    const keys = Object.keys(FRACTAL_TEMPLATES);
    assert.ok(keys.includes('sierpinski'));
    assert.ok(keys.includes('mandelbrot'));
    assert.ok(keys.includes('barnsley'));
    assert.ok(keys.includes('julia'));
    assert.ok(keys.includes('lyapunov'));
  });

  it('each template has required fields', () => {
    for (const [key, tmpl] of Object.entries(FRACTAL_TEMPLATES)) {
      assert.ok(tmpl.name, `${key} missing name`);
      assert.ok(tmpl.role, `${key} missing role`);
      assert.ok(typeof tmpl.engine === 'function', `${key} missing engine function`);
      assert.ok(typeof tmpl.measure === 'function', `${key} missing measure function`);
      assert.ok(Array.isArray(tmpl.codeSignals), `${key} missing codeSignals`);
      assert.ok(tmpl.codeSignals.length > 0, `${key} has empty codeSignals`);
    }
  });
});

// ─── Fractal Alignment Scoring ───

describe('Fractal Alignment Scoring', () => {
  it('FRACTAL_WEIGHTS sum to 1.0', () => {
    const sum = Object.values(FRACTAL_WEIGHTS).reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001, `Weights sum to ${sum}, expected 1.0`);
  });

  it('handles null/empty code gracefully', () => {
    const result = computeFractalAlignment('');
    assert.equal(result.composite, 0);
    assert.equal(result.dominantFractal, 'none');
  });

  it('analyzes real code', () => {
    const code = `
function fibonacci(n) {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
}`;
    const result = computeFractalAlignment(code);
    assert.ok(result.composite > 0, 'Composite should be positive');
    assert.ok(result.composite <= 1, 'Composite should be <= 1');
    assert.ok(result.dominantFractal !== 'none');
    assert.ok(result.dimensions.selfSimilarity >= 0);
    assert.ok(result.dimensions.boundaryDepth >= 0);
    assert.ok(result.dimensions.growthCascade >= 0);
    assert.ok(result.dimensions.stabilityTuning >= 0);
    assert.ok(result.dimensions.orderNavigation >= 0);
  });

  it('recursive code scores high on selfSimilarity', () => {
    const recursive = `
function traverse(node) {
  if (!node) return;
  process(node.value);
  traverse(node.left);
  traverse(node.right);
}`;
    const flat = `const x = 1; const y = 2; const z = x + y;`;
    const recResult = scoreSelfSimilarity(recursive);
    const flatResult = scoreSelfSimilarity(flat);
    assert.ok(recResult >= flatResult, `Recursive (${recResult}) should score >= flat (${flatResult})`);
  });

  it('iterative code scores high on boundaryDepth', () => {
    const iterative = `
function binarySearch(arr, target) {
  let lo = 0, hi = arr.length - 1;
  while (lo <= hi) {
    const mid = Math.floor((lo + hi) / 2);
    if (arr[mid] === target) return mid;
    if (arr[mid] < target) lo = mid + 1;
    else hi = mid - 1;
  }
  return -1;
}`;
    const score = scoreBoundaryDepth(iterative);
    assert.ok(score > 0.5, `Iterative convergence code should score > 0.5, got ${score}`);
  });

  it('branching code scores on growthCascade', () => {
    const branching = `
function route(action) {
  if (action === 'create') return handleCreate();
  else if (action === 'update') return handleUpdate();
  else if (action === 'delete') return handleDelete();
  else return handleDefault();
}`;
    const score = scoreGrowthCascade(branching);
    assert.ok(score >= 0.5, `Branching code should score >= 0.5, got ${score}`);
  });

  it('code with guards scores on stabilityTuning', () => {
    const guarded = `
function safe(value, options = {}) {
  if (typeof value !== 'number') return 0;
  const clamped = Math.max(0, Math.min(1, value));
  const epsilon = options.epsilon ?? 1e-6;
  return Math.abs(clamped) < epsilon ? 0 : clamped;
}`;
    const score = scoreStabilityTuning(guarded);
    assert.ok(score > 0.5, `Guarded code should score > 0.5, got ${score}`);
  });

  it('sorting code scores on orderNavigation', () => {
    const sorting = `
function normalize(values) {
  try {
    const sorted = values.sort((a, b) => a - b);
    const min = sorted[0];
    const max = sorted[sorted.length - 1];
    return sorted.map(v => (v - min) / (max - min));
  } catch (err) {
    throw new Error('Normalization failed');
  }
}`;
    const score = scoreOrderNavigation(sorting);
    assert.ok(score > 0.5, `Sorting/normalizing code should score > 0.5, got ${score}`);
  });
});

// ─── selectResonantFractal ───

describe('selectResonantFractal', () => {
  it('returns a valid fractal selection', () => {
    const code = `function add(a, b) { return a + b; }`;
    const result = selectResonantFractal(code);
    assert.ok(FRACTAL_TEMPLATES[result.fractal], `Unknown fractal: ${result.fractal}`);
    assert.ok(result.resonance >= 0 && result.resonance <= 1);
    assert.ok(result.reason.length > 0);
    assert.ok(result.template);
  });

  it('task description influences selection', () => {
    const code = `function process(data) { return data; }`;
    const result = selectResonantFractal(code, 'recursive subdivision depth-first traversal');
    // Should favor sierpinski or mandelbrot due to "recursive" and "depth"
    assert.ok(result.fractal);
    assert.ok(result.resonance > 0);
  });
});

// ─── Integration: Coherency scoring includes fractal ───

describe('Coherency integration', () => {
  it('computeCoherencyScore includes fractalAlignment', () => {
    const { computeCoherencyScore } = require('../src/core/coherency');
    const code = `function add(a, b) { return a + b; }`;
    const result = computeCoherencyScore(code, { language: 'javascript' });
    assert.ok('fractalAlignment' in result.breakdown, 'breakdown should include fractalAlignment');
    assert.ok(result.breakdown.fractalAlignment >= 0 && result.breakdown.fractalAlignment <= 1);
  });
});

// ─── Integration: SERF observeCoherence includes fractal ───

describe('SERF integration', () => {
  it('observeCoherence includes fractalAlignment dimension', () => {
    const { observeCoherence } = require('../src/core/reflection-scorers');
    const code = `function fibonacci(n) { if (n <= 1) return n; return fibonacci(n-1) + fibonacci(n-2); }`;
    const result = observeCoherence(code);
    assert.ok('fractalAlignment' in result.dimensions, 'dimensions should include fractalAlignment');
    assert.ok(result.dimensions.fractalAlignment >= 0 && result.dimensions.fractalAlignment <= 1);
    assert.ok(result.composite > 0);
  });
});
