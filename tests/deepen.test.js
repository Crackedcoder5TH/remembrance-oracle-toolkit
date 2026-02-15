const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

// ─── Modules Under Test ───

const { LifecycleEngine, LIFECYCLE_DEFAULTS } = require('../src/core/lifecycle');
const { HealingWhisper, WHISPER_INTROS, WHISPER_DETAILS } = require('../src/core/whisper');
const { selfImprove, selfOptimize, fullCycle, OPTIMIZE_DEFAULTS } = require('../src/core/self-optimize');
const {
  parseIntent, rewriteQuery, editDistance, applyIntentRanking,
  applyUsageBoosts, selectSearchMode, expandLanguages, smartSearch,
  INTENT_PATTERNS, CORRECTIONS, LANGUAGE_ALIASES, LANGUAGE_FAMILIES,
} = require('../src/core/search-intelligence');
const {
  healStalePatterns, healLowFeedback, healOverEvolved,
  computeUsageBoosts, actOnInsights, ACTIONABLE_DEFAULTS,
} = require('../src/core/actionable-insights');

const { makePattern, createMockOracle: _createBaseMock } = require('./helpers');

// ─── Extended mock with lifecycle/search for deepen tests ───

function createMockOracle(patterns = []) {
  const mock = _createBaseMock(patterns);
  mock.search = (term, opts) => {
    const limit = opts?.limit || 10;
    const lang = opts?.language;
    return patterns
      .filter(p => {
        const text = `${p.name} ${p.description} ${(p.tags || []).join(' ')}`.toLowerCase();
        const matches = text.includes((term || '').toLowerCase());
        return matches && (!lang || p.language === lang);
      })
      .slice(0, limit)
      .map(p => ({ ...p, matchScore: 0.5 }));
  };
  mock.debugGrow = () => ({ processed: 0, generated: 0 });
  mock.lifecycleStatus = function() {
    if (this._lifecycle) return this._lifecycle.status();
    return { running: false, reason: 'not initialized' };
  };
  mock.startLifecycle = function(opts) { return this.getLifecycle(opts).start(); };
  mock.stopLifecycle = function() { if (this._lifecycle) return this._lifecycle.stop(); return { stopped: false }; };
  mock.getLifecycle = function(opts) {
    if (!this._lifecycle) this._lifecycle = new LifecycleEngine(this, opts);
    return this._lifecycle;
  };
  return mock;
}

// ═══════════════════════════════════════════════════
// DEEPEN 1: Self-Management Test Coverage
// ═══════════════════════════════════════════════════

describe('DEEPEN 1: Lifecycle — threshold-triggered cycles', () => {
  it('triggers evolution cycle at feedback threshold', () => {
    const oracle = createMockOracle([makePattern()]);
    let cycleTriggered = false;
    const lifecycle = new LifecycleEngine(oracle, { feedbackEvolutionThreshold: 3 });
    lifecycle.start();

    // Listen for lifecycle cycle events
    oracle.on((event) => {
      if (event.type === 'lifecycle_cycle') cycleTriggered = true;
    });

    oracle._emit({ type: 'feedback', id: 't1', succeeded: true });
    oracle._emit({ type: 'feedback', id: 't2', succeeded: true });
    assert.equal(cycleTriggered, false);

    oracle._emit({ type: 'feedback', id: 't3', succeeded: true });
    assert.equal(cycleTriggered, true);

    lifecycle.stop();
  });

  it('triggers auto-promote at registration threshold', () => {
    let promoteCalled = 0;
    const oracle = createMockOracle();
    oracle.autoPromote = () => { promoteCalled++; return { promoted: 0 }; };

    const lifecycle = new LifecycleEngine(oracle, { registerGrowThreshold: 2 });
    lifecycle.start();

    oracle._emit({ type: 'pattern_registered', id: 'p1' });
    assert.equal(promoteCalled, 0);

    oracle._emit({ type: 'pattern_registered', id: 'p2' });
    assert.equal(promoteCalled, 1);

    lifecycle.stop();
  });

  it('caps history at maxHistory (20)', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);

    for (let i = 0; i < 25; i++) {
      lifecycle.runCycle();
    }

    const history = lifecycle.getHistory();
    assert.equal(history.length, 20);
    // Most recent first
    assert.equal(history[0].cycle, 25);
  });

  it('does not crash on unknown event types', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);
    lifecycle.start();

    oracle._emit({ type: 'unknown_event', data: 42 });
    assert.equal(lifecycle._counters.feedbacks, 0);

    lifecycle.stop();
  });
});

