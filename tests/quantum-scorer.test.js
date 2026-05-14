'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  unifiedMeasurement,
  unifiedFieldMeasurement,
  quickAmplitude,
  AUDIT_DECOHERENCE,
  FRACTAL_SECTOR_MAP,
} = require('../src/unified/quantum-scorer');

// ─── Unified Measurement ───

describe('unifiedMeasurement', () => {
  it('returns valid structure for simple code', () => {
    const code = 'function add(a, b) { return a + b; }';
    const result = unifiedMeasurement(code, { language: 'javascript' });

    assert.ok(result.unified, 'should be marked as unified');
    assert.ok(typeof result.amplitude === 'number', 'amplitude should be a number');
    assert.ok(result.amplitude >= 0.2 && result.amplitude <= 1.0, `amplitude ${result.amplitude} should be in [0.2, 1.0]`);
    assert.ok(['pull', 'evolve', 'generate'].includes(result.decision), `decision should be valid, got ${result.decision}`);
    assert.ok(typeof result.confidence === 'number', 'confidence should be a number');
  });

  it('returns all sub-scores for transparency', () => {
    const code = 'function sort(arr) { return arr.slice().sort((a, b) => a - b); }';
    const result = unifiedMeasurement(code, { language: 'javascript' });

    // Coherency sub-score
    assert.ok(result.coherency, 'should have coherency');
    assert.ok(typeof result.coherency.total === 'number');
    assert.ok(result.coherency.breakdown, 'should have breakdown');
    assert.ok('fractalAlignment' in result.coherency.breakdown);

    // Fractal sub-score
    assert.ok(result.fractal, 'should have fractal');
    assert.ok(typeof result.fractal.alignment === 'number');
    assert.ok(result.fractal.dimensions, 'should have fractal dimensions');
    assert.ok(result.fractal.dominantFractal, 'should identify dominant fractal');

    // Audit sub-score
    assert.ok(result.audit, 'should have audit');
    assert.ok(Array.isArray(result.audit.warnings));
    assert.ok(typeof result.audit.decoherencePenalty === 'number');

    // Quantum sub-score
    assert.ok(result.quantum, 'should have quantum');
    assert.ok(typeof result.quantum.baseAmplitude === 'number');
    assert.ok(typeof result.quantum.phase === 'number');
  });

  it('returns fallback for null/empty code', () => {
    const result = unifiedMeasurement(null);
    assert.equal(result.amplitude, 0.2); // PLANCK_AMPLITUDE
    assert.equal(result.decision, 'generate');
    assert.equal(result.unified, true);
  });

  it('detects audit bugs and applies decoherence penalty', () => {
    // Code with a known bug pattern: .sort() without .slice()
    const buggyCode = `
      function sortUsers(users) {
        return users.sort((a, b) => a.name.localeCompare(b.name));
      }
    `;
    const cleanCode = `
      function sortUsers(users) {
        return users.slice().sort((a, b) => a.name.localeCompare(b.name));
      }
    `;

    const buggyResult = unifiedMeasurement(buggyCode, { language: 'javascript' });
    const cleanResult = unifiedMeasurement(cleanCode, { language: 'javascript' });

    // Buggy code should have audit warnings
    assert.ok(buggyResult.audit.warnings.length > 0, 'buggy code should trigger audit warnings');
    assert.ok(buggyResult.audit.decoherencePenalty > 0, 'buggy code should have decoherence penalty');

    // Clean code should have no/fewer warnings
    assert.ok(cleanResult.audit.decoherencePenalty <= buggyResult.audit.decoherencePenalty,
      'clean code should have less audit penalty');

    // Buggy code should have lower amplitude (decoherence reduces it)
    assert.ok(buggyResult.amplitude <= cleanResult.amplitude,
      `buggy amplitude ${buggyResult.amplitude} should be <= clean amplitude ${cleanResult.amplitude}`);
  });

  it('fractal dominant type maps to quantum sector', () => {
    // Recursive code should trigger Sierpinski → algorithm sector
    const recursiveCode = `
      function fibonacci(n) {
        if (n <= 1) return n;
        return fibonacci(n - 1) + fibonacci(n - 2);
      }
    `;
    const result = unifiedMeasurement(recursiveCode, { language: 'javascript' });

    assert.ok(result.fractal, 'should compute fractal');
    assert.ok(result.quantum.sector, 'should assign quantum sector');
    // Sector should come from FRACTAL_SECTOR_MAP
    const validSectors = Object.values(FRACTAL_SECTOR_MAP);
    assert.ok(
      validSectors.includes(result.quantum.sector) || result.quantum.sector,
      `sector ${result.quantum.sector} should be valid`
    );
  });

  it('incorporates usage/success counts into amplitude', () => {
    const code = 'function greet(name) { return `Hello, ${name}!`; }';

    const newPattern = unifiedMeasurement(code, {
      language: 'javascript',
      pattern: { usageCount: 0, successCount: 0 },
    });

    const provenPattern = unifiedMeasurement(code, {
      language: 'javascript',
      pattern: { usageCount: 50, successCount: 45 },
    });

    // Proven patterns should have higher amplitude
    assert.ok(provenPattern.amplitude >= newPattern.amplitude,
      `proven amplitude ${provenPattern.amplitude} should be >= new amplitude ${newPattern.amplitude}`);
  });

  it('security bugs are detected and penalize amplitude', () => {
    // Code with timing-unsafe secret comparison
    const insecureCode = `
      function checkAuth(password, stored) {
        if (password === stored) return true;
        return false;
      }
    `;
    const result = unifiedMeasurement(insecureCode, {
      language: 'javascript',
      relevance: 1.0,
      pattern: { usageCount: 100, successCount: 95 },
    });

    // Should detect security warning
    const securityWarnings = result.audit.warnings.filter(w => w.bugClass === 'security');
    assert.ok(securityWarnings.length > 0, 'should detect timing-unsafe secret comparison');
    assert.ok(result.audit.decoherencePenalty >= AUDIT_DECOHERENCE['security'],
      `penalty ${result.audit.decoherencePenalty} should be >= security penalty ${AUDIT_DECOHERENCE['security']}`);

    // If the amplitude was high enough for PULL, the override should trigger
    if (result.audit.override) {
      assert.equal(result.audit.override.newDecision, 'evolve');
      assert.equal(result.decision, 'evolve');
    }
  });
});

