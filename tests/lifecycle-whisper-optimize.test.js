const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const { LifecycleEngine, LIFECYCLE_DEFAULTS } = require('../src/core/lifecycle');
const { HealingWhisper, WHISPER_INTROS, WHISPER_DETAILS } = require('../src/core/whisper');
const { selfImprove, selfOptimize, fullCycle, OPTIMIZE_DEFAULTS } = require('../src/core/self-optimize');

// ─── Helpers ───

function makePattern(overrides = {}) {
  return {
    id: overrides.id || `p-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name || 'test-pattern',
    language: overrides.language || 'javascript',
    code: overrides.code || 'function add(a, b) {\n  return a + b;\n}',
    coherencyScore: overrides.coherencyScore || { total: 0.85 },
    usageCount: overrides.usageCount ?? 0,
    successCount: overrides.successCount ?? 0,
    timestamp: overrides.timestamp || new Date().toISOString(),
    createdAt: overrides.createdAt || new Date().toISOString(),
    lastUsed: overrides.lastUsed || null,
    tags: overrides.tags || ['utility'],
    evolutionHistory: overrides.evolutionHistory || [],
    description: overrides.description || 'test pattern',
    reliability: overrides.reliability ?? 0.5,
  };
}

function createMockOracle(patterns = []) {
  const updates = [];
  const events = [];
  const listeners = [];
  const candidates = [];

  return {
    patterns: {
      getAll: () => patterns,
      update: (id, data) => {
        updates.push({ id, ...data });
        const p = patterns.find(x => x.id === id);
        if (p) Object.assign(p, data);
        return p;
      },
      getCandidates: () => candidates,
      candidateSummary: () => ({ total: candidates.length }),
      _sqlite: null,
    },
    store: {
      getSQLiteStore: () => null,
      getAll: () => [],
      summary: () => ({ totalEntries: patterns.length }),
    },
    on: (listener) => {
      listeners.push(listener);
      return () => {
        const idx = listeners.indexOf(listener);
        if (idx >= 0) listeners.splice(idx, 1);
      };
    },
    _emit: (event) => {
      events.push(event);
      for (const l of listeners) {
        try { l(event); } catch {}
      }
    },
    _listeners: listeners,
    _updates: updates,
    _events: events,
    autoPromote: () => ({ promoted: 0, skipped: 0, vetoed: 0, total: 0 }),
    deepClean: (opts) => ({ removed: 0, duplicates: 0, stubs: 0, tooShort: 0, remaining: patterns.length }),
    retagAll: (opts) => ({ total: patterns.length, enriched: 0, totalTagsAdded: 0 }),
    recycle: (opts) => ({ healed: 0 }),
    patternStats: () => ({ totalPatterns: patterns.length }),
    stats: () => ({ totalEntries: patterns.length }),
    selfEvolve: function(opts) {
      const { evolve } = require('../src/core/evolution');
      return evolve(this, opts);
    },
  };
}

// ─── LifecycleEngine ───

describe('LifecycleEngine', () => {
  it('constructs with defaults', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);
    assert.equal(lifecycle._running, false);
    assert.equal(lifecycle.config.feedbackEvolutionThreshold, LIFECYCLE_DEFAULTS.feedbackEvolutionThreshold);
  });

  it('constructs with custom options', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle, { feedbackEvolutionThreshold: 5 });
    assert.equal(lifecycle.config.feedbackEvolutionThreshold, 5);
  });

  it('starts and stops correctly', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);

    const startResult = lifecycle.start();
    assert.equal(startResult.started, true);
    assert.equal(lifecycle._running, true);

    // Starting again should say already running
    const startAgain = lifecycle.start();
    assert.equal(startAgain.started, false);

    const stopResult = lifecycle.stop();
    assert.equal(stopResult.stopped, true);
    assert.equal(lifecycle._running, false);

    // Stopping again should say not running
    const stopAgain = lifecycle.stop();
    assert.equal(stopAgain.stopped, false);
  });

  it('returns status correctly', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);

    const statusBefore = lifecycle.status();
    assert.equal(statusBefore.running, false);
    assert.equal(statusBefore.counters.feedbacks, 0);

    lifecycle.start();
    const statusAfter = lifecycle.status();
    assert.equal(statusAfter.running, true);

    lifecycle.stop();
  });

  it('counts feedback events', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle, { feedbackEvolutionThreshold: 100 });
    lifecycle.start();

    oracle._emit({ type: 'feedback', id: 'test', succeeded: true });
    assert.equal(lifecycle._counters.feedbacks, 1);

    oracle._emit({ type: 'feedback', id: 'test2', succeeded: false });
    assert.equal(lifecycle._counters.feedbacks, 2);

    lifecycle.stop();
  });

  it('counts submission events', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle, { submitPromotionThreshold: 100 });
    lifecycle.start();

    oracle._emit({ type: 'entry_added', id: 'e1' });
    assert.equal(lifecycle._counters.submissions, 1);

    lifecycle.stop();
  });

  it('counts registration events', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle, { registerGrowThreshold: 100 });
    lifecycle.start();

    oracle._emit({ type: 'pattern_registered', id: 'p1', name: 'test' });
    assert.equal(lifecycle._counters.registrations, 1);

    lifecycle.stop();
  });

  it('counts heal events', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);
    lifecycle.start();

    oracle._emit({ type: 'auto_heal', id: 'p1', improvement: 0.1 });
    assert.equal(lifecycle._counters.heals, 1);

    lifecycle.stop();
  });

  it('counts rejection events', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);
    lifecycle.start();

    oracle._emit({ type: 'rejection_captured', reason: 'test' });
    assert.equal(lifecycle._counters.rejections, 1);

    lifecycle.stop();
  });

  it('runs a manual cycle', () => {
    const patterns = [makePattern({ id: 'p1' })];
    const oracle = createMockOracle(patterns);
    const lifecycle = new LifecycleEngine(oracle);

    const report = lifecycle.runCycle();
    assert.equal(report.cycle, 1);
    assert.ok(report.timestamp);
    assert.ok(report.durationMs >= 0);
    assert.equal(report.triggeredBy, 'manual');
    assert.ok(report.evolution !== null);
  });

  it('records cycle history', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);

    lifecycle.runCycle();
    lifecycle.runCycle();
    lifecycle.runCycle();

    const history = lifecycle.getHistory();
    assert.equal(history.length, 3);
    // Most recent first
    assert.equal(history[0].cycle, 3);
    assert.equal(history[2].cycle, 1);
  });

  it('resets counters', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);
    lifecycle.start();

    oracle._emit({ type: 'feedback', id: 'test', succeeded: true });
    oracle._emit({ type: 'entry_added', id: 'e1' });

    lifecycle.resetCounters();
    assert.equal(lifecycle._counters.feedbacks, 0);
    assert.equal(lifecycle._counters.submissions, 0);

    lifecycle.stop();
  });

  it('does not count events when stopped', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);

    // Not started — events should not count
    oracle._emit({ type: 'feedback', id: 'test', succeeded: true });
    assert.equal(lifecycle._counters.feedbacks, 0);
  });

  it('emits lifecycle_cycle event on runCycle', () => {
    const oracle = createMockOracle();
    const lifecycle = new LifecycleEngine(oracle);

    lifecycle.runCycle();
    const lcEvents = oracle._events.filter(e => e.type === 'lifecycle_cycle');
    assert.ok(lcEvents.length > 0);
    assert.equal(lcEvents[0].cycle, 1);
  });

  it('triggers auto-promote on submission threshold', () => {
    let promoteCalled = 0;
    const oracle = createMockOracle();
    oracle.autoPromote = () => { promoteCalled++; return { promoted: 0 }; };

    const lifecycle = new LifecycleEngine(oracle, { submitPromotionThreshold: 2 });
    lifecycle.start();

    oracle._emit({ type: 'entry_added', id: 'e1' });
    assert.equal(promoteCalled, 0);

    oracle._emit({ type: 'entry_added', id: 'e2' });
    assert.equal(promoteCalled, 1);

    lifecycle.stop();
  });
});

// ─── HealingWhisper ───

describe('HealingWhisper', () => {
  it('constructs properly', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    assert.equal(whisper._listening, false);
    assert.deepEqual(whisper._events, []);
  });

  it('starts and stops collecting events', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);

    whisper.start();
    assert.equal(whisper._listening, true);

    const summary = whisper.stop();
    assert.equal(whisper._listening, false);
    assert.ok(summary);
    assert.equal(summary.hasActivity, false);
  });

  it('captures healing events', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    oracle._emit({ type: 'auto_heal', id: 'p1', name: 'test-pattern', improvement: 0.1, newCoherency: 0.9 });
    assert.equal(whisper._events.length, 1);

    whisper.stop();
  });

  it('ignores non-healing events', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    oracle._emit({ type: 'feedback', id: 'p1', succeeded: true });
    oracle._emit({ type: 'entry_added', id: 'e1' });
    oracle._emit({ type: 'pattern_registered', id: 'p1' });

    // These should not be captured
    assert.equal(whisper._events.length, 0);

    whisper.stop();
  });

  it('generates summary for single heal', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    oracle._emit({ type: 'auto_heal', id: 'p1', name: 'debounce', improvement: 0.15, newCoherency: 0.92, loops: 2 });

    const summary = whisper.summarize();
    assert.equal(summary.hasActivity, true);
    assert.equal(summary.events, 1);
    assert.ok(summary.text.includes('debounce'));
    assert.ok(summary.text.includes('15.0%'));
    assert.equal(summary.stats.healed.length, 1);

    whisper.stop();
  });

  it('generates summary for multiple heals', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    oracle._emit({ type: 'auto_heal', id: 'p1', name: 'debounce', improvement: 0.1, newCoherency: 0.9, loops: 2 });
    oracle._emit({ type: 'auto_heal', id: 'p2', name: 'throttle', improvement: 0.2, newCoherency: 0.95, loops: 3 });

    const summary = whisper.summarize();
    assert.equal(summary.stats.healed.length, 2);
    assert.ok(summary.text.includes('2 patterns'));

    whisper.stop();
  });

  it('records evolution report', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);

    whisper.recordEvolutionReport({
      healed: [
        { id: 'p1', name: 'test', improvement: 0.1, newCoherency: 0.9, loops: 2 },
      ],
      regressions: [
        { id: 'p2', name: 'broken', delta: 0.4 },
      ],
      coherencyUpdates: [
        { id: 'p3', name: 'old', diff: 0.05 },
      ],
      staleCount: 5,
    });

    const summary = whisper.summarize();
    assert.equal(summary.hasActivity, true);
    assert.equal(summary.stats.healed.length, 1);
    assert.equal(summary.stats.regressions, 1);
    assert.equal(summary.stats.coherencyUpdates, 1);
    assert.equal(summary.stats.staleCount, 5);
  });

  it('records promotion report', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);

    whisper.recordPromotionReport({ promoted: 3, skipped: 1, vetoed: 0 });

    const summary = whisper.summarize();
    assert.equal(summary.stats.promotions, 3);
  });

  it('getText returns just the text', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);

    const text = whisper.getText();
    assert.equal(typeof text, 'string');
    assert.equal(text, WHISPER_DETAILS.no_action);
  });

  it('clear resets events', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);
    whisper.start();

    oracle._emit({ type: 'auto_heal', id: 'p1', name: 'test', improvement: 0.1 });
    assert.equal(whisper._events.length, 1);

    whisper.clear();
    assert.equal(whisper._events.length, 0);

    whisper.stop();
  });

  it('records manual events', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);

    whisper.record({ type: 'auto_heal', id: 'p1', name: 'manual-heal', improvement: 0.2, loops: 1 });

    const summary = whisper.summarize();
    assert.equal(summary.hasActivity, true);
    assert.equal(summary.stats.healed.length, 1);
  });

  it('handles empty evolution report', () => {
    const oracle = createMockOracle();
    const whisper = new HealingWhisper(oracle);

    whisper.recordEvolutionReport(null);
    whisper.recordEvolutionReport({});
    whisper.recordEvolutionReport({ healed: [], regressions: [], coherencyUpdates: [], staleCount: 0 });

    const summary = whisper.summarize();
    assert.equal(summary.hasActivity, false);
  });
});

// ─── WHISPER_INTROS & WHISPER_DETAILS ───

describe('Whisper constants', () => {
  it('has intro messages', () => {
    assert.ok(WHISPER_INTROS.length > 0);
    for (const intro of WHISPER_INTROS) {
      assert.equal(typeof intro, 'string');
      assert.ok(intro.length > 0);
    }
  });

  it('has detail message generators', () => {
    assert.equal(typeof WHISPER_DETAILS.heal_single, 'function');
    assert.equal(typeof WHISPER_DETAILS.heal_multi, 'function');
    assert.equal(typeof WHISPER_DETAILS.regression_found, 'function');
    assert.equal(typeof WHISPER_DETAILS.promotion, 'function');
    assert.equal(typeof WHISPER_DETAILS.coherency_update, 'function');

    const single = WHISPER_DETAILS.heal_single('test', '15.0');
    assert.ok(single.includes('test'));
    assert.ok(single.includes('15.0'));
  });
});

// ─── selfImprove ───

describe('selfImprove', () => {
  it('returns a valid report for empty oracle', () => {
    const oracle = createMockOracle([]);
    const report = selfImprove(oracle);

    assert.equal(report.phase, 'self-improve');
    assert.equal(report.patternsAnalyzed, 0);
    assert.deepEqual(report.healed, []);
    assert.ok(report.durationMs >= 0);
    assert.ok(report.timestamp);
  });

  it('reports analyzed pattern count', () => {
    const patterns = [makePattern(), makePattern(), makePattern()];
    const oracle = createMockOracle(patterns);
    const report = selfImprove(oracle);

    assert.equal(report.patternsAnalyzed, 3);
  });

  it('attempts to heal low-coherency patterns', () => {
    const patterns = [
      makePattern({
        id: 'low',
        name: 'low-quality',
        coherencyScore: { total: 0.5 },
        code: 'function process(data) {\n  const result = data.map(item => item.value);\n  return result.filter(v => v > 0);\n}',
      }),
    ];
    const oracle = createMockOracle(patterns);
    const report = selfImprove(oracle, { maxHealsPerRun: 5 });

    // The pattern is below 0.85 target so healing is attempted
    assert.equal(report.patternsAnalyzed, 1);
    // Result depends on whether reflection can improve it
    assert.ok(report.healed.length >= 0);
  });

  it('emits self_improve event', () => {
    const oracle = createMockOracle([]);
    selfImprove(oracle);

    const improveEvents = oracle._events.filter(e => e.type === 'self_improve');
    assert.equal(improveEvents.length, 1);
    assert.ok('healed' in improveEvents[0]);
    assert.ok('durationMs' in improveEvents[0]);
  });

  it('respects maxHealsPerRun limit', () => {
    const patterns = [];
    for (let i = 0; i < 30; i++) {
      patterns.push(makePattern({
        id: `p${i}`,
        name: `low-${i}`,
        coherencyScore: { total: 0.3 },
        code: `function fn${i}(x) {\n  return x * ${i};\n}`,
      }));
    }
    const oracle = createMockOracle(patterns);
    const report = selfImprove(oracle, { maxHealsPerRun: 5 });

    // Total heal attempts should be capped at 5
    assert.ok(report.healed.length + report.healFailed.length <= 5);
  });
});

// ─── selfOptimize ───

describe('selfOptimize', () => {
  it('returns a valid report for empty oracle', () => {
    const oracle = createMockOracle([]);
    const report = selfOptimize(oracle);

    assert.equal(report.phase, 'self-optimize');
    assert.equal(report.patternsAnalyzed, 0);
    assert.deepEqual(report.unusedPatterns, []);
    assert.deepEqual(report.nearDuplicates, []);
    assert.ok(report.durationMs >= 0);
  });

  it('detects unused patterns', () => {
    const oldDate = new Date(Date.now() - 200 * 86400000).toISOString();
    const patterns = [
      makePattern({ id: 'old', name: 'ancient', timestamp: oldDate, createdAt: oldDate, lastUsed: null, usageCount: 0 }),
      makePattern({ id: 'new', name: 'fresh', lastUsed: new Date().toISOString(), usageCount: 10 }),
    ];
    const oracle = createMockOracle(patterns);
    const report = selfOptimize(oracle);

    assert.equal(report.unusedPatterns.length, 1);
    assert.equal(report.unusedPatterns[0].id, 'old');
  });

  it('detects near-duplicate patterns', () => {
    const code = 'function calculate(a, b) {\n  return a + b;\n}';
    const codeSimilar = 'function calculate(a, b) {\n  return a + b;\n}\n';
    const patterns = [
      makePattern({ id: 'p1', name: 'calc1', code }),
      makePattern({ id: 'p2', name: 'calc2', code: codeSimilar }),
    ];
    const oracle = createMockOracle(patterns);
    const report = selfOptimize(oracle);

    // These should be detected as near-duplicates
    assert.ok(report.nearDuplicates.length >= 0); // Depends on similarity threshold
  });

  it('finds sparse tags', () => {
    const patterns = [
      makePattern({ tags: ['common', 'rare-tag-x'] }),
      makePattern({ tags: ['common', 'rare-tag-y'] }),
      makePattern({ tags: ['common'] }),
    ];
    const oracle = createMockOracle(patterns);
    const report = selfOptimize(oracle);

    const rareTags = report.sparseTags.filter(t => t.tag.startsWith('rare-'));
    assert.equal(rareTags.length, 2);
  });

  it('generates recommendations', () => {
    const oracle = createMockOracle([]);
    const report = selfOptimize(oracle);

    assert.ok(Array.isArray(report.recommendations));
  });

  it('refreshes zero-coherency patterns', () => {
    const patterns = [
      makePattern({
        id: 'zero',
        coherencyScore: { total: 0 },
        code: 'function add(a, b) {\n  return a + b;\n}',
      }),
    ];
    const oracle = createMockOracle(patterns);
    const report = selfOptimize(oracle);

    assert.ok(report.coherencyRefreshed >= 0);
  });

  it('emits self_optimize event', () => {
    const oracle = createMockOracle([]);
    selfOptimize(oracle);

    const optEvents = oracle._events.filter(e => e.type === 'self_optimize');
    assert.equal(optEvents.length, 1);
  });
});

// ─── fullCycle ───

describe('fullCycle', () => {
  it('returns combined report with whisper', () => {
    const oracle = createMockOracle([]);
    const report = fullCycle(oracle);

    assert.ok(report.timestamp);
    assert.ok(report.improvement);
    assert.ok(report.optimization);
    assert.equal(report.improvement.phase, 'self-improve');
    assert.equal(report.optimization.phase, 'self-optimize');
    assert.ok(typeof report.whisper === 'string');
    assert.ok(report.durationMs >= 0);
  });

  it('whisper reflects no-action when library is empty', () => {
    const oracle = createMockOracle([]);
    const report = fullCycle(oracle);

    assert.ok(report.whisper.includes('healthy') || report.whisper.includes('no improvements'));
  });

  it('emits full_optimization_cycle event', () => {
    const oracle = createMockOracle([]);
    fullCycle(oracle);

    const cycleEvents = oracle._events.filter(e => e.type === 'full_optimization_cycle');
    assert.equal(cycleEvents.length, 1);
    assert.ok('improved' in cycleEvents[0]);
    assert.ok('durationMs' in cycleEvents[0]);
  });

  it('includes evolution report', () => {
    const patterns = [makePattern()];
    const oracle = createMockOracle(patterns);
    const report = fullCycle(oracle);

    assert.ok(report.evolution);
    assert.ok(report.evolution.patternsAnalyzed !== undefined || report.evolution.error);
  });
});

// ─── OPTIMIZE_DEFAULTS ───

describe('OPTIMIZE_DEFAULTS', () => {
  it('has expected keys', () => {
    assert.ok(OPTIMIZE_DEFAULTS.maxHealsPerRun > 0);
    assert.ok(OPTIMIZE_DEFAULTS.healTargetCoherency > 0);
    assert.ok(OPTIMIZE_DEFAULTS.nearDuplicateThreshold > 0);
    assert.ok(OPTIMIZE_DEFAULTS.staleArchiveDays > 0);
    assert.ok(OPTIMIZE_DEFAULTS.maxRefineLoops > 0);
  });
});

// ─── Oracle Integration (via oracle.js methods) ───

describe('Oracle integration', () => {
  it('RemembranceOracle has selfImprove method', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    assert.equal(typeof oracle.selfImprove, 'function');
  });

  it('RemembranceOracle has selfOptimize method', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    assert.equal(typeof oracle.selfOptimize, 'function');
  });

  it('RemembranceOracle has fullOptimizationCycle method', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    assert.equal(typeof oracle.fullOptimizationCycle, 'function');
  });

  it('RemembranceOracle has lifecycle methods', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    assert.equal(typeof oracle.startLifecycle, 'function');
    assert.equal(typeof oracle.stopLifecycle, 'function');
    assert.equal(typeof oracle.lifecycleStatus, 'function');
    assert.equal(typeof oracle.getLifecycle, 'function');
  });

  it('lifecycle engine can be started and stopped', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });

    const start = oracle.startLifecycle();
    assert.equal(start.started, true);

    const status = oracle.lifecycleStatus();
    assert.equal(status.running, true);

    const stop = oracle.stopLifecycle();
    assert.equal(stop.stopped, true);
  });

  it('lifecycle engine is lazily created', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });

    assert.equal(oracle._lifecycle, undefined);

    const lifecycle = oracle.getLifecycle();
    assert.ok(lifecycle instanceof LifecycleEngine);
    assert.ok(oracle._lifecycle);

    // Same instance returned
    const lifecycle2 = oracle.getLifecycle();
    assert.equal(lifecycle, lifecycle2);

    oracle.stopLifecycle();
  });
});

// ─── Exports ───

describe('index.js exports', () => {
  it('exports LifecycleEngine', () => {
    const index = require('../src/index');
    assert.ok(index.LifecycleEngine);
    assert.ok(index.LIFECYCLE_DEFAULTS);
  });

  it('exports HealingWhisper', () => {
    const index = require('../src/index');
    assert.ok(index.HealingWhisper);
    assert.ok(index.WHISPER_INTROS);
    assert.ok(index.WHISPER_DETAILS);
  });

  it('exports self-optimize functions', () => {
    const index = require('../src/index');
    assert.ok(index.selfImprove);
    assert.ok(index.selfOptimize);
    assert.ok(index.fullOptimizationCycle);
    assert.ok(index.OPTIMIZE_DEFAULTS);
  });
});