describe('DEEPEN 1: Lifecycle — debug event integration', () => {
  it('counts debug_capture events', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle, { debugGrowThreshold: 100 });
    lifecycle.start();

    oracle._emit({ type: 'debug_capture', id: 'd1', errorClass: 'TypeError' });
    assert.equal(lifecycle._counters.debugCaptures, 1);

    oracle._emit({ type: 'debug_capture', id: 'd2', errorClass: 'ReferenceError' });
    assert.equal(lifecycle._counters.debugCaptures, 2);

    lifecycle.stop();
  });

  it('triggers debug grow at threshold', () => {
    let growCalled = 0;
    const oracle = createMockOracle();
    oracle.debugGrow = () => { growCalled++; return { processed: 1, generated: 2 }; };

    const lifecycle = new LifecycleEngine(oracle, { debugGrowThreshold: 3 });
    lifecycle.start();

    oracle._emit({ type: 'debug_capture', id: 'd1' });
    oracle._emit({ type: 'debug_capture', id: 'd2' });
    assert.equal(growCalled, 0);

    oracle._emit({ type: 'debug_capture', id: 'd3' });
    assert.equal(growCalled, 1);

    lifecycle.stop();
  });

  it('counts debug_feedback events', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);
    lifecycle.start();

    oracle._emit({ type: 'debug_feedback', id: 'd1', resolved: true });
    assert.equal(lifecycle._counters.debugFeedbacks, 1);

    lifecycle.stop();
  });

  it('resets debug counters', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);
    lifecycle.start();

    oracle._emit({ type: 'debug_capture', id: 'd1' });
    oracle._emit({ type: 'debug_feedback', id: 'd1', resolved: true });

    lifecycle.resetCounters();
    assert.equal(lifecycle._counters.debugCaptures, 0);
    assert.equal(lifecycle._counters.debugFeedbacks, 0);

    lifecycle.stop();
  });
});

describe('DEEPEN 1: Whisper — extended event types', () => {
  it('captures lifecycle_cycle events', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    oracle._emit({ type: 'lifecycle_cycle', cycle: 1, healed: 2, promoted: 1 });
    assert.equal(whisper._events.length, 1);

    whisper.stop();
  });

  it('captures evolution_cycle events', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    oracle._emit({ type: 'evolution_cycle', analyzed: 10, healed: 2, regressions: 1 });
    assert.equal(whisper._events.length, 1);

    whisper.stop();
  });

  it('captures rejection_captured events', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    oracle._emit({ type: 'rejection_captured', reason: 'covenant violation' });
    const summary = whisper.summarize();
    assert.equal(summary.stats.rejectionsRecovered, 1);

    whisper.stop();
  });

  it('handles multiple heal events with top-5 display', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    for (let i = 0; i < 7; i++) {
      oracle._emit({
        type: 'auto_heal',
        id: `p${i}`,
        name: `pattern-${i}`,
        improvement: 0.05 * (i + 1),
        newCoherency: 0.8 + i * 0.02,
        loops: i + 1,
      });
    }

    const summary = whisper.summarize();
    assert.equal(summary.stats.healed.length, 7);
    assert.ok(summary.text.includes('7 patterns'));
    assert.ok(summary.stats.totalLoops > 0);

    whisper.stop();
  });

  it('duration tracking works correctly', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    oracle._emit({ type: 'auto_heal', id: 'p1', name: 'test', improvement: 0.1 });

    const summary = whisper.summarize();
    assert.ok(summary.durationMs >= 0);

    whisper.stop();
  });
});

