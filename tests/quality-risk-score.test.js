'use strict';

/**
 * Unit tests for the file-level bug-probability risk scorer.
 *
 * Covers:
 *   - Pure math (weights, clamping, classifyRisk thresholds)
 *   - Shape of the returned object
 *   - Edge cases (empty, unparseable, perfect, worst-case)
 *   - Real fixtures: known-clean patterns score LOW; known-buggy
 *     file from the corpus scores MEDIUM+
 */

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');

const {
  computeBugProbability,
  classifyRisk,
  CYCLOMATIC_CAP,
  DEFAULT_WEIGHTS,
  RISK_LEVELS,
} = require('../src/quality/risk-score');

describe('quality/risk-score — classifyRisk thresholds', () => {
  it('returns LOW below 0.30', () => {
    assert.equal(classifyRisk(0.0),  'LOW');
    assert.equal(classifyRisk(0.15), 'LOW');
    assert.equal(classifyRisk(0.29), 'LOW');
  });

  it('returns MEDIUM from 0.30 inclusive to 0.60 exclusive', () => {
    assert.equal(classifyRisk(0.30), 'MEDIUM');
    assert.equal(classifyRisk(0.45), 'MEDIUM');
    assert.equal(classifyRisk(0.599), 'MEDIUM');
  });

  it('returns HIGH at 0.60 and above', () => {
    assert.equal(classifyRisk(0.60),  'HIGH');
    assert.equal(classifyRisk(0.85),  'HIGH');
    assert.equal(classifyRisk(1.0),   'HIGH');
    // Out-of-range inputs clamp to [0, 1].
    assert.equal(classifyRisk(2.5),   'HIGH');
    assert.equal(classifyRisk(-0.5),  'LOW');
  });
});

describe('quality/risk-score — empty and malformed input', () => {
  it('returns a zero-risk result for empty code', () => {
    const r = computeBugProbability('');
    assert.equal(r.probability, 0);
    assert.equal(r.riskLevel, 'LOW');
    assert.equal(r.meta.skipped, 'empty input');
    assert.deepEqual(r.topFactors, []);
  });

  it('returns a zero-risk result for non-string input', () => {
    const r = computeBugProbability(null);
    assert.equal(r.probability, 0);
    assert.equal(r.riskLevel, 'LOW');
  });

  it('handles unparseable code without throwing', () => {
    // Not-quite-JS that the coherency scorer may fail on.
    const r = computeBugProbability('const x = { ; } [[[');
    assert.ok(typeof r.probability === 'number');
    assert.ok(r.riskLevel === 'LOW' || r.riskLevel === 'MEDIUM' || r.riskLevel === 'HIGH');
  });
});

describe('quality/risk-score — result shape', () => {
  it('returns probability, riskLevel, components, signals, topFactors, recommendations, meta', () => {
    const r = computeBugProbability('function f(x) { return x + 1; }', { filePath: 'f.js' });
    assert.equal(typeof r.probability, 'number');
    assert.ok(r.probability >= 0 && r.probability <= 1);
    assert.ok(['LOW', 'MEDIUM', 'HIGH'].includes(r.riskLevel));
    assert.ok(r.components);
    assert.equal(typeof r.components.coherencyRisk, 'number');
    assert.equal(typeof r.components.cyclomaticRisk, 'number');
    assert.ok(r.signals);
    assert.ok(Array.isArray(r.topFactors));
    assert.ok(Array.isArray(r.recommendations));
    assert.equal(r.meta.filePath, 'f.js');
    assert.equal(r.meta.version, '2.0');
  });

  it('records the weight vector used in meta for reproducibility', () => {
    const r = computeBugProbability('const x = 1;');
    assert.equal(r.meta.weights.coherency + r.meta.weights.cyclomatic, 1);
  });
});

