const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync, rmSync } = require('fs');
const { join } = require('path');
const { tmpdir } = require('os');

const {
  DEFAULT_WEIGHTS,
  scoreSyntaxValidity,
  scoreReadability,
  scoreNamingQuality,
  scoreSecurity,
  scoreTestProof,
  scoreHistoricalReliability,
  computeCoherence,
  computeRepoCoherence,
  formatCoherence,
} = require('../src/reflector/scoring');

function makeTempRepo(opts = {}) {
  const dir = join(tmpdir(), `coh-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(join(dir, 'src'), { recursive: true });
  mkdirSync(join(dir, 'tests'), { recursive: true });
  mkdirSync(join(dir, '.remembrance'), { recursive: true });

  // Source file
  writeFileSync(join(dir, 'src', 'utils.js'), opts.code || `
/**
 * Add two numbers.
 * @param {number} a
 * @param {number} b
 * @returns {number}
 */
function add(a, b) {
  return a + b;
}

/**
 * Multiply two numbers.
 */
function multiply(a, b) {
  return a * b;
}

module.exports = { add, multiply };
`, 'utf-8');

  // Test file
  if (opts.withTests !== false) {
    writeFileSync(join(dir, 'tests', 'utils.test.js'), opts.testCode || `
const assert = require('node:assert/strict');
const { add, multiply } = require('../src/utils');

assert.strictEqual(add(1, 2), 3);
assert.strictEqual(add(0, 0), 0);
assert.strictEqual(add(-1, 1), 0);
assert.strictEqual(multiply(2, 3), 6);
assert.strictEqual(multiply(0, 5), 0);
`, 'utf-8');
  }

  return dir;
}

// ─── Weights ───

describe('DEFAULT_WEIGHTS', () => {
  it('should have all 5 dimensions', () => {
    assert.ok(DEFAULT_WEIGHTS.syntaxValidity);
    assert.ok(DEFAULT_WEIGHTS.readability);
    assert.ok(DEFAULT_WEIGHTS.security);
    assert.ok(DEFAULT_WEIGHTS.testProof);
    assert.ok(DEFAULT_WEIGHTS.historicalReliability);
  });

  it('should sum to 1.0', () => {
    const sum = Object.values(DEFAULT_WEIGHTS).reduce((s, w) => s + w, 0);
    assert.ok(Math.abs(sum - 1.0) < 0.001, `Sum is ${sum}, expected 1.0`);
  });
});

// ─── Syntax Validity ───

describe('scoreSyntaxValidity', () => {
  it('should score well-formed code highly', () => {
    const code = 'function greet(name) { return "Hello " + name; }';
    const result = scoreSyntaxValidity(code, 'javascript');
    assert.ok(result.score >= 0.8);
    assert.ok(Array.isArray(result.details));
  });

  it('should penalize unbalanced braces', () => {
    const code = 'function greet(name) { return "Hello " + name;';
    const result = scoreSyntaxValidity(code, 'javascript');
    assert.ok(result.score < 0.8);
    assert.ok(result.details.some(d => d.includes('Unbalanced braces')));
  });

  it('should score empty code at 0', () => {
    const result = scoreSyntaxValidity('', 'javascript');
    assert.strictEqual(result.score, 0);
  });

  it('should check covenant compliance', () => {
    const result = scoreSyntaxValidity('function add(a, b) { return a + b; }', 'javascript');
    assert.ok(result.score > 0);
  });
});

// ─── Readability ───

describe('scoreReadability', () => {
  it('should return score with sub-dimensions', () => {
    const code = `
/**
 * Compute sum.
 */
function sum(arr) {
  let total = 0;
  for (const num of arr) {
    total += num;
  }
  return total;
}`;
    const result = scoreReadability(code, 'javascript');
    assert.ok(typeof result.score === 'number');
    assert.ok(result.score >= 0 && result.score <= 1);
    assert.ok(typeof result.commentScore === 'number');
    assert.ok(typeof result.nestingScore === 'number');
    assert.ok(typeof result.qualityScore === 'number');
    assert.ok(typeof result.namingScore === 'number');
  });

  it('should include comment, nesting, quality, and naming sub-scores', () => {
    const code = `
function add(a, b) { return a + b; }
function subtract(a, b) { return a - b; }
function multiply(a, b) { return a * b; }
function divide(a, b) { if (b === 0) throw new Error('div by zero'); return a / b; }
`;
    const result = scoreReadability(code, 'javascript');
    assert.ok(typeof result.commentScore === 'number');
    assert.ok(typeof result.nestingScore === 'number');
    assert.ok(typeof result.qualityScore === 'number');
    assert.ok(typeof result.namingScore === 'number');
    assert.ok(result.score >= 0 && result.score <= 1);
  });
});

// ─── Naming Quality ───

describe('scoreNamingQuality', () => {
  it('should score good names highly', () => {
    const code = 'function calculateTotal(items) { let subtotal = 0; return subtotal; }';
    const result = scoreNamingQuality(code, 'javascript');
    assert.ok(result >= 0.7);
  });

  it('should penalize single-letter names', () => {
    const code = 'function a(b) { const c = b + 1; return c; }';
    const result = scoreNamingQuality(code, 'javascript');
    assert.ok(result < 0.9);
  });

  it('should return neutral for empty code', () => {
    const result = scoreNamingQuality('', 'javascript');
    assert.ok(result >= 0.5);
  });
});

// ─── Security ───

describe('scoreSecurity', () => {
  it('should score clean code at 1.0', () => {
    const result = scoreSecurity('function add(a, b) { return a + b; }', 'javascript');
    assert.strictEqual(result.score, 1.0);
    assert.strictEqual(result.riskLevel, 'low');
  });

  it('should detect hardcoded secrets', () => {
    const result = scoreSecurity('const password = "superSecret123"', 'javascript');
    assert.ok(result.score < 1.0);
    assert.ok(result.findings.length > 0);
  });
});

// ─── Test Proof ───

describe('scoreTestProof', () => {
  it('should find test file and score', () => {
    const dir = makeTempRepo();
    const result = scoreTestProof(join(dir, 'src', 'utils.js'), dir);
    assert.ok(result.score > 0);
    assert.ok(result.testFile);
    assert.ok(result.assertions >= 1);
    rmSync(dir, { recursive: true });
  });

  it('should score 0 without test file', () => {
    const dir = makeTempRepo({ withTests: false });
    const result = scoreTestProof(join(dir, 'src', 'utils.js'), dir);
    assert.strictEqual(result.score, 0);
    assert.strictEqual(result.testFile, null);
    rmSync(dir, { recursive: true });
  });
});

// ─── Historical Reliability ───

describe('scoreHistoricalReliability', () => {
  it('should return neutral score with no history', () => {
    const dir = makeTempRepo();
    const result = scoreHistoricalReliability(join(dir, 'src', 'utils.js'), dir);
    assert.strictEqual(result.score, 0.7);
    assert.ok(result.details.some(d => d.includes('No run history')));
    rmSync(dir, { recursive: true });
  });

  it('should score high for files never healed', () => {
    const dir = makeTempRepo();
    const { saveJSON } = require('../src/reflector/scoring');
    saveJSON(join(dir, '.remembrance', 'reflector-history-v2.json'), {
      runs: [{ id: 'r1', changes: [] }, { id: 'r2', changes: [] }],
      version: 2,
    });
    const result = scoreHistoricalReliability(join(dir, 'src', 'utils.js'), dir);
    assert.strictEqual(result.score, 1.0);
    rmSync(dir, { recursive: true });
  });
});

// ─── Full Coherence ───

describe('computeCoherence', () => {
  it('should compute full coherence with all dimensions', () => {
    const dir = makeTempRepo();
    const result = computeCoherence(join(dir, 'src', 'utils.js'), { rootDir: dir });
    assert.ok(typeof result.score === 'number');
    assert.ok(result.score > 0 && result.score <= 1);
    assert.ok(result.dimensions.syntaxValidity);
    assert.ok(result.dimensions.readability);
    assert.ok(result.dimensions.security);
    assert.ok(result.dimensions.testProof);
    assert.ok(result.dimensions.historicalReliability);
    assert.ok(result.language);
    rmSync(dir, { recursive: true });
  });

  it('should return error for missing file', () => {
    const result = computeCoherence('/nonexistent/file.js');
    assert.ok(result.error);
    assert.strictEqual(result.score, 0);
  });
});

// ─── Repo Coherence ───

describe('computeRepoCoherence', () => {
  it('should compute repo-level coherence', () => {
    const dir = makeTempRepo();
    const result = computeRepoCoherence(dir);
    assert.ok(result.totalFiles >= 1);
    assert.ok(typeof result.aggregate === 'number');
    assert.ok(result.dimensions);
    assert.ok(typeof result.dimensions.syntaxValidity === 'number');
    assert.ok(typeof result.dimensions.testProof === 'number');
    assert.ok(result.formula.includes('0.25'));
    assert.ok(result.formula.includes('test_proof'));
    rmSync(dir, { recursive: true });
  });
});

// ─── Formatting ───

describe('formatCoherence', () => {
  it('should format result as readable text', () => {
    const dir = makeTempRepo();
    const result = computeCoherence(join(dir, 'src', 'utils.js'), { rootDir: dir });
    const text = formatCoherence(result);
    assert.ok(text.includes('Coherence:'));
    assert.ok(text.includes('Score:'));
    assert.ok(text.includes('syntaxValidity'));
    assert.ok(text.includes('testProof'));
    rmSync(dir, { recursive: true });
  });
});

// ─── Exports ───

describe('Coherence Scorer — exports', () => {
  it('should export from index.js', () => {
    const index = require('../src/index');
    assert.strictEqual(typeof index.reflectorComputeCoherence, 'function');
    assert.strictEqual(typeof index.reflectorComputeRepoCoherence, 'function');
    assert.strictEqual(typeof index.reflectorFormatCoherence, 'function');
    assert.strictEqual(typeof index.reflectorScoreSyntaxValidity, 'function');
    assert.strictEqual(typeof index.reflectorScoreTestProof, 'function');
    assert.ok(index.reflectorCoherenceWeights);
    assert.ok(index.reflectorCoherenceWeights.testProof === 0.30);
  });
});

// ─── Reflector functions accessible (MCP consolidated) ───

describe('Coherence Scorer — reflector functions (MCP consolidated)', () => {
  it('computeCoherence and computeRepoCoherence are directly importable', () => {
    const scoring = require('../src/reflector/scoring');
    assert.strictEqual(typeof scoring.computeCoherence, 'function');
    assert.strictEqual(typeof scoring.computeRepoCoherence, 'function');
    assert.strictEqual(typeof scoring.formatCoherence, 'function');
    assert.strictEqual(typeof scoring.scoreSyntaxValidity, 'function');
    assert.strictEqual(typeof scoring.scoreTestProof, 'function');
  });

  it('MCP has 11 consolidated tools', () => {
    const { TOOLS } = require('../src/mcp/server');
    assert.equal(TOOLS.length, 11);
  });
});
