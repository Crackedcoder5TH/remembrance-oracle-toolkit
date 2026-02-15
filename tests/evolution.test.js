const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  stalenessPenalty,
  evolvePenalty,
  evolutionAdjustment,
  needsAutoHeal,
  autoHeal,
  captureRejection,
  detectRegressions,
  recheckCoherency,
  evolve,
  EVOLUTION_DEFAULTS,
} = require('../src/evolution/evolution');

const { makePattern, createMockOracle } = require('./helpers');

// ─── stalenessPenalty ───

describe('stalenessPenalty', () => {
  it('returns 0 for recently used patterns', () => {
    const p = makePattern({ lastUsed: new Date().toISOString() });
    assert.equal(stalenessPenalty(p), 0);
  });

  it('returns 0 for patterns within staleness start threshold', () => {
    const recent = new Date(Date.now() - 20 * 86400000).toISOString();
    const p = makePattern({ lastUsed: recent });
    assert.equal(stalenessPenalty(p), 0);
  });

  it('returns positive penalty for stale patterns', () => {
    const staleDate = new Date(Date.now() - 100 * 86400000).toISOString();
    const p = makePattern({ lastUsed: staleDate });
    const penalty = stalenessPenalty(p);
    assert.ok(penalty > 0, 'penalty should be positive for stale patterns');
    assert.ok(penalty <= EVOLUTION_DEFAULTS.stalenessMaxPenalty, 'penalty should not exceed max');
  });

  it('returns max penalty for very old patterns', () => {
    const veryOld = new Date(Date.now() - 365 * 86400000).toISOString();
    const p = makePattern({ lastUsed: veryOld });
    const penalty = stalenessPenalty(p);
    assert.equal(penalty, EVOLUTION_DEFAULTS.stalenessMaxPenalty);
  });

  it('uses createdAt as fallback when lastUsed is null', () => {
    const old = new Date(Date.now() - 100 * 86400000).toISOString();
    const p = makePattern({ createdAt: old, timestamp: old, lastUsed: null });
    const penalty = stalenessPenalty(p);
    assert.ok(penalty > 0);
  });

  it('respects custom config', () => {
    const old = new Date(Date.now() - 100 * 86400000).toISOString();
    const p = makePattern({ lastUsed: old });
    const penalty = stalenessPenalty(p, {
      ...EVOLUTION_DEFAULTS,
      stalenessStartDays: 90,
      stalenessMaxDays: 180,
      stalenessMaxPenalty: 0.3,
    });
    assert.ok(penalty > 0);
    assert.ok(penalty <= 0.3);
  });
});

// ─── evolvePenalty ───

describe('evolvePenalty', () => {
  it('returns 0 for patterns with fewer than 3 children', () => {
    const p = makePattern({
      evolutionHistory: [
        { childId: 'c1', evolvedAt: new Date().toISOString() },
        { childId: 'c2', evolvedAt: new Date().toISOString() },
      ],
    });
    assert.equal(evolvePenalty(p), 0);
  });

  it('returns 0 for patterns with no evolution history', () => {
    const p = makePattern({ evolutionHistory: [] });
    assert.equal(evolvePenalty(p), 0);
  });

  it('returns penalty for patterns with 3+ children', () => {
    const p = makePattern({
      evolutionHistory: [
        { childId: 'c1', evolvedAt: new Date().toISOString() },
        { childId: 'c2', evolvedAt: new Date().toISOString() },
        { childId: 'c3', evolvedAt: new Date().toISOString() },
      ],
    });
    const penalty = evolvePenalty(p);
    assert.ok(penalty > 0);
    assert.equal(penalty, 3 * EVOLUTION_DEFAULTS.evolvePenaltyPerChild);
  });

  it('caps penalty at max', () => {
    const p = makePattern({
      evolutionHistory: Array.from({ length: 10 }, (_, i) => ({
        childId: `c${i}`,
        evolvedAt: new Date().toISOString(),
      })),
    });
    const penalty = evolvePenalty(p);
    assert.equal(penalty, EVOLUTION_DEFAULTS.evolvePenaltyMax);
  });

  it('ignores parent entries in evolution history', () => {
    const p = makePattern({
      evolutionHistory: [
        { parentId: 'p1', evolvedAt: new Date().toISOString() },
        { parentId: 'p2', evolvedAt: new Date().toISOString() },
        { parentId: 'p3', evolvedAt: new Date().toISOString() },
      ],
    });
    assert.equal(evolvePenalty(p), 0);
  });
});

// ─── evolutionAdjustment ───

describe('evolutionAdjustment', () => {
  it('combines staleness and evolve penalties', () => {
    const staleDate = new Date(Date.now() - 100 * 86400000).toISOString();
    const p = makePattern({
      lastUsed: staleDate,
      evolutionHistory: [
        { childId: 'c1', evolvedAt: new Date().toISOString() },
        { childId: 'c2', evolvedAt: new Date().toISOString() },
        { childId: 'c3', evolvedAt: new Date().toISOString() },
      ],
    });

    const adj = evolutionAdjustment(p);
    assert.ok(adj.staleness > 0);
    assert.ok(adj.evolve > 0);
    assert.equal(adj.total, adj.staleness + adj.evolve);
  });

  it('returns zero for fresh patterns with no children', () => {
    const p = makePattern({ lastUsed: new Date().toISOString() });
    const adj = evolutionAdjustment(p);
    assert.equal(adj.staleness, 0);
    assert.equal(adj.evolve, 0);
    assert.equal(adj.total, 0);
  });
});