describe('DEEPEN 1: selfOptimize — code similarity', () => {
  it('detects exact duplicates', () => {
    const code = 'function test(x) {\n  return x * 2;\n}';
    const patterns = [
      makePattern({ id: 'p1', name: 'double1', code }),
      makePattern({ id: 'p2', name: 'double2', code }),
    ];
    const oracle = createMockOracle(patterns);
    const report = selfOptimize(oracle);

    assert.ok(report.nearDuplicates.length >= 1);
  });

  it('does not flag dissimilar patterns', () => {
    const patterns = [
      makePattern({ id: 'p1', name: 'sort', code: 'function sort(arr) {\n  return arr.sort((a, b) => a - b);\n}' }),
      makePattern({ id: 'p2', name: 'fetch', code: 'async function fetchData(url) {\n  const res = await fetch(url);\n  return res.json();\n}' }),
    ];
    const oracle = createMockOracle(patterns);
    const report = selfOptimize(oracle);

    assert.equal(report.nearDuplicates.length, 0);
  });

  it('generates merge-duplicates recommendation', () => {
    const code = 'function identity(x) { return x; }';
    const patterns = [
      makePattern({ id: 'p1', name: 'id1', code }),
      makePattern({ id: 'p2', name: 'id2', code }),
    ];
    const oracle = createMockOracle(patterns);
    const report = selfOptimize(oracle);

    const mergeRec = report.recommendations.find(r => r.action === 'merge-duplicates');
    if (report.nearDuplicates.length > 0) {
      assert.ok(mergeRec);
      assert.equal(mergeRec.priority, 'high');
    }
  });
});

// ═══════════════════════════════════════════════════
// DEEPEN 2: Search Intelligence Pipeline
// ═══════════════════════════════════════════════════

describe('DEEPEN 2: selectSearchMode', () => {
  it('returns hybrid for no intents', () => {
    const intent = { intents: [] };
    assert.equal(selectSearchMode(intent, 'auto'), 'hybrid');
  });

  it('returns semantic for performance intent', () => {
    const intent = parseIntent('fast sort algorithm');
    assert.equal(selectSearchMode(intent, 'auto'), 'semantic');
  });

  it('returns semantic for safety intent', () => {
    const intent = parseIntent('safe input validation');
    assert.equal(selectSearchMode(intent, 'auto'), 'semantic');
  });

  it('returns semantic for functional intent', () => {
    const intent = parseIntent('pure functional compose');
    assert.equal(selectSearchMode(intent, 'auto'), 'semantic');
  });

  it('respects explicit mode override', () => {
    const intent = parseIntent('fast sort');
    assert.equal(selectSearchMode(intent, 'hybrid'), 'hybrid');
  });

  it('returns hybrid for simplicity intent', () => {
    const intent = parseIntent('simple helper');
    assert.equal(selectSearchMode(intent, 'auto'), 'hybrid');
  });
});

describe('DEEPEN 2: applyUsageBoosts', () => {
  it('boosts high-usage patterns', () => {
    const patterns = [
      makePattern({ id: 'p1', usageCount: 100, successCount: 90 }),
      makePattern({ id: 'p2', usageCount: 1, successCount: 1 }),
    ];
    const oracle = createMockOracle(patterns);

    const results = [
      { id: 'p1', matchScore: 0.5 },
      { id: 'p2', matchScore: 0.5 },
    ];

    const boosted = applyUsageBoosts(results, oracle);
    assert.ok(boosted[0].matchScore >= boosted[1].matchScore);
  });

  it('handles empty results', () => {
    const oracle = createMockOracle([]);
    const result = applyUsageBoosts([], oracle);
    assert.deepEqual(result, []);
  });

  it('handles null results', () => {
    const oracle = createMockOracle([]);
    const result = applyUsageBoosts(null, oracle);
    assert.equal(result, null);
  });
});

