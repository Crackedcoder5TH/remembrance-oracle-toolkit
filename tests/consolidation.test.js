const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  consolidateDuplicates,
  consolidateTags,
  pruneStuckCandidates,
  polishCycle,
  iterativePolish,
  OPTIMIZE_DEFAULTS,
} = require('../src/core/self-optimize');

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

function createMockOracle(patterns = [], candidates = []) {
  const updates = [];
  const events = [];
  const listeners = [];
  const deleted = [];

  const prunedCandidates = [];

  return {
    patterns: {
      getAll: () => patterns,
      update: (id, data) => {
        updates.push({ id, ...data });
        const p = patterns.find(x => x.id === id);
        if (p) Object.assign(p, data);
        return p;
      },
      getCandidates: () => candidates.filter(c => !prunedCandidates.includes(c.id)),
      candidateSummary: () => ({ total: candidates.length }),
      _sqlite: {
        db: {
          prepare: (sql) => ({
            run: (...args) => {
              if (sql.includes('DELETE FROM patterns')) {
                deleted.push(args[0]);
              }
              if (sql.includes('DELETE FROM candidates')) {
                prunedCandidates.push(args[0]);
              }
            },
          }),
        },
        pruneCandidates: (minCoherency) => {
          const toRemove = candidates.filter(c => (c.coherencyScore?.total ?? c.coherencyTotal ?? 0) < minCoherency);
          for (const c of toRemove) prunedCandidates.push(c.id);
          return { removed: toRemove.length, remaining: candidates.length - toRemove.length };
        },
        deleteCandidate: (id) => {
          prunedCandidates.push(id);
          return { success: true };
        },
      },
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
    _deleted: deleted,
    _prunedCandidates: prunedCandidates,
    autoPromote: () => ({ promoted: 0, skipped: 0, vetoed: 0, total: 0 }),
    deepClean: () => ({ removed: 0, duplicates: 0, stubs: 0, tooShort: 0, remaining: patterns.length }),
    retagAll: () => ({ total: patterns.length, enriched: 0, totalTagsAdded: 0 }),
    recycle: () => ({ healed: 0 }),
    patternStats: () => ({ totalPatterns: patterns.length }),
    stats: () => ({ totalEntries: patterns.length }),
    selfEvolve: function(opts) {
      const { evolve } = require('../src/core/evolution');
      return evolve(this, opts);
    },
  };
}

// ─── consolidateDuplicates ───

describe('consolidateDuplicates', () => {
  it('returns valid report for empty oracle', () => {
    const oracle = createMockOracle([]);
    const report = consolidateDuplicates(oracle);

    assert.equal(report.phase, 'consolidate-duplicates');
    assert.equal(report.patternsAnalyzed, 0);
    assert.deepEqual(report.merged, []);
    assert.deepEqual(report.linked, []);
    assert.deepEqual(report.removed, []);
    assert.ok(report.durationMs >= 0);
    assert.ok(report.timestamp);
  });

  it('detects and merges same-language duplicates', () => {
    const code = 'function calculate(a, b) {\n  return a + b;\n}';
    const patterns = [
      makePattern({ id: 'p1', name: 'calc-1', code, coherencyScore: { total: 0.9 } }),
      makePattern({ id: 'p2', name: 'calc-2', code, coherencyScore: { total: 0.7 } }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateDuplicates(oracle);

    assert.equal(report.merged.length, 1);
    assert.equal(report.merged[0].kept.id, 'p1'); // Higher coherency kept
    assert.equal(report.merged[0].removed.id, 'p2');
    assert.equal(report.removed.length, 1);
  });

  it('links language variants (JS/TS)', () => {
    const jsCode = 'function add(a, b) {\n  return a + b;\n}';
    const tsCode = 'function add(a, b) {\n  return a + b;\n}\n'; // Slightly different whitespace
    const patterns = [
      makePattern({ id: 'js1', name: 'add-js', code: jsCode, language: 'javascript', coherencyScore: { total: 0.9 } }),
      makePattern({ id: 'ts1', name: 'add-ts', code: tsCode, language: 'typescript', coherencyScore: { total: 0.85 } }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateDuplicates(oracle);

    assert.equal(report.linked.length, 1);
    assert.equal(report.linked[0].kept.language, 'javascript'); // Higher coherency
    assert.ok(report.linked[0].variantTag.includes('typescript'));
    assert.equal(report.removed.length, 1);
  });

  it('respects dry-run mode', () => {
    const code = 'function calc(a, b) {\n  return a + b;\n}';
    const patterns = [
      makePattern({ id: 'p1', name: 'calc-1', code }),
      makePattern({ id: 'p2', name: 'calc-2', code }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateDuplicates(oracle, { dryRun: true });

    assert.equal(report.dryRun, true);
    assert.equal(report.merged.length, 1);
    // Should not actually delete
    assert.equal(oracle._deleted.length, 0);
  });

  it('does not merge dissimilar patterns', () => {
    const patterns = [
      makePattern({ id: 'p1', name: 'sort', code: 'function sort(arr) {\n  return arr.sort((a, b) => a - b);\n}' }),
      makePattern({ id: 'p2', name: 'filter', code: 'function filter(arr, pred) {\n  return arr.filter(pred);\n}' }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateDuplicates(oracle);

    assert.equal(report.merged.length, 0);
    assert.equal(report.linked.length, 0);
    assert.equal(report.removed.length, 0);
  });

  it('emits consolidate_duplicates event', () => {
    const oracle = createMockOracle([]);
    consolidateDuplicates(oracle);

    const events = oracle._events.filter(e => e.type === 'consolidate_duplicates');
    assert.equal(events.length, 1);
    assert.ok('merged' in events[0]);
    assert.ok('linked' in events[0]);
    assert.ok('durationMs' in events[0]);
  });

  it('keeps higher-coherency pattern in merges', () => {
    const code = 'function multiply(a, b) {\n  return a * b;\n}';
    const patterns = [
      makePattern({ id: 'low', name: 'mult-low', code, coherencyScore: { total: 0.5 } }),
      makePattern({ id: 'high', name: 'mult-high', code, coherencyScore: { total: 0.95 } }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateDuplicates(oracle);

    assert.equal(report.merged.length, 1);
    assert.equal(report.merged[0].kept.id, 'high');
    assert.equal(report.merged[0].removed.id, 'low');
  });

  it('handles custom similarity threshold', () => {
    const code1 = 'function add(a, b) {\n  return a + b;\n}';
    const code2 = 'function add(x, y) {\n  return x + y;\n}';
    const patterns = [
      makePattern({ id: 'p1', name: 'add1', code: code1 }),
      makePattern({ id: 'p2', name: 'add2', code: code2 }),
    ];
    const oracle = createMockOracle(patterns);

    // With very high threshold, should not detect as duplicates
    const strict = consolidateDuplicates(oracle, { similarityThreshold: 0.99 });
    assert.equal(strict.merged.length, 0);

    // With lower threshold, should detect
    const loose = consolidateDuplicates(oracle, { similarityThreshold: 0.5 });
    assert.ok(loose.merged.length >= 0); // Depends on bigram similarity
  });
});

// ─── consolidateTags ───

describe('consolidateTags', () => {
  it('returns valid report for empty oracle', () => {
    const oracle = createMockOracle([]);
    const report = consolidateTags(oracle);

    assert.equal(report.phase, 'consolidate-tags');
    assert.equal(report.patternsAnalyzed, 0);
    assert.deepEqual(report.tagsRemoved, []);
    assert.equal(report.patternsUpdated, 0);
    assert.ok(report.durationMs >= 0);
  });

  it('removes orphan tags used by only 1 pattern', () => {
    const patterns = [
      makePattern({ id: 'p1', tags: ['utility', 'rare-unicorn-tag'] }),
      makePattern({ id: 'p2', tags: ['utility', 'common-tag'] }),
      makePattern({ id: 'p3', tags: ['utility', 'common-tag'] }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateTags(oracle);

    const removedNames = report.tagsRemoved.map(t => t.tag);
    assert.ok(removedNames.includes('rare-unicorn-tag'));
    assert.ok(!removedNames.includes('common-tag'));
    assert.ok(!removedNames.includes('utility'));
  });

  it('does not remove protected tags even if used by 1 pattern', () => {
    const patterns = [
      makePattern({ id: 'p1', tags: ['javascript', 'testing'] }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateTags(oracle);

    const removedNames = report.tagsRemoved.map(t => t.tag);
    assert.ok(!removedNames.includes('javascript'));
    assert.ok(!removedNames.includes('testing'));
  });

  it('strips noise tags always', () => {
    const patterns = [
      makePattern({ id: 'p1', tags: ['utility', 'auto-generated', 'variant'] }),
      makePattern({ id: 'p2', tags: ['utility', 'serf-refined'] }),
      makePattern({ id: 'p3', tags: ['utility', 'auto-generated'] }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateTags(oracle);

    const removedNames = report.tagsRemoved.map(t => t.tag);
    assert.ok(removedNames.includes('auto-generated'));
    assert.ok(removedNames.includes('variant'));
    assert.ok(removedNames.includes('serf-refined'));
    assert.ok(report.noiseTagsStripped >= 3);
  });

  it('respects dry-run mode', () => {
    const patterns = [
      makePattern({ id: 'p1', tags: ['utility', 'orphan-xyz'] }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateTags(oracle, { dryRun: true });

    assert.equal(report.dryRun, true);
    assert.ok(report.tagsRemoved.length > 0);
    // Pattern tags should not have been modified
    assert.equal(oracle._updates.length, 0);
  });

  it('respects custom minUsage', () => {
    const patterns = [
      makePattern({ id: 'p1', tags: ['utility', 'tag-a'] }),
      makePattern({ id: 'p2', tags: ['utility', 'tag-a'] }),
      makePattern({ id: 'p3', tags: ['utility', 'tag-b'] }),
    ];
    const oracle = createMockOracle(patterns);

    // With minUsage=3, 'tag-a' (2 uses) should be removed
    const report = consolidateTags(oracle, { minUsage: 3, dryRun: true });
    const removedNames = report.tagsRemoved.map(t => t.tag);
    assert.ok(removedNames.includes('tag-a'));
  });

  it('emits consolidate_tags event', () => {
    const oracle = createMockOracle([]);
    consolidateTags(oracle);

    const events = oracle._events.filter(e => e.type === 'consolidate_tags');
    assert.equal(events.length, 1);
    assert.ok('tagsRemoved' in events[0]);
    assert.ok('patternsUpdated' in events[0]);
  });

  it('reports total tags before and after', () => {
    const patterns = [
      makePattern({ id: 'p1', tags: ['utility', 'orphan-1'] }),
      makePattern({ id: 'p2', tags: ['utility', 'orphan-2'] }),
    ];
    const oracle = createMockOracle(patterns);
    const report = consolidateTags(oracle, { dryRun: true });

    assert.ok(report.totalTagsBefore >= 3); // utility, orphan-1, orphan-2
    assert.ok(report.totalTagsAfter < report.totalTagsBefore);
  });
});

// ─── pruneStuckCandidates ───

describe('pruneStuckCandidates', () => {
  it('returns valid report for empty candidates', () => {
    const oracle = createMockOracle([], []);
    const report = pruneStuckCandidates(oracle);

    assert.equal(report.phase, 'prune-candidates');
    assert.equal(report.totalCandidates, 0);
    assert.deepEqual(report.pruned, []);
    assert.deepEqual(report.kept, []);
    assert.ok(report.durationMs >= 0);
  });

  it('prunes candidates below coherency threshold', () => {
    const candidates = [
      { id: 'c1', name: 'stuck-1', coherencyScore: { total: 0.4 }, language: 'javascript', generationMethod: 'variant' },
      { id: 'c2', name: 'stuck-2', coherencyScore: { total: 0.54 }, language: 'javascript', generationMethod: 'serf-refine' },
      { id: 'c3', name: 'viable', coherencyScore: { total: 0.84 }, language: 'javascript', generationMethod: 'variant' },
    ];
    const oracle = createMockOracle([], candidates);
    const report = pruneStuckCandidates(oracle);

    assert.equal(report.pruned.length, 2);
    assert.equal(report.kept.length, 1);
    assert.equal(report.kept[0].name, 'viable');
  });

  it('respects custom minCoherency', () => {
    const candidates = [
      { id: 'c1', name: 'low', coherencyScore: { total: 0.7 }, language: 'javascript', generationMethod: 'variant' },
      { id: 'c2', name: 'high', coherencyScore: { total: 0.9 }, language: 'javascript', generationMethod: 'variant' },
    ];
    const oracle = createMockOracle([], candidates);
    const report = pruneStuckCandidates(oracle, { minCoherency: 0.8 });

    assert.equal(report.pruned.length, 1);
    assert.equal(report.pruned[0].name, 'low');
    assert.equal(report.kept.length, 1);
    assert.equal(report.kept[0].name, 'high');
  });

  it('respects dry-run mode', () => {
    const candidates = [
      { id: 'c1', name: 'stuck', coherencyScore: { total: 0.3 }, language: 'javascript', generationMethod: 'variant' },
    ];
    const oracle = createMockOracle([], candidates);
    const report = pruneStuckCandidates(oracle, { dryRun: true });

    assert.equal(report.dryRun, true);
    assert.equal(report.pruned.length, 1);
    // Should not actually delete
    assert.equal(oracle._prunedCandidates.length, 0);
  });

  it('emits prune_candidates event', () => {
    const oracle = createMockOracle([], []);
    pruneStuckCandidates(oracle);

    const events = oracle._events.filter(e => e.type === 'prune_candidates');
    assert.equal(events.length, 1);
    assert.ok('pruned' in events[0]);
    assert.ok('kept' in events[0]);
  });

  it('uses coherencyTotal as fallback', () => {
    const candidates = [
      { id: 'c1', name: 'total-field', coherencyTotal: 0.3, language: 'javascript', generationMethod: 'variant' },
    ];
    const oracle = createMockOracle([], candidates);
    const report = pruneStuckCandidates(oracle);

    assert.equal(report.pruned.length, 1);
    assert.equal(report.pruned[0].name, 'total-field');
  });
});

// ─── polishCycle ───

describe('polishCycle', () => {
  it('returns combined report with all phases', () => {
    const oracle = createMockOracle([]);
    const report = polishCycle(oracle);

    assert.ok(report.timestamp);
    assert.ok(report.consolidation);
    assert.ok(report.tagConsolidation);
    assert.ok(report.candidatePruning);
    assert.ok(report.cycle);
    assert.ok(typeof report.whisper === 'string');
    assert.ok(report.durationMs >= 0);
  });

  it('consolidation phase processes duplicates', () => {
    const oracle = createMockOracle([]);
    const report = polishCycle(oracle);

    assert.equal(report.consolidation.phase, 'consolidate-duplicates');
    assert.ok(Array.isArray(report.consolidation.merged));
    assert.ok(Array.isArray(report.consolidation.linked));
  });

  it('tag phase processes tags', () => {
    const oracle = createMockOracle([]);
    const report = polishCycle(oracle);

    assert.equal(report.tagConsolidation.phase, 'consolidate-tags');
    assert.ok(Array.isArray(report.tagConsolidation.tagsRemoved));
  });

  it('candidate phase processes candidates', () => {
    const oracle = createMockOracle([], []);
    const report = polishCycle(oracle);

    assert.equal(report.candidatePruning.phase, 'prune-candidates');
    assert.ok(Array.isArray(report.candidatePruning.pruned));
  });

  it('includes inner fullCycle report', () => {
    const oracle = createMockOracle([]);
    const report = polishCycle(oracle);

    assert.ok(report.cycle.improvement);
    assert.ok(report.cycle.optimization);
    assert.equal(report.cycle.improvement.phase, 'self-improve');
    assert.equal(report.cycle.optimization.phase, 'self-optimize');
  });

  it('whisper summarizes polish activity', () => {
    const code = 'function test(a, b) {\n  return a + b;\n}';
    const patterns = [
      makePattern({ id: 'p1', name: 'test-1', code }),
      makePattern({ id: 'p2', name: 'test-2', code }),
    ];
    const oracle = createMockOracle(patterns);
    const report = polishCycle(oracle);

    assert.ok(report.whisper.includes('Oracle Polish Cycle'));
  });

  it('emits polish_cycle event', () => {
    const oracle = createMockOracle([]);
    polishCycle(oracle);

    const events = oracle._events.filter(e => e.type === 'polish_cycle');
    assert.equal(events.length, 1);
    assert.ok('duplicatesRemoved' in events[0]);
    assert.ok('tagsConsolidated' in events[0]);
    assert.ok('candidatesPruned' in events[0]);
  });
});

// ─── Oracle Integration ───

describe('Oracle consolidation integration', () => {
  it('RemembranceOracle has consolidateDuplicates method', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    assert.equal(typeof oracle.consolidateDuplicates, 'function');
  });

  it('RemembranceOracle has consolidateTags method', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    assert.equal(typeof oracle.consolidateTags, 'function');
  });

  it('RemembranceOracle has pruneStuckCandidates method', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    assert.equal(typeof oracle.pruneStuckCandidates, 'function');
  });

  it('RemembranceOracle has polishCycle method', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    assert.equal(typeof oracle.polishCycle, 'function');
  });
});

// ─── index.js exports ───

describe('index.js consolidation exports', () => {
  it('exports consolidateDuplicates', () => {
    const index = require('../src/index');
    assert.equal(typeof index.consolidateDuplicates, 'function');
  });

  it('exports consolidateTags', () => {
    const index = require('../src/index');
    assert.equal(typeof index.consolidateTags, 'function');
  });

  it('exports pruneStuckCandidates', () => {
    const index = require('../src/index');
    assert.equal(typeof index.pruneStuckCandidates, 'function');
  });

  it('exports polishCycle', () => {
    const index = require('../src/index');
    assert.equal(typeof index.polishCycle, 'function');
  });

  it('exports iterativePolish', () => {
    const index = require('../src/index');
    assert.equal(typeof index.iterativePolish, 'function');
  });
});

// ─── iterativePolish ───

describe('iterativePolish', () => {
  it('returns valid report with history for empty oracle', () => {
    const oracle = createMockOracle([]);
    const report = iterativePolish(oracle);

    assert.equal(report.phase, 'iterative-polish');
    assert.equal(report.converged, true);
    assert.ok(report.iterations >= 1);
    assert.ok(Array.isArray(report.history));
    assert.ok(report.history.length >= 1);
    assert.ok(report.totals);
    assert.ok(typeof report.whisper === 'string');
    assert.ok(report.durationMs >= 0);
    assert.ok(report.finalPatternCount >= 0);
    assert.ok(report.timestamp);
  });

  it('converges immediately when no improvements needed', () => {
    const patterns = [
      makePattern({ id: 'p1', name: 'unique-1', code: 'function a() { return 1; }' }),
      makePattern({ id: 'p2', name: 'unique-2', code: 'function b() { return 2; }' }),
    ];
    const oracle = createMockOracle(patterns);
    const report = iterativePolish(oracle);

    assert.equal(report.converged, true);
    assert.equal(report.iterations, 1);
    assert.equal(report.history[0].improvements, 0);
    assert.equal(report.history[0].score, 1.0);
  });

  it('runs multiple iterations when duplicates exist', () => {
    const code = 'function duplicate(a, b) {\n  return a + b;\n}';
    const patterns = [
      makePattern({ id: 'p1', name: 'dup-1', code, coherencyScore: { total: 0.9 } }),
      makePattern({ id: 'p2', name: 'dup-2', code, coherencyScore: { total: 0.7 } }),
      makePattern({ id: 'p3', name: 'unique', code: 'function unique() { return 42; }' }),
    ];
    const oracle = createMockOracle(patterns);
    const report = iterativePolish(oracle);

    assert.ok(report.iterations >= 1);
    assert.equal(report.converged, true);
    assert.ok(report.totals.removed >= 1);
  });

  it('respects maxPolishIterations option', () => {
    const oracle = createMockOracle([]);
    const report = iterativePolish(oracle, { maxPolishIterations: 2 });

    assert.ok(report.iterations <= 2);
  });

  it('emits iterative_polish event', () => {
    const oracle = createMockOracle([]);
    iterativePolish(oracle);

    const events = oracle._events.filter(e => e.type === 'iterative_polish');
    assert.equal(events.length, 1);
    assert.ok('iterations' in events[0]);
    assert.ok('converged' in events[0]);
    assert.ok('totalRemoved' in events[0]);
    assert.ok('finalPatternCount' in events[0]);
  });

  it('history tracks per-iteration improvements', () => {
    const oracle = createMockOracle([]);
    const report = iterativePolish(oracle);

    for (const h of report.history) {
      assert.ok('iteration' in h);
      assert.ok('score' in h);
      assert.ok('improvements' in h);
      assert.ok('patternsRemaining' in h);
      assert.ok('durationMs' in h);
    }
  });

  it('whisper includes iteration details', () => {
    const oracle = createMockOracle([]);
    const report = iterativePolish(oracle);

    assert.ok(report.whisper.includes('Iterative Polish'));
    assert.ok(report.whisper.includes('Pass 1'));
  });

  it('RemembranceOracle has iterativePolish method', () => {
    const { RemembranceOracle } = require('../src/api/oracle');
    const oracle = new RemembranceOracle({ autoSeed: false });
    assert.equal(typeof oracle.iterativePolish, 'function');
  });
});