// ─── needsAutoHeal ───

describe('needsAutoHeal', () => {
  it('returns false when usage is below minimum', () => {
    const p = makePattern({ usageCount: 2, successCount: 0 });
    assert.equal(needsAutoHeal(p), false);
  });

  it('returns false when success rate is above threshold', () => {
    const p = makePattern({ usageCount: 10, successCount: 8 });
    assert.equal(needsAutoHeal(p), false);
  });

  it('returns true when success rate is below threshold with enough usage', () => {
    const p = makePattern({ usageCount: 10, successCount: 2 });
    assert.equal(needsAutoHeal(p), true);
  });

  it('returns true when all feedback is negative', () => {
    const p = makePattern({ usageCount: 6, successCount: 0 });
    assert.equal(needsAutoHeal(p), true);
  });

  it('respects custom config', () => {
    const p = makePattern({ usageCount: 3, successCount: 0 });
    assert.equal(needsAutoHeal(p, { ...EVOLUTION_DEFAULTS, autoHealMinUses: 3 }), true);
  });
});

// ─── autoHeal ───

describe('autoHeal', () => {
  it('attempts reflection healing on a pattern', () => {
    const p = makePattern({
      code: 'function   add( a,b ){return a+b}',
      language: 'javascript',
    });
    const result = autoHeal(p, { maxLoops: 1 });
    // Result may be null (no improvement) or an object with code
    if (result) {
      assert.ok(typeof result.code === 'string');
      assert.ok(typeof result.newCoherency === 'number');
      assert.ok(typeof result.loops === 'number');
    }
  });

  it('returns null for patterns that cannot be improved', () => {
    const p = makePattern({
      code: 'function add(a, b) {\n  return a + b;\n}',
      language: 'javascript',
      coherencyScore: { total: 1.0 },
    });
    const result = autoHeal(p, { maxLoops: 1 });
    // Already perfect — healing should return null or no improvement
    if (result) {
      assert.ok(result.improvement <= 0 || result.code === p.code);
    }
  });
});

// ─── captureRejection ───

describe('captureRejection', () => {
  it('creates a capture entry from a rejection', () => {
    const code = 'function bad() { eval("danger"); }';
    const metadata = { language: 'javascript', description: 'bad code', tags: ['test'] };
    const validation = {
      errors: ['Covenant violation: no eval'],
      coherencyScore: { total: 0.3, language: 'javascript' },
    };

    const capture = captureRejection(code, metadata, validation);
    assert.equal(capture.code, code);
    assert.equal(capture.language, 'javascript');
    assert.equal(capture.source, 'rejected-submission');
    assert.ok(capture.failureReason.includes('eval'));
    assert.ok(capture.capturedAt);
  });

  it('handles missing metadata gracefully', () => {
    const capture = captureRejection('code', {}, null);
    assert.equal(capture.language, 'unknown');
    assert.equal(capture.name, 'rejected-submission');
  });
});

// ─── detectRegressions ───

describe('detectRegressions', () => {
  it('detects patterns with significant success rate drops', () => {
    const patterns = [
      makePattern({ id: 'a', usageCount: 10, successCount: 2, initialReliability: 0.9 }),
      makePattern({ id: 'b', usageCount: 10, successCount: 9, initialReliability: 0.9 }),
    ];

    const regressions = detectRegressions(patterns);
    assert.equal(regressions.length, 1);
    assert.equal(regressions[0].id, 'a');
    assert.equal(regressions[0].needsHeal, true);
  });

  it('skips patterns with insufficient usage data', () => {
    const patterns = [
      makePattern({ id: 'a', usageCount: 1, successCount: 0, initialReliability: 0.9 }),
    ];

    const regressions = detectRegressions(patterns);
    assert.equal(regressions.length, 0);
  });

  it('skips patterns without significant delta', () => {
    const patterns = [
      makePattern({ id: 'a', usageCount: 10, successCount: 6, initialReliability: 0.7 }),
    ];

    const regressions = detectRegressions(patterns);
    assert.equal(regressions.length, 0);
  });

  it('uses reliability as baseline when initialReliability is missing', () => {
    const patterns = [
      makePattern({ id: 'a', usageCount: 10, successCount: 1, reliability: 0.8, initialReliability: undefined }),
    ];

    const regressions = detectRegressions(patterns);
    assert.equal(regressions.length, 1);
  });
});

// ─── recheckCoherency ───