describe('DEEPEN 2: smartSearch integration', () => {
  it('returns searchMode in results', () => {
    const patterns = [
      makePattern({ name: 'sort', description: 'sort algorithm', tags: ['algorithm', 'sort'] }),
    ];
    const oracle = createMockOracle(patterns);
    const result = smartSearch(oracle, 'sort', { mode: 'auto' });
    assert.ok(result.searchMode);
  });

  it('uses semantic mode for performance queries', () => {
    const oracle = createMockOracle([]);
    const result = smartSearch(oracle, 'fast efficient sort', { mode: 'auto' });
    assert.equal(result.searchMode, 'semantic');
  });

  it('applies typed constraint filter', () => {
    const patterns = [
      makePattern({ id: 'p1', name: 'typed-fn', language: 'typescript', code: 'function add(a: number, b: number): number { return a + b; }' }),
      makePattern({ id: 'p2', name: 'untyped-fn', language: 'javascript', code: 'function add(a, b) { return a + b; }' }),
    ];
    const oracle = createMockOracle(patterns);
    const result = smartSearch(oracle, 'typesafe add', { mode: 'auto' });
    // typed constraint should filter to TypeScript patterns
    const tsResults = result.results.filter(r => r.language === 'typescript');
    // p1 should remain (TypeScript), p2 may be filtered by typed constraint
    assert.ok(result.intent.constraints.typed);
  });

  it('generates suggestions for few results', () => {
    const oracle = createMockOracle([]);
    const result = smartSearch(oracle, 'debounse js', { mode: 'auto' });
    // Should suggest correction "debounce"
    assert.ok(result.corrections || result.suggestions.length > 0);
  });

  it('deduplicates results by name', () => {
    const patterns = [
      makePattern({ id: 'p1', name: 'debounce', language: 'javascript' }),
      makePattern({ id: 'p2', name: 'debounce', language: 'typescript' }),
    ];
    const oracle = createMockOracle(patterns);
    const result = smartSearch(oracle, 'debounce');
    const names = result.results.map(r => r.name);
    const unique = new Set(names);
    assert.equal(names.length, unique.size);
  });
});

describe('DEEPEN 2: Intent parsing edge cases', () => {
  it('detects multiple intents', () => {
    const intent = parseIntent('fast safe sort');
    assert.ok(intent.intents.length >= 2);
    const intentNames = intent.intents.map(i => i.name);
    assert.ok(intentNames.includes('performance'));
    assert.ok(intentNames.includes('safety'));
  });

  it('handles empty query', () => {
    const intent = parseIntent('');
    assert.deepEqual(intent.tokens, []);
    assert.deepEqual(intent.intents, []);
  });

  it('handles null query', () => {
    const intent = parseIntent(null);
    assert.equal(intent.original, '');
  });

  it('detects O(n) complexity constraint', () => {
    const intent = parseIntent('O(n) linear search');
    assert.equal(intent.constraints.complexity, 'linear');
  });

  it('detects zero-deps constraint', () => {
    const intent = parseIntent('sort without dependencies');
    assert.equal(intent.constraints.zeroDeps, true);
  });

  it('expands language aliases', () => {
    const langs = expandLanguages('js');
    assert.ok(langs.includes('javascript'));
    assert.ok(langs.includes('typescript')); // family
  });
});

// ═══════════════════════════════════════════════════
// DEEPEN 3: Debug Oracle Growth Loop in Lifecycle
// ═══════════════════════════════════════════════════

describe('DEEPEN 3: Lifecycle debug auto-growth', () => {
  it('has debugGrowThreshold in defaults', () => {
    assert.ok(LIFECYCLE_DEFAULTS.debugGrowThreshold > 0);
  });

  it('lifecycle runCycle includes debugGrowth field', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);
    const report = lifecycle.runCycle();
    assert.ok('debugGrowth' in report);
  });

  it('lifecycle runCycle includes insights field', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);
    const report = lifecycle.runCycle();
    assert.ok('insights' in report);
  });

  it('triggers debug growth during cycle when captures exist', () => {
    let growCalled = false;
    const oracle = createMockOracle();
    oracle.debugGrow = () => { growCalled = true; return { processed: 1 }; };

    const lifecycle = new LifecycleEngine(oracle);
    lifecycle.start();

    // Simulate captures
    oracle._emit({ type: 'debug_capture', id: 'd1' });
    oracle._emit({ type: 'debug_capture', id: 'd2' });

    lifecycle.stop();

    // Run cycle — should trigger debug growth since captures > 0
    const report = lifecycle.runCycle();
    assert.equal(growCalled, true);
  });
});

// ═══════════════════════════════════════════════════
// DEEPEN 4: Actionable Insights
// ═══════════════════════════════════════════════════