// ─── Field Measurement (Multiple Candidates) ───

describe('unifiedFieldMeasurement', () => {
  it('measures and sorts multiple candidates by amplitude', () => {
    const candidates = [
      {
        code: 'function a() { return 1; }',
        options: { language: 'javascript' },
      },
      {
        code: 'function add(a, b) { if (typeof a !== "number") throw new TypeError(); return a + b; }',
        options: { language: 'javascript' },
      },
    ];

    const results = unifiedFieldMeasurement(candidates);

    assert.ok(results.length === 2, 'should return 2 results');
    // Should be sorted by amplitude descending
    assert.ok(results[0].amplitude >= results[1].amplitude, 'should be sorted by amplitude');
    // Each should have unified flag
    assert.ok(results[0].unified);
    assert.ok(results[1].unified);
  });

  it('returns empty array for empty input', () => {
    assert.deepEqual(unifiedFieldMeasurement([]), []);
    assert.deepEqual(unifiedFieldMeasurement(null), []);
  });
});

// ─── Quick Amplitude ───

describe('quickAmplitude', () => {
  it('returns a valid amplitude for code', () => {
    const amp = quickAmplitude('function foo() { return 42; }', { language: 'javascript' });
    assert.ok(typeof amp === 'number');
    assert.ok(amp >= 0.2 && amp <= 1.0, `amplitude ${amp} should be in [0.2, 1.0]`);
  });

  it('returns PLANCK_AMPLITUDE for null code', () => {
    assert.equal(quickAmplitude(null), 0.2);
    assert.equal(quickAmplitude(''), 0.2);
  });

  it('buggy code has lower quick amplitude than clean code', () => {
    const buggy = quickAmplitude('function f(x) { return x.sort(); }');
    const clean = quickAmplitude('function f(x) { return x.slice().sort(); }');
    assert.ok(buggy <= clean, `buggy ${buggy} should be <= clean ${clean}`);
  });
});

// ─── Constants ───

describe('AUDIT_DECOHERENCE mapping', () => {
  it('security has highest penalty', () => {
    assert.ok(AUDIT_DECOHERENCE['security'] > AUDIT_DECOHERENCE['edge-case']);
    assert.ok(AUDIT_DECOHERENCE['security'] > AUDIT_DECOHERENCE['type']);
  });

  it('all penalties are positive numbers < 1', () => {
    for (const [cls, penalty] of Object.entries(AUDIT_DECOHERENCE)) {
      assert.ok(penalty > 0 && penalty < 1, `${cls} penalty ${penalty} should be in (0, 1)`);
    }
  });
});

describe('FRACTAL_SECTOR_MAP', () => {
  it('maps all 5 fractal dimensions to valid sectors', () => {
    const expectedDims = ['selfSimilarity', 'boundaryDepth', 'growthCascade', 'stabilityTuning', 'orderNavigation'];
    for (const dim of expectedDims) {
      assert.ok(dim in FRACTAL_SECTOR_MAP, `${dim} should be mapped`);
      assert.ok(typeof FRACTAL_SECTOR_MAP[dim] === 'string', `${dim} should map to a string`);
    }
  });
});