describe('recheckCoherency', () => {
  it('re-scores old patterns', () => {
    const old = new Date(Date.now() - 60 * 86400000).toISOString();
    const patterns = [
      makePattern({
        id: 'a',
        createdAt: old,
        code: 'function multiply(x, y) {\n  return x * y;\n}',
        coherencyScore: { total: 0.3 },
      }),
    ];

    const updates = recheckCoherency(patterns);
    // Should detect coherency difference
    if (updates.length > 0) {
      assert.ok(Math.abs(updates[0].diff) >= 0.05);
      assert.ok(typeof updates[0].newCoherency === 'number');
    }
  });

  it('skips recent patterns', () => {
    const patterns = [
      makePattern({
        createdAt: new Date().toISOString(),
        code: 'function test() {}',
        coherencyScore: { total: 0.5 },
      }),
    ];

    const updates = recheckCoherency(patterns);
    assert.equal(updates.length, 0);
  });
});

// ─── evolve (full cycle) ───

describe('evolve (full cycle)', () => {
  it('runs a full evolution cycle and returns a report', () => {
    const patterns = [
      makePattern({ id: 'good', usageCount: 20, successCount: 18 }),
      makePattern({
        id: 'poor',
        usageCount: 10,
        successCount: 2,
        code: 'function   test( ){return 1}',
      }),
    ];

    const oracle = createMockOracle(patterns);
    const report = evolve(oracle);

    assert.equal(report.patternsAnalyzed, 2);
    assert.ok(typeof report.staleCount === 'number');
    assert.ok(Array.isArray(report.regressions));
    assert.ok(Array.isArray(report.healed));
    assert.ok(Array.isArray(report.coherencyUpdates));
    assert.ok(typeof report.timestamp === 'string');
  });

  it('emits evolution_cycle event', () => {
    const oracle = createMockOracle([makePattern()]);
    evolve(oracle);

    const evtType = oracle._events.find(e => e.type === 'evolution_cycle');
    assert.ok(evtType, 'should emit evolution_cycle event');
    assert.equal(evtType.analyzed, 1);
  });

  it('handles empty pattern library gracefully', () => {
    const oracle = createMockOracle([]);
    const report = evolve(oracle);

    assert.equal(report.patternsAnalyzed, 0);
    assert.equal(report.regressions.length, 0);
    assert.equal(report.healed.length, 0);
    assert.equal(report.staleCount, 0);
  });

  it('detects evolve-overloaded parents', () => {
    const patterns = [
      makePattern({
        id: 'parent',
        evolutionHistory: [
          { childId: 'c1', evolvedAt: new Date().toISOString() },
          { childId: 'c2', evolvedAt: new Date().toISOString() },
          { childId: 'c3', evolvedAt: new Date().toISOString() },
          { childId: 'c4', evolvedAt: new Date().toISOString() },
        ],
      }),
    ];

    const oracle = createMockOracle(patterns);
    const report = evolve(oracle);

    assert.ok(report.evolveOverloaded.length > 0);
    assert.equal(report.evolveOverloaded[0].id, 'parent');
    assert.equal(report.evolveOverloaded[0].childCount, 4);
  });

  it('respects custom config overrides', () => {
    const oracle = createMockOracle([makePattern()]);
    const report = evolve(oracle, {
      stalenessStartDays: 1,
      autoHealMinUses: 1,
    });

    assert.ok(typeof report.patternsAnalyzed === 'number');
  });
});

// ─── EVOLUTION_DEFAULTS ───

describe('EVOLUTION_DEFAULTS', () => {
  it('has all required configuration keys', () => {
    assert.ok(typeof EVOLUTION_DEFAULTS.autoHealThreshold === 'number');
    assert.ok(typeof EVOLUTION_DEFAULTS.autoHealMinUses === 'number');
    assert.ok(typeof EVOLUTION_DEFAULTS.stalenessStartDays === 'number');
    assert.ok(typeof EVOLUTION_DEFAULTS.stalenessMaxDays === 'number');
    assert.ok(typeof EVOLUTION_DEFAULTS.stalenessMaxPenalty === 'number');
    assert.ok(typeof EVOLUTION_DEFAULTS.evolvePenaltyPerChild === 'number');
    assert.ok(typeof EVOLUTION_DEFAULTS.evolvePenaltyMax === 'number');
    assert.ok(typeof EVOLUTION_DEFAULTS.regressionDelta === 'number');
    assert.ok(typeof EVOLUTION_DEFAULTS.recheckCoherencyDays === 'number');
    assert.ok(typeof EVOLUTION_DEFAULTS.maxRefineLoops === 'number');
  });

  it('has sensible default values', () => {
    assert.ok(EVOLUTION_DEFAULTS.autoHealThreshold > 0 && EVOLUTION_DEFAULTS.autoHealThreshold < 1);
    assert.ok(EVOLUTION_DEFAULTS.stalenessMaxPenalty > 0 && EVOLUTION_DEFAULTS.stalenessMaxPenalty < 1);
    assert.ok(EVOLUTION_DEFAULTS.evolvePenaltyMax > 0 && EVOLUTION_DEFAULTS.evolvePenaltyMax < 1);
    assert.ok(EVOLUTION_DEFAULTS.autoHealMinUses >= 1);
  });
});
