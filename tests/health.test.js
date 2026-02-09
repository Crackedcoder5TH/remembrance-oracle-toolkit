const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');
const { health, metrics, coherencyDistribution, checkDatabase, checkPatterns, checkCoherency, getVersion } = require('../src/health/monitor');

// ─── Mock oracle for testing ───
function createMockOracle(opts = {}) {
  const patterns = opts.patterns || [
    { id: '1', name: 'a', coherencyScore: { total: 0.85 }, usageCount: 10, successCount: 8, language: 'javascript' },
    { id: '2', name: 'b', coherencyScore: { total: 0.72 }, usageCount: 5, successCount: 3, language: 'typescript' },
    { id: '3', name: 'c', coherencyScore: { total: 0.91 }, usageCount: 0, successCount: 0, language: 'javascript' },
  ];

  return {
    stats: () => ({ totalEntries: opts.totalEntries || 100 }),
    patternStats: () => ({
      totalPatterns: patterns.length,
      byLanguage: { javascript: 2, typescript: 1 },
      byType: { utility: 2, algorithm: 1 },
    }),
    patterns: {
      getAll: (filters) => patterns,
    },
    candidateStats: () => ({ total: opts.candidates || 5, byMethod: { variant: 3, 'serf-refine': 2 } }),
  };
}

describe('health()', () => {
  it('returns healthy status with valid oracle', () => {
    const oracle = createMockOracle();
    const result = health(oracle);

    assert.strictEqual(result.status, 'healthy');
    assert.ok(result.version);
    assert.ok(typeof result.uptime === 'number');
    assert.ok(result.timestamp);
    assert.ok(result.checks.database);
    assert.ok(result.checks.patterns);
    assert.ok(result.checks.coherency);
  });

  it('reports database check with latency', () => {
    const oracle = createMockOracle();
    const result = health(oracle);

    assert.strictEqual(result.checks.database.status, 'ok');
    assert.ok(typeof result.checks.database.latencyMs === 'number');
    assert.strictEqual(result.checks.database.totalEntries, 100);
  });

  it('reports pattern count', () => {
    const oracle = createMockOracle();
    const result = health(oracle);

    assert.strictEqual(result.checks.patterns.status, 'ok');
    assert.strictEqual(result.checks.patterns.count, 3);
  });

  it('reports average coherency', () => {
    const oracle = createMockOracle();
    const result = health(oracle);

    assert.strictEqual(result.checks.coherency.status, 'ok');
    assert.ok(result.checks.coherency.avgScore > 0.7);
    assert.strictEqual(result.checks.coherency.scoredPatterns, 3);
  });

  it('reports degraded when no patterns exist', () => {
    const oracle = createMockOracle({ patterns: [] });
    const result = health(oracle);

    assert.strictEqual(result.status, 'degraded');
    assert.strictEqual(result.checks.patterns.status, 'warning');
  });

  it('reports unhealthy when database fails', () => {
    const oracle = {
      stats: () => { throw new Error('DB connection failed'); },
      patternStats: () => ({ totalPatterns: 0 }),
      patterns: { getAll: () => [] },
      candidateStats: () => ({ total: 0, byMethod: {} }),
    };
    const result = health(oracle);

    assert.strictEqual(result.status, 'unhealthy');
    assert.strictEqual(result.checks.database.status, 'error');
    assert.ok(result.checks.database.error);
  });
});

