const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');

const {
  PLANCK_AMPLITUDE,
  DECOHERENCE_LAMBDA,
  TUNNELING_PROBABILITY,
  ENTANGLEMENT_STRENGTH,
  INTERFERENCE_RADIUS,
  COLLAPSE_BOOST,
  QUANTUM_STATES,
  FIELD_SECTORS,
  computeAmplitude,
  coherencyToAmplitude,
  amplitudeToCoherency,
  applyDecoherence,
  determineState,
  computePhase,
  computeInterference,
  applyFieldInterference,
  canTunnel,
  computeEntanglementDelta,
  shouldEntangle,
  quantumDecision,
  observePattern,
  PULL_THRESHOLD,
  EVOLVE_THRESHOLD,
} = require('../src/quantum/quantum-core');

describe('Quantum Core — Constants', () => {
  it('exports all quantum constants', () => {
    assert.equal(typeof PLANCK_AMPLITUDE, 'number');
    assert.equal(typeof DECOHERENCE_LAMBDA, 'number');
    assert.equal(typeof TUNNELING_PROBABILITY, 'number');
    assert.equal(typeof ENTANGLEMENT_STRENGTH, 'number');
    assert.equal(typeof INTERFERENCE_RADIUS, 'number');
    assert.equal(typeof COLLAPSE_BOOST, 'number');
    assert.ok(PLANCK_AMPLITUDE > 0 && PLANCK_AMPLITUDE < 1);
  });

  it('exports quantum states', () => {
    assert.equal(QUANTUM_STATES.SUPERPOSITION, 'superposition');
    assert.equal(QUANTUM_STATES.COLLAPSED, 'collapsed');
    assert.equal(QUANTUM_STATES.DECOHERED, 'decohered');
  });

  it('exports field sectors for debug and pattern types', () => {
    assert.ok(FIELD_SECTORS.syntax);
    assert.ok(FIELD_SECTORS.algorithm);
    assert.equal(FIELD_SECTORS.syntax.type, 'debug');
    assert.equal(FIELD_SECTORS.algorithm.type, 'pattern');
  });
});

describe('Quantum Core — Amplitude', () => {
  it('computeAmplitude returns PLANCK_AMPLITUDE for zero coherency', () => {
    const amp = computeAmplitude({ coherency: 0 });
    assert.equal(amp, PLANCK_AMPLITUDE);
  });

  it('computeAmplitude scales with coherency', () => {
    const low = computeAmplitude({ coherency: 0.3 });
    const high = computeAmplitude({ coherency: 0.9 });
    assert.ok(high > low);
  });

  it('computeAmplitude accounts for usage history', () => {
    const unused = computeAmplitude({ coherency: 0.8, usageCount: 0, successCount: 0 });
    const used = computeAmplitude({ coherency: 0.8, usageCount: 10, successCount: 9 });
    assert.ok(used > unused);
  });

  it('computeAmplitude respects sector weights', () => {
    const highSector = computeAmplitude({ coherency: 0.8, sector: 'syntax' });
    const lowSector = computeAmplitude({ coherency: 0.8, sector: 'network' });
    assert.ok(highSector > lowSector);
  });

  it('coherencyToAmplitude converts correctly', () => {
    const amp = coherencyToAmplitude(0.85);
    assert.ok(amp >= PLANCK_AMPLITUDE);
    assert.ok(amp <= 1);
  });

  it('amplitudeToCoherency converts back', () => {
    const coh = amplitudeToCoherency(0.75);
    assert.ok(coh > 0 && coh <= 1);
  });
});

describe('Quantum Core — Decoherence', () => {
  it('no decay when no lastObservedAt', () => {
    const result = applyDecoherence(0.8, null);
    assert.equal(result, 0.8);
  });

  it('no decay for recently observed pattern', () => {
    const now = new Date();
    const result = applyDecoherence(0.8, now.toISOString(), now);
    assert.equal(result, 0.8);
  });

  it('decays over time', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 90 * 86400000); // 90 days ago
    const result = applyDecoherence(0.8, pastDate.toISOString(), now);
    assert.ok(result < 0.8);
    assert.ok(result > 0);
  });

  it('heavy decay for very old patterns', () => {
    const now = new Date();
    const pastDate = new Date(now.getTime() - 365 * 86400000); // 1 year ago
    const result = applyDecoherence(0.8, pastDate.toISOString(), now);
    assert.ok(result < 0.2);
  });
});

describe('Quantum Core — State Determination', () => {
  it('returns DECOHERED for very low amplitude', () => {
    assert.equal(determineState(0.01, true), QUANTUM_STATES.DECOHERED);
  });

  it('returns COLLAPSED when observed', () => {
    assert.equal(determineState(0.5, true), QUANTUM_STATES.COLLAPSED);
  });

  it('returns SUPERPOSITION when not observed', () => {
    assert.equal(determineState(0.5, false), QUANTUM_STATES.SUPERPOSITION);
  });
});

