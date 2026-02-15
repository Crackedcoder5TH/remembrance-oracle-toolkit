const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  generateInsights,
  trackEvent,
  mostPulledPatterns,
  evolveFrequency,
  coherencyTrend,
  stalePatterns,
  searchAnalytics,
  growthMetrics,
  feedbackRates,
} = require('../src/analytics/insights');

// Helper: create a mock oracle with in-memory patterns
function createMockOracle(patterns = [], entries = []) {
  return {
    patterns: {
      getAll: () => patterns,
      _sqlite: null,
    },
    store: {
      getAll: () => entries,
      db: null,
    },
  };
}

function makePattern(overrides = {}) {
  return {
    id: overrides.id || `p-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name || 'test-pattern',
    language: overrides.language || 'javascript',
    code: overrides.code || 'function test() {}',
    coherencyScore: overrides.coherencyScore || { total: 0.85 },
    usageCount: overrides.usageCount || 0,
    successCount: overrides.successCount || 0,
    timestamp: overrides.timestamp || new Date().toISOString(),
    createdAt: overrides.createdAt || new Date().toISOString(),
    tags: overrides.tags || [],
    variants: overrides.variants || [],
    evolutionHistory: overrides.evolutionHistory || [],
    ...(overrides.extra || {}),
  };
}

// ─── mostPulledPatterns ───

describe('mostPulledPatterns', () => {
  it('returns patterns sorted by usage count', () => {
    const oracle = createMockOracle([
      makePattern({ id: 'a', name: 'A', usageCount: 10, successCount: 8 }),
      makePattern({ id: 'b', name: 'B', usageCount: 5, successCount: 3 }),
      makePattern({ id: 'c', name: 'C', usageCount: 20, successCount: 18 }),
    ]);

    const result = mostPulledPatterns(oracle);
    assert.equal(result[0].id, 'c');
    assert.equal(result[0].usageCount, 20);
    assert.equal(result[0].successRate, 90);
    assert.equal(result[1].id, 'a');
    assert.equal(result.length, 3);
  });

  it('returns empty for no patterns', () => {
    const oracle = createMockOracle([]);
    assert.deepEqual(mostPulledPatterns(oracle), []);
  });

  it('computes success rate correctly', () => {
    const oracle = createMockOracle([
      makePattern({ usageCount: 4, successCount: 3 }),
    ]);
    const result = mostPulledPatterns(oracle);
    assert.equal(result[0].successRate, 75);
  });
});

// ─── evolveFrequency ───

describe('evolveFrequency', () => {
  it('tracks patterns with variants', () => {
    const oracle = createMockOracle([
      makePattern({ id: 'parent', name: 'sort', variants: ['v1', 'v2', 'v3'] }),
      makePattern({ id: 'child', name: 'sort-v1' }),
    ]);

    const result = evolveFrequency(oracle);
    assert.ok(result.length > 0);
    assert.equal(result[0].id, 'parent');
    assert.equal(result[0].evolveCount, 3);
    assert.ok(result[0].needsImprovement);
  });

  it('flags patterns with 3+ evolves as needing improvement', () => {
    const oracle = createMockOracle([
      makePattern({ id: 'x', name: 'retry', variants: ['a', 'b', 'c'] }),
    ]);

    const result = evolveFrequency(oracle);
    assert.ok(result[0].needsImprovement);
  });

  it('returns empty for no evolves', () => {
    const oracle = createMockOracle([
      makePattern({ variants: [] }),
    ]);
    assert.deepEqual(evolveFrequency(oracle), []);
  });
});

// ─── coherencyTrend ───

describe('coherencyTrend', () => {
  it('groups patterns by time period', () => {
    const now = new Date();
    const oracle = createMockOracle([
      makePattern({ timestamp: now.toISOString(), coherencyScore: { total: 0.9 } }),
      makePattern({ timestamp: now.toISOString(), coherencyScore: { total: 0.8 } }),
      makePattern({ timestamp: new Date(now - 86400000 * 10).toISOString(), coherencyScore: { total: 0.7 } }),
    ]);

    const result = coherencyTrend(oracle, 7);
    assert.ok(result.length > 0);
    assert.ok(result[0].avgCoherency > 0);
    assert.ok(result[0].patternsAdded > 0);
  });

  it('returns empty for no patterns', () => {
    const oracle = createMockOracle([]);
    assert.deepEqual(coherencyTrend(oracle), []);
  });
});

// ─── stalePatterns ───

describe('stalePatterns', () => {
  it('identifies patterns not used in >90 days', () => {
    const oldDate = new Date(Date.now() - 100 * 86400000).toISOString();
    const oracle = createMockOracle([
      makePattern({ id: 'old', name: 'oldPattern', timestamp: oldDate, usageCount: 0 }),
      makePattern({ id: 'new', name: 'newPattern', timestamp: new Date().toISOString() }),
    ]);

    const result = stalePatterns(oracle, 90);
    assert.equal(result.length, 1);
    assert.equal(result[0].id, 'old');
    assert.ok(result[0].isStale);
    assert.ok(result[0].daysSinceUse >= 90);
  });

  it('returns empty if all patterns are recent', () => {
    const oracle = createMockOracle([
      makePattern({ timestamp: new Date().toISOString() }),
    ]);
    assert.deepEqual(stalePatterns(oracle, 90), []);
  });
});

// ─── feedbackRates ───

describe('feedbackRates', () => {
  it('sorts best and worst by success rate', () => {
    const oracle = createMockOracle([
      makePattern({ id: 'good', name: 'good', usageCount: 10, successCount: 10 }),
      makePattern({ id: 'bad', name: 'bad', usageCount: 10, successCount: 1 }),
      makePattern({ id: 'mid', name: 'mid', usageCount: 10, successCount: 5 }),
    ]);

    const { best, worst } = feedbackRates(oracle);
    assert.equal(best[0].id, 'good');
    assert.equal(best[0].successRate, 100);
    assert.equal(worst[0].id, 'bad');
    assert.equal(worst[0].successRate, 10);
  });

  it('filters out patterns with <2 uses', () => {
    const oracle = createMockOracle([
      makePattern({ usageCount: 1, successCount: 0 }),
      makePattern({ usageCount: 5, successCount: 5 }),
    ]);

    const { best } = feedbackRates(oracle);
    assert.equal(best.length, 1);
  });
});

// ─── searchAnalytics ───

describe('searchAnalytics', () => {
  it('returns empty when no DB', () => {
    const oracle = createMockOracle();
    const result = searchAnalytics(oracle);
    assert.deepEqual(result, { topQueries: [], zeroResults: [] });
  });
});

// ─── growthMetrics ───

describe('growthMetrics', () => {
  it('returns total pattern count without DB', () => {
    const oracle = createMockOracle([
      makePattern(),
      makePattern(),
      makePattern(),
    ]);
    const result = growthMetrics(oracle);
    assert.equal(result.totalPatterns, 3);
  });
});

// ─── trackEvent ───

describe('trackEvent', () => {
  it('returns false when no DB available', () => {
    const oracle = createMockOracle();
    assert.equal(trackEvent(oracle, { type: 'search', query: 'test' }), false);
  });
});

// ─── generateInsights ───

describe('generateInsights', () => {
  it('returns all insight categories', () => {
    const oracle = createMockOracle([
      makePattern({ usageCount: 5, successCount: 4 }),
      makePattern({ usageCount: 10, successCount: 7 }),
    ]);

    const insights = generateInsights(oracle);
    assert.ok('mostPulled' in insights);
    assert.ok('evolveFrequency' in insights);
    assert.ok('coherencyTrend' in insights);
    assert.ok('stalePatterns' in insights);
    assert.ok('searchAnalytics' in insights);
    assert.ok('growthMetrics' in insights);
    assert.ok('feedbackRates' in insights);
  });

  it('respects options', () => {
    const oracle = createMockOracle([
      makePattern({ usageCount: 5, successCount: 4 }),
    ]);

    const insights = generateInsights(oracle, {
      topLimit: 5,
      trendPeriod: 14,
      staleDays: 30,
    });

    assert.ok(insights.mostPulled.length <= 5);
  });
});

// ─── Integration with real Oracle ───

describe('Insights with real Oracle', () => {
  it('generates insights from a real Oracle instance', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });

    const insights = generateInsights(oracle);
    assert.ok(insights);
    assert.ok(Array.isArray(insights.mostPulled));
    assert.ok(Array.isArray(insights.coherencyTrend));
    assert.ok(typeof insights.growthMetrics === 'object');
  });

  it('tracks events with real Oracle', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });

    // trackEvent may succeed or fail depending on DB availability
    const result = trackEvent(oracle, { type: 'search', query: 'debounce', outcome: 'found' });
    assert.ok(typeof result === 'boolean');
  });
});