describe('metrics()', () => {
  it('returns comprehensive metrics snapshot', () => {
    const oracle = createMockOracle();
    const result = metrics(oracle);

    assert.ok(result.patterns);
    assert.ok(result.usage);
    assert.ok(result.candidates);
    assert.ok(typeof result.uptime === 'number');
    assert.ok(result.timestamp);
  });

  it('includes pattern breakdown', () => {
    const oracle = createMockOracle();
    const result = metrics(oracle);

    assert.strictEqual(result.patterns.total, 3);
    assert.ok(result.patterns.byLanguage);
    assert.ok(result.patterns.byType);
    assert.ok(result.patterns.avgCoherency > 0);
    assert.ok(result.patterns.coherencyDistribution);
  });

  it('includes usage metrics', () => {
    const oracle = createMockOracle();
    const result = metrics(oracle);

    assert.strictEqual(result.usage.totalQueries, 15); // 10 + 5 + 0
    assert.strictEqual(result.usage.totalSubmissions, 100);
    assert.ok(result.usage.pullRate >= 0);
    assert.ok(result.usage.pullRate <= 1);
  });

  it('includes candidate metrics', () => {
    const oracle = createMockOracle();
    const result = metrics(oracle);

    assert.strictEqual(result.candidates.total, 5);
    assert.ok(result.candidates.byMethod);
  });

  it('handles missing candidate stats gracefully', () => {
    const oracle = createMockOracle();
    oracle.candidateStats = () => { throw new Error('no candidates'); };
    const result = metrics(oracle);

    assert.strictEqual(result.candidates.total, 0);
  });
});

describe('coherencyDistribution()', () => {
  it('distributes scores into correct buckets', () => {
    const patterns = [
      { coherencyScore: { total: 0.1 } },
      { coherencyScore: { total: 0.15 } },
      { coherencyScore: { total: 0.35 } },
      { coherencyScore: { total: 0.55 } },
      { coherencyScore: { total: 0.7 } },
      { coherencyScore: { total: 0.75 } },
      { coherencyScore: { total: 0.85 } },
      { coherencyScore: { total: 0.95 } },
    ];
    const dist = coherencyDistribution(patterns);

    assert.strictEqual(dist['0.0-0.2'], 2);
    assert.strictEqual(dist['0.2-0.4'], 1);
    assert.strictEqual(dist['0.4-0.6'], 1);
    assert.strictEqual(dist['0.6-0.8'], 2);
    assert.strictEqual(dist['0.8-1.0'], 2);
  });

  it('handles empty patterns', () => {
    const dist = coherencyDistribution([]);
    assert.strictEqual(dist['0.0-0.2'], 0);
    assert.strictEqual(dist['0.8-1.0'], 0);
  });

  it('handles patterns without coherencyScore', () => {
    const dist = coherencyDistribution([{ name: 'no-score' }]);
    assert.strictEqual(dist['0.0-0.2'], 1); // 0 falls in first bucket
  });
});

describe('getVersion()', () => {
  it('returns a version string', () => {
    const version = getVersion();
    assert.ok(typeof version === 'string');
    assert.ok(version !== 'unknown');
    assert.ok(/^\d+\.\d+\.\d+/.test(version));
  });
});

describe('checkDatabase()', () => {
  it('returns ok with latency for working oracle', () => {
    const oracle = { stats: () => ({ totalEntries: 50 }) };
    const result = checkDatabase(oracle);
    assert.strictEqual(result.status, 'ok');
    assert.ok(result.latencyMs >= 0);
  });

  it('returns error for broken oracle', () => {
    const oracle = { stats: () => { throw new Error('failed'); } };
    const result = checkDatabase(oracle);
    assert.strictEqual(result.status, 'error');
    assert.ok(result.error);
  });
});

describe('checkPatterns()', () => {
  it('returns ok with count for working oracle', () => {
    const oracle = { patternStats: () => ({ totalPatterns: 10, byLanguage: {}, byType: {} }) };
    const result = checkPatterns(oracle);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.count, 10);
  });

  it('returns warning when no patterns', () => {
    const oracle = { patternStats: () => ({ totalPatterns: 0 }) };
    const result = checkPatterns(oracle);
    assert.strictEqual(result.status, 'warning');
  });
});

describe('checkCoherency()', () => {
  it('returns ok with average score', () => {
    const oracle = {
      patterns: { getAll: () => [
        { coherencyScore: { total: 0.9 } },
        { coherencyScore: { total: 0.8 } },
      ]},
    };
    const result = checkCoherency(oracle);
    assert.strictEqual(result.status, 'ok');
    assert.strictEqual(result.avgScore, 0.85);
    assert.strictEqual(result.scoredPatterns, 2);
  });

  it('returns warning when no patterns', () => {
    const oracle = { patterns: { getAll: () => [] } };
    const result = checkCoherency(oracle);
    assert.strictEqual(result.status, 'warning');
  });
});