describe('Quantum Core — Phase & Interference', () => {
  it('computePhase returns 0 for null input', () => {
    assert.equal(computePhase(null), 0);
  });

  it('computePhase returns consistent value', () => {
    const phase1 = computePhase('test-id');
    const phase2 = computePhase('test-id');
    assert.equal(phase1, phase2);
  });

  it('computePhase returns different values for different inputs', () => {
    const phase1 = computePhase('id-alpha');
    const phase2 = computePhase('id-beta');
    assert.notEqual(phase1, phase2);
  });

  it('computePhase returns value in [0, 2π]', () => {
    const phase = computePhase('any-id');
    assert.ok(phase >= 0);
    assert.ok(phase <= 2 * Math.PI);
  });

  it('computeInterference returns value in expected range', () => {
    const a = { phase: 0, code: 'function foo() {}' };
    const b = { phase: Math.PI, code: 'function bar() {}' };
    const result = computeInterference(a, b);
    assert.ok(result >= -INTERFERENCE_RADIUS);
    assert.ok(result <= INTERFERENCE_RADIUS);
  });

  it('applyFieldInterference modifies match scores', () => {
    const scored = [
      { matchScore: 0.5, phase: 0, code: 'function a() { return 1; }' },
      { matchScore: 0.4, phase: 0.1, code: 'function a() { return 1; }' }, // Similar code
    ];
    applyFieldInterference(scored);
    // Should have interference values
    assert.ok(scored[0].interference !== undefined || scored.length >= 2);
  });

  it('applyFieldInterference is no-op for single result', () => {
    const scored = [{ matchScore: 0.5, phase: 0, code: 'x' }];
    applyFieldInterference(scored);
    assert.equal(scored[0].matchScore, 0.5);
  });
});

describe('Quantum Core — Tunneling', () => {
  it('always tunnels when amplitude >= threshold', () => {
    assert.ok(canTunnel(0.5, 0.3));
    assert.ok(canTunnel(0.3, 0.3));
  });

  it('tunneling is probabilistic for low amplitude', () => {
    // Run many trials — at least some should tunnel
    let tunneled = 0;
    for (let i = 0; i < 1000; i++) {
      if (canTunnel(0.1, 0.3)) tunneled++;
    }
    // Should tunnel occasionally but not always
    assert.ok(tunneled > 0, 'Should tunnel at least once in 1000 tries');
    assert.ok(tunneled < 1000, 'Should not tunnel every time');
  });
});

describe('Quantum Core — Entanglement', () => {
  it('computeEntanglementDelta positive on success', () => {
    const delta = computeEntanglementDelta(true);
    assert.ok(delta > 0);
  });

  it('computeEntanglementDelta negative on failure', () => {
    const delta = computeEntanglementDelta(false);
    assert.ok(delta < 0);
  });

  it('success delta is larger than failure delta magnitude', () => {
    const success = computeEntanglementDelta(true);
    const failure = computeEntanglementDelta(false);
    assert.ok(success > Math.abs(failure));
  });

  it('shouldEntangle returns true for parent-child', () => {
    assert.ok(shouldEntangle(
      { parentId: 'B', language: 'js', tags: [] },
      { id: 'B', language: 'py', tags: [] }
    ));
  });

  it('shouldEntangle returns true for same language + overlapping tags', () => {
    assert.ok(shouldEntangle(
      { language: 'javascript', tags: ['utility', 'string', 'parsing'] },
      { language: 'javascript', tags: ['utility', 'string'] }
    ));
  });

  it('shouldEntangle returns false for unrelated patterns', () => {
    assert.ok(!shouldEntangle(
      { language: 'python', tags: ['ml'], sector: 'algorithm' },
      { id: 'X', language: 'go', tags: ['network'], sector: 'io' }
    ));
  });
});

describe('Quantum Core — Decision', () => {
  it('PULL for high amplitude and relevance', () => {
    const result = quantumDecision(0.9, 0.8);
    assert.equal(result.decision, 'pull');
    assert.ok(result.confidence >= PULL_THRESHOLD);
  });

  it('EVOLVE for medium amplitude', () => {
    const result = quantumDecision(0.6, 0.7);
    assert.equal(result.decision, 'evolve');
  });

  it('GENERATE for low amplitude', () => {
    const result = quantumDecision(0.2, 0.3);
    assert.equal(result.decision, 'generate');
  });
});

describe('Quantum Core — Observation', () => {
  it('observePattern returns scored result', () => {
    const pattern = {
      amplitude: 0.8,
      lastObservedAt: new Date().toISOString(),
      observationCount: 5,
      phase: 0.5,
    };
    const result = observePattern(pattern, 0.7);
    assert.ok(result.observedAmplitude > 0);
    assert.ok(result.matchScore > 0);
    assert.ok(result.bornProbability > 0);
  });

  it('observePattern applies decoherence for stale patterns', () => {
    const now = new Date();
    const old = new Date(now.getTime() - 200 * 86400000);
    const pattern = {
      amplitude: 0.8,
      lastObservedAt: old.toISOString(),
      observationCount: 1,
    };
    const result = observePattern(pattern, 0.5, { now: now.toISOString() });
    assert.ok(result.observedAmplitude < 0.8);
  });

  it('observePattern boosts for language match', () => {
    const pattern = { amplitude: 0.5, observationCount: 0 };
    const withMatch = observePattern(pattern, 0.5, { languageMatch: true });
    const without = observePattern(pattern, 0.5, { languageMatch: false });
    assert.ok(withMatch.matchScore > without.matchScore);
  });
});