describe('quality/risk-score — cyclomatic cap', () => {
  it('pins cyclomaticRisk to 1.0 when complexity exceeds CYCLOMATIC_CAP', () => {
    // Build a function with enough branches to exceed the cap.
    // Use CYCLOMATIC_CAP + 20 so the test tracks the constant and
    // stays valid if the cap is retuned.
    const branchCount = CYCLOMATIC_CAP + 20;
    const branches = Array.from({ length: branchCount }, (_, i) => `if (x === ${i}) return ${i};`).join('\n  ');
    const code = `function f(x) {\n  ${branches}\n  return -1;\n}`;
    const r = computeBugProbability(code, { filePath: 't.js' });
    assert.equal(r.components.cyclomaticRisk, 1);
    // Combined risk should be high.
    assert.ok(r.probability >= 0.5, `expected >= 0.5, got ${r.probability}`);
    assert.notEqual(r.riskLevel, 'LOW');
  });

  it('scales cyclomaticRisk linearly below the cap', () => {
    // A function with a moderate number of branches should give a
    // cyclomaticRisk proportional to complexity / CAP.
    const code = `function f(a,b,c) {
      if (a) return 1;
      if (b) return 2;
      if (c) return 3;
      return 0;
    }`;
    const r = computeBugProbability(code);
    // cyclomatic ~ 4 → risk ~ 4/30 ~ 0.13
    assert.ok(r.components.cyclomaticRisk < 0.3);
    assert.ok(r.components.cyclomaticRisk > 0);
  });
});

describe('quality/risk-score — weight override', () => {
  it('respects custom weights and renormalizes', () => {
    const code = `function f() { return 1; }`;
    const byCoherency = computeBugProbability(code, { weights: { coherency: 1, cyclomatic: 0 } });
    const byComplexity = computeBugProbability(code, { weights: { coherency: 0, cyclomatic: 1 } });
    // Coherency-only risk should equal 1 - totalCoherency for this file.
    assert.equal(byCoherency.components.coherencyRisk, byCoherency.probability);
    // Cyclomatic-only risk should equal cyclomaticRisk.
    assert.equal(byComplexity.components.cyclomaticRisk, byComplexity.probability);
  });

  it('falls back to defaults when weights are degenerate', () => {
    const code = `function f() { return 1; }`;
    const r = computeBugProbability(code, { weights: { coherency: 0, cyclomatic: 0 } });
    assert.equal(r.meta.weights.coherency, DEFAULT_WEIGHTS.coherency);
    assert.equal(r.meta.weights.cyclomatic, DEFAULT_WEIGHTS.cyclomatic);
  });
});

describe('quality/risk-score — topFactors breakdown', () => {
  it('populates cyclomatic factor when complexity crosses 0.3 * CAP', () => {
    // Generate slightly more than 0.3 * cap branches so the factor
    // detector's threshold is crossed on any valid cap setting.
    const branchCount = Math.ceil(CYCLOMATIC_CAP * 0.4);
    const branches = Array.from({ length: branchCount }, (_, i) => `if (x === ${i}) return ${i};`).join('\n  ');
    const code = `function f(x) {\n  ${branches}\n  return -1;\n}`;
    const r = computeBugProbability(code);
    const cyc = r.topFactors.find(f => f.name === 'cyclomatic');
    assert.ok(cyc, 'cyclomatic factor should be present');
    assert.ok(cyc.severity > 0);
    assert.match(cyc.message, /cyclomatic complexity/);
  });

  it('produces a recommendation list matching the factors', () => {
    const branchCount = Math.ceil(CYCLOMATIC_CAP * 0.7);
    const branches = Array.from({ length: branchCount }, (_, i) => `if (x === ${i}) return ${i};`).join('\n  ');
    const code = `function f(x) {\n  ${branches}\n}`;
    const r = computeBugProbability(code);
    assert.ok(r.recommendations.length >= 1);
    assert.ok(r.recommendations.some(rec => /cyclomatic/i.test(rec)));
  });

  it('empty topFactors yields a "routine maintenance only" recommendation', () => {
    // A tiny, clean function should produce no high-severity factors.
    const r = computeBugProbability('const add = (a, b) => a + b;');
    if (r.topFactors.length === 0) {
      assert.ok(r.recommendations.length === 1);
      assert.match(r.recommendations[0], /routine/i);
    }
  });
});