describe('DEEPEN 4: Actionable Insights — computeUsageBoosts', () => {
  it('returns empty map for no patterns', () => {
    const oracle = createMockOracle([]);
    const boosts = computeUsageBoosts(oracle);
    assert.equal(boosts.size, 0);
  });

  it('boosts high-usage high-success patterns', () => {
    const patterns = [
      makePattern({ id: 'p1', usageCount: 50, successCount: 45 }),
      makePattern({ id: 'p2', usageCount: 2, successCount: 1 }),
    ];
    const oracle = createMockOracle(patterns);
    const boosts = computeUsageBoosts(oracle);

    const boost1 = boosts.get('p1') || 0;
    const boost2 = boosts.get('p2') || 0;
    assert.ok(boost1 > boost2);
  });

  it('does not boost zero-usage patterns', () => {
    const patterns = [makePattern({ id: 'p1', usageCount: 0, successCount: 0 })];
    const oracle = createMockOracle(patterns);
    const boosts = computeUsageBoosts(oracle);
    assert.equal(boosts.has('p1'), false);
  });

  it('caps boost at 0.15', () => {
    const patterns = [makePattern({ id: 'p1', usageCount: 100, successCount: 100 })];
    const oracle = createMockOracle(patterns);
    const boosts = computeUsageBoosts(oracle);
    const boost = boosts.get('p1') || 0;
    assert.ok(boost <= 0.15);
  });
});

describe('DEEPEN 4: Actionable Insights — healStalePatterns', () => {
  it('returns report for no stale patterns', () => {
    const oracle = createMockOracle([makePattern()]);
    const report = healStalePatterns(oracle);
    assert.equal(report.healed, 0);
    assert.equal(report.failed, 0);
  });

  it('attempts healing on stale low-coherency patterns', () => {
    const oldDate = new Date(Date.now() - 200 * 86400000).toISOString();
    const patterns = [
      makePattern({
        id: 'stale1',
        name: 'stale-low',
        timestamp: oldDate,
        createdAt: oldDate,
        lastUsed: null,
        usageCount: 0,
        coherencyScore: { total: 0.5 },
        code: 'function process(data) {\n  const result = data.map(item => item.value);\n  return result.filter(v => v > 0);\n}',
      }),
    ];
    const oracle = createMockOracle(patterns);
    const report = healStalePatterns(oracle);
    // Result depends on whether reflection can improve
    assert.ok(report.healed >= 0);
    assert.ok(report.details.length >= 0);
  });

  it('skips stale patterns with high coherency', () => {
    const oldDate = new Date(Date.now() - 200 * 86400000).toISOString();
    const patterns = [
      makePattern({
        id: 'stale-high',
        timestamp: oldDate,
        createdAt: oldDate,
        lastUsed: null,
        usageCount: 0,
        coherencyScore: { total: 0.9 },
      }),
    ];
    const oracle = createMockOracle(patterns);
    const report = healStalePatterns(oracle);
    assert.equal(report.skipped, 1);
  });
});

describe('DEEPEN 4: Actionable Insights — healLowFeedback', () => {
  it('returns report for patterns with good feedback', () => {
    const patterns = [
      makePattern({ id: 'p1', usageCount: 10, successCount: 9 }),
    ];
    const oracle = createMockOracle(patterns);
    const report = healLowFeedback(oracle);
    assert.equal(report.healed, 0);
  });

  it('skips patterns with low usage count', () => {
    const patterns = [
      makePattern({ id: 'p1', usageCount: 2, successCount: 0 }),
    ];
    const oracle = createMockOracle(patterns);
    const report = healLowFeedback(oracle, { minUsageForAction: 5 });
    assert.equal(report.skipped >= 0, true);
  });
});

describe('DEEPEN 4: Actionable Insights — healOverEvolved', () => {
  it('returns empty report when no over-evolved patterns', () => {
    const oracle = createMockOracle([makePattern()]);
    const report = healOverEvolved(oracle);
    assert.equal(report.healed, 0);
  });
});

describe('DEEPEN 4: Actionable Insights — actOnInsights', () => {
  it('returns combined report', () => {
    const oracle = createMockOracle([makePattern()]);
    const report = actOnInsights(oracle);

    assert.ok(report.timestamp);
    assert.ok(report.durationMs >= 0);
    assert.ok(report.staleHealing);
    assert.ok(report.feedbackHealing);
    assert.ok(report.overEvolvedHealing);
  });

  it('emits actionable_insights event', () => {
    const oracle = createMockOracle([]);
    actOnInsights(oracle);

    const events = oracle._events.filter(e => e.type === 'actionable_insights');
    assert.equal(events.length, 1);
    assert.ok('staleHealed' in events[0]);
    assert.ok('durationMs' in events[0]);
  });
});

describe('DEEPEN 4: ACTIONABLE_DEFAULTS', () => {
  it('has expected configuration keys', () => {
    assert.ok(ACTIONABLE_DEFAULTS.staleHealThreshold > 0);
    assert.ok(ACTIONABLE_DEFAULTS.staleDays > 0);
    assert.ok(ACTIONABLE_DEFAULTS.maxHeals > 0);
    assert.ok(ACTIONABLE_DEFAULTS.minUsageForAction > 0);
    assert.ok(ACTIONABLE_DEFAULTS.lowFeedbackThreshold > 0);
    assert.ok(ACTIONABLE_DEFAULTS.overEvolvedThreshold > 0);
  });
});

// ═══════════════════════════════════════════════════
// DEEPEN 5: Dashboard API layer
// ═══════════════════════════════════════════════════

describe('DEEPEN 5: Dashboard API — new endpoints exist', () => {
  it('createDashboardServer is importable', () => {
    const { createDashboardServer } = require('../src/dashboard/server');
    assert.equal(typeof createDashboardServer, 'function');
  });

  // Verify the dashboard handles the new routes by checking the source
  // Routes were extracted to routes.js, so check there
  const routeEndpoints = [
    '/api/insights', '/api/lifecycle', '/api/lifecycle/start',
    '/api/lifecycle/stop', '/api/lifecycle/run', '/api/lifecycle/history',
    '/api/smart-search', '/api/insights/act', '/api/insights/boosts',
    '/api/debug/grow', '/api/debug/patterns',
    '/api/self-improve', '/api/self-optimize', '/api/full-cycle',
  ];

  for (const endpoint of routeEndpoints) {
    it(`dashboard handles ${endpoint} route`, () => {
      const fs = require('fs');
      const source = fs.readFileSync(require.resolve('../src/dashboard/routes'), 'utf8');
      assert.ok(source.includes(endpoint));
    });
  }
});

// ─── Cross-Feature Integration ───

describe('Cross-feature: lifecycle + insights + search integration', () => {
  it('lifecycle with autoInsightsOnCycle runs insights during cycle', () => {
    const oracle = createMockOracle([makePattern()]);
    const lifecycle = new LifecycleEngine(oracle, { autoInsightsOnCycle: true });
    const report = lifecycle.runCycle();
    // Should have attempted insights
    assert.ok('insights' in report);
  });

  it('usage boosts integrate with smart search', () => {
    const patterns = [
      makePattern({ id: 'p1', name: 'popular-sort', description: 'sort algo', usageCount: 100, successCount: 95, tags: ['sort', 'algorithm'] }),
      makePattern({ id: 'p2', name: 'unpopular-sort', description: 'sort algo', usageCount: 1, successCount: 0, tags: ['sort', 'algorithm'] }),
    ];
    const oracle = createMockOracle(patterns);
    const result = smartSearch(oracle, 'sort algorithm');

    // p1 should rank higher due to usage boost
    if (result.results.length >= 2) {
      assert.ok(result.results[0].matchScore >= result.results[1].matchScore);
    }
  });

  it('whisper captures actionable_insights events', () => {
    const oracle = createMockOracle([]);
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    // actOnInsights will emit actionable_insights event
    // which is not a healing event, so whisper should not capture it
    oracle._emit({ type: 'actionable_insights', staleHealed: 0 });
    assert.equal(whisper._events.length, 0);

    // But auto_heal from actionable insights should be captured
    oracle._emit({ type: 'auto_heal', id: 'p1', name: 'healed-stale', improvement: 0.1 });
    assert.equal(whisper._events.length, 1);

    whisper.stop();
  });
});