describe('quality/risk-score — real fixtures', () => {
  // Files with cyclomatic complexity < 9 (below McCabe borderline).
  // priority-queue has cyclomatic=9, which sits right at LOW/MEDIUM
  // boundary under the cyclomatic-only default weights, so it's
  // excluded from the strict-LOW assertion.
  const strictlyCleanFiles = [
    'seeds/code/async-mutex.js',  // cyclomatic=5
    'seeds/code/promise-pool.js', // cyclomatic=4
  ];
  for (const f of strictlyCleanFiles) {
    it(`scores known-clean ${f} as LOW`, () => {
      if (!fs.existsSync(f)) return; // fixture missing — skip
      const r = computeBugProbability(fs.readFileSync(f, 'utf-8'), { filePath: f });
      assert.equal(r.riskLevel, 'LOW', `expected LOW, got ${r.riskLevel} with p=${r.probability}`);
    });
  }

  it('scores borderline priority-queue.js as LOW or MEDIUM (cyclomatic=9 is at McCabe threshold)', () => {
    const f = 'seeds/code/priority-queue.js';
    if (!fs.existsSync(f)) return;
    const r = computeBugProbability(fs.readFileSync(f, 'utf-8'), { filePath: f });
    assert.ok(['LOW', 'MEDIUM'].includes(r.riskLevel), `expected LOW or MEDIUM, got ${r.riskLevel}`);
    assert.notEqual(r.riskLevel, 'HIGH');
  });

  it('scores known-buggy lead-distribution test as MEDIUM or HIGH', () => {
    const f = 'digital-cathedral/tests/lead-distribution.test.js';
    if (!fs.existsSync(f)) return;
    const r = computeBugProbability(fs.readFileSync(f, 'utf-8'), { filePath: f });
    assert.notEqual(r.riskLevel, 'LOW', `expected >= MEDIUM, got ${r.riskLevel} with p=${r.probability}`);
    // At least one factor surfaced.
    assert.ok(r.topFactors.length > 0);
  });
});

describe('quality/risk-score — fractalAlignment not in factors', () => {
  it('does not include fractalAlignment as a top factor (Phase 1 data went wrong direction)', () => {
    // Generate code where fractalAlignment would be low enough to
    // trigger any theoretical detector, and verify it does NOT appear.
    const code = `const x = 1; const y = 2; const z = x + y;`;
    const r = computeBugProbability(code);
    const hasFractal = r.topFactors.some(f => f.name === 'fractalAlignment');
    assert.equal(hasFractal, false, 'fractalAlignment must not appear in topFactors');
    // But it should still be reported in signals for context.
    assert.equal(typeof r.signals.fractalAlignment, 'number');
  });
});

describe('quality/risk-score — purity', () => {
  it('is a pure function (same input → same output)', () => {
    const code = `function f(x) { if (x) return 1; return 0; }`;
    const a = computeBugProbability(code, { filePath: 'f.js' });
    const b = computeBugProbability(code, { filePath: 'f.js' });
    // Strip timestamp-like meta for comparison — our meta has no
    // time field, but be defensive in case that changes.
    assert.deepEqual(a, b);
  });

  it('is order-independent across calls', () => {
    const c1 = `function a() { return 1; }`;
    const c2 = `function b() { if (x) return 2; return 0; }`;
    const r1a = computeBugProbability(c1);
    const r2  = computeBugProbability(c2);
    const r1b = computeBugProbability(c1);
    assert.equal(r1a.probability, r1b.probability);
    assert.notEqual(r1a.probability, r2.probability);
  });
});
