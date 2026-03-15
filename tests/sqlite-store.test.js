'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const { makeTempDir, cleanTempDir } = require('./helpers');
const { SQLiteStore, DatabaseSync } = require('../src/store/sqlite');

if (!DatabaseSync) {
  describe('SQLiteStore (skipped — no node:sqlite)', () => {
    it('skips all tests', () => assert.ok(true));
  });
} else {

let store, tmpDir;

function freshStore() {
  tmpDir = makeTempDir('sqlite-store');
  store = new SQLiteStore(tmpDir);
  return store;
}

function makeEntry(overrides = {}) {
  return {
    code: overrides.code || 'function add(a, b) { return a + b; }',
    language: overrides.language || 'javascript',
    description: overrides.description || 'adds two numbers',
    tags: overrides.tags || ['math', 'utility'],
    author: overrides.author || 'tester',
    coherencyScore: overrides.coherencyScore || { total: 0.85 },
    testPassed: overrides.testPassed ?? true,
    testOutput: overrides.testOutput || 'ok',
  };
}

function makePatternObj(overrides = {}) {
  return {
    name: overrides.name || 'test-pattern',
    code: overrides.code || 'function mul(a, b) { return a * b; }',
    language: overrides.language || 'javascript',
    patternType: overrides.patternType || 'utility',
    complexity: overrides.complexity || 'composite',
    description: overrides.description || 'multiplies',
    tags: overrides.tags || ['math'],
    coherencyScore: overrides.coherencyScore || { total: 0.85 },
    variants: overrides.variants || [],
    testCode: overrides.testCode || 'assert(mul(2,3)===6)',
    requires: overrides.requires || [],
    composedOf: overrides.composedOf || [],
  };
}

function makeCandidateObj(overrides = {}) {
  return {
    name: overrides.name || 'candidate-one',
    code: overrides.code || 'function sub(a, b) { return a - b; }',
    language: overrides.language || 'javascript',
    patternType: overrides.patternType || 'utility',
    complexity: overrides.complexity || 'composite',
    description: overrides.description || 'subtracts',
    tags: overrides.tags || ['math'],
    coherencyScore: overrides.coherencyScore || { total: 0.7 },
    testCode: overrides.testCode || 'assert(sub(5,3)===2)',
    parentPattern: overrides.parentPattern || null,
    generationMethod: overrides.generationMethod || 'variant',
  };
}

describe('SQLiteStore', () => {
  beforeEach(() => freshStore());
  afterEach(() => { store.close(); cleanTempDir(tmpDir); });

  // ─── Entry CRUD ───────────────────────────────────────────────────────

  describe('Entry CRUD', () => {
    it('addEntry returns entry with id and fields', () => {
      const e = store.addEntry(makeEntry());
      assert.ok(e.id);
      assert.equal(e.code, 'function add(a, b) { return a + b; }');
      assert.equal(e.language, 'javascript');
      assert.deepEqual(e.tags, ['math', 'utility']);
      assert.equal(e.author, 'tester');
      assert.equal(e.coherencyScore.total, 0.85);
      assert.equal(e.validation.testPassed, true);
    });

    it('getEntry retrieves by id, returns null for missing', () => {
      const e = store.addEntry(makeEntry());
      assert.ok(store.getEntry(e.id));
      assert.equal(store.getEntry('nonexistent'), null);
    });

    it('getAllEntries with language and minCoherency filters', () => {
      store.addEntry(makeEntry({ language: 'javascript', coherencyScore: { total: 0.9 } }));
      store.addEntry(makeEntry({ language: 'python', code: 'def f(): pass', coherencyScore: { total: 0.5 } }));
      assert.equal(store.getAllEntries({ language: 'python' }).length, 1);
      assert.equal(store.getAllEntries({ minCoherency: 0.8 }).length, 1);
      assert.equal(store.getAllEntries({ tags: ['math'] }).length, 2);
    });

    it('recordEntryUsage updates reliability', () => {
      const e = store.addEntry(makeEntry());
      const u1 = store.recordEntryUsage(e.id, true);
      assert.equal(u1.reliability.timesUsed, 1);
      assert.equal(u1.reliability.timesSucceeded, 1);
      assert.equal(u1.reliability.historicalScore, 1.0);
      const u2 = store.recordEntryUsage(e.id, false);
      assert.equal(u2.reliability.timesUsed, 2);
      assert.equal(u2.reliability.timesSucceeded, 1);
      assert.equal(u2.reliability.historicalScore, 0.5);
      assert.equal(store.recordEntryUsage('missing', true), null);
    });

    it('pruneEntries removes low-coherency entries', () => {
      store.addEntry(makeEntry({ coherencyScore: { total: 0.3 } }));
      store.addEntry(makeEntry({ coherencyScore: { total: 0.9 }, code: 'x()' }));
      const result = store.pruneEntries(0.5);
      assert.equal(result.removed, 1);
      assert.equal(result.remaining, 1);
    });

    it('entrySummary returns aggregate stats', () => {
      store.addEntry(makeEntry());
      const s = store.entrySummary();
      assert.equal(s.totalEntries, 1);
      assert.ok(s.languages.includes('javascript'));
      assert.ok(s.avgCoherency > 0);
    });
  });

  // ─── Pattern CRUD ─────────────────────────────────────────────────────

  describe('Pattern CRUD', () => {
    it('addPattern inserts and returns pattern with all fields', () => {
      const p = store.addPattern(makePatternObj());
      assert.ok(p.id);
      assert.equal(p.name, 'test-pattern');
      assert.equal(p.language, 'javascript');
      assert.equal(p.patternType, 'utility');
      assert.equal(p.coherencyScore.total, 0.85);
      assert.equal(p.testCode, 'assert(mul(2,3)===6)');
      assert.deepEqual(p.tags, ['math']);
    });

    it('addPatternIfNotExists skips lower-coherency duplicate', () => {
      store.addPattern(makePatternObj({ coherencyScore: { total: 0.9 } }));
      const dup = store.addPatternIfNotExists(makePatternObj({ coherencyScore: { total: 0.7 } }));
      assert.equal(dup, null);
      assert.equal(store.getAllPatterns().length, 1);
    });

    it('addPatternIfNotExists updates when new coherency is higher', () => {
      store.addPattern(makePatternObj({ coherencyScore: { total: 0.6 } }));
      const updated = store.addPatternIfNotExists(
        makePatternObj({ coherencyScore: { total: 0.95 }, code: 'function mul2(a,b){return a*b}' })
      );
      assert.ok(updated);
      assert.equal(updated.coherencyScore.total, 0.95);
      assert.equal(store.getAllPatterns().length, 1);
    });

    it('getPattern and getPatternByName', () => {
      const p = store.addPattern(makePatternObj({ name: 'find-me' }));
      assert.ok(store.getPattern(p.id));
      assert.equal(store.getPattern('nope'), null);
      assert.ok(store.getPatternByName('find-me'));
      assert.ok(store.getPatternByName('FIND-ME')); // case-insensitive
      assert.equal(store.getPatternByName('nope'), null);
    });

    it('getAllPatterns with filters', () => {
      store.addPattern(makePatternObj({ name: 'a', language: 'javascript', coherencyScore: { total: 0.9 } }));
      store.addPattern(makePatternObj({ name: 'b', language: 'python', code: 'def f(): pass', coherencyScore: { total: 0.5 } }));
      assert.equal(store.getAllPatterns({ language: 'python' }).length, 1);
      assert.equal(store.getAllPatterns({ minCoherency: 0.8 }).length, 1);
      assert.equal(store.getAllPatterns().length, 2);
    });

    it('updatePattern modifies fields', () => {
      const p = store.addPattern(makePatternObj());
      const updated = store.updatePattern(p.id, { description: 'updated desc', bugReports: 3 });
      assert.equal(updated.description, 'updated desc');
      assert.equal(updated.bugReports, 3);
      assert.equal(store.updatePattern('missing', { description: 'x' }), null);
    });

    it('recordPatternUsage increments counts', () => {
      const p = store.addPattern(makePatternObj());
      const u = store.recordPatternUsage(p.id, true);
      assert.equal(u.usageCount, 1);
      assert.equal(u.successCount, 1);
      assert.equal(store.recordPatternUsage('missing', true), null);
    });
  });

  // ─── Candidate Lifecycle ──────────────────────────────────────────────

  describe('Candidate lifecycle', () => {
    it('addCandidate stores and retrieves candidate', () => {
      const c = store.addCandidate(makeCandidateObj());
      assert.ok(c.id);
      assert.equal(c.name, 'candidate-one');
      assert.equal(c.generationMethod, 'variant');
      assert.equal(c.coherencyTotal, 0.7);
      assert.equal(c.promotedAt, null);
    });

    it('getCandidate and getCandidateByName', () => {
      const c = store.addCandidate(makeCandidateObj({ name: 'lookup-me' }));
      assert.ok(store.getCandidate(c.id));
      assert.equal(store.getCandidate('nope'), null);
      assert.ok(store.getCandidateByName('lookup-me'));
      assert.equal(store.getCandidateByName('nope'), null);
    });

    it('getAllCandidates with filters', () => {
      store.addCandidate(makeCandidateObj({ name: 'c1', language: 'javascript', coherencyScore: { total: 0.8 } }));
      store.addCandidate(makeCandidateObj({ name: 'c2', language: 'python', code: 'def f(): pass', coherencyScore: { total: 0.5 } }));
      assert.equal(store.getAllCandidates({ language: 'python' }).length, 1);
      assert.equal(store.getAllCandidates({ minCoherency: 0.7 }).length, 1);
    });

    it('promoteCandidate sets promotedAt and excludes from getAllCandidates', () => {
      const c = store.addCandidate(makeCandidateObj());
      const promoted = store.promoteCandidate(c.id);
      assert.ok(promoted.promotedAt);
      assert.equal(store.getAllCandidates().length, 0); // promoted ones excluded
      assert.equal(store.promoteCandidate('missing'), null);
    });

    it('pruneCandidates removes low-coherency unpromoted candidates', () => {
      store.addCandidate(makeCandidateObj({ name: 'low', coherencyScore: { total: 0.3 } }));
      store.addCandidate(makeCandidateObj({ name: 'high', coherencyScore: { total: 0.9 }, code: 'x()' }));
      const result = store.pruneCandidates(0.5);
      assert.equal(result.removed, 1);
      assert.equal(result.remaining, 1);
    });

    it('candidateSummary returns aggregate stats', () => {
      store.addCandidate(makeCandidateObj());
      const s = store.candidateSummary();
      assert.equal(s.totalCandidates, 1);
      assert.ok(s.byLanguage.javascript >= 1);
    });
  });

  // ─── Voting ───────────────────────────────────────────────────────────

  describe('Voting', () => {
    it('votePattern upvote and downvote', () => {
      const p = store.addPattern(makePatternObj());
      const up = store.votePattern(p.id, 'alice', 1);
      assert.equal(up.success, true);
      assert.equal(up.upvotes, 1);
      assert.equal(up.downvotes, 0);

      const down = store.votePattern(p.id, 'bob', -1);
      assert.equal(down.success, true);
      assert.equal(down.upvotes, 1);
      assert.equal(down.downvotes, 1);
    });

    it('rejects duplicate vote in same direction', () => {
      const p = store.addPattern(makePatternObj());
      store.votePattern(p.id, 'alice', 1);
      const dup = store.votePattern(p.id, 'alice', 1);
      assert.equal(dup.success, false);
      assert.equal(dup.error, 'Already voted');
    });

    it('allows changing vote direction', () => {
      const p = store.addPattern(makePatternObj());
      store.votePattern(p.id, 'alice', 1);
      const changed = store.votePattern(p.id, 'alice', -1);
      assert.equal(changed.success, true);
      assert.equal(changed.upvotes, 0);
      assert.equal(changed.downvotes, 1);
    });

    it('votePattern returns error for missing pattern', () => {
      const r = store.votePattern('nonexistent', 'alice', 1);
      assert.equal(r.success, false);
    });

    it('getVotes returns counts and weighted score', () => {
      const p = store.addPattern(makePatternObj());
      store.votePattern(p.id, 'alice', 1);
      store.votePattern(p.id, 'bob', -1);
      const v = store.getVotes(p.id);
      assert.equal(v.upvotes, 1);
      assert.equal(v.downvotes, 1);
      assert.equal(v.voteScore, 0);
      assert.equal(store.getVotes('missing'), null);
    });

    it('topVoted returns patterns ordered by score', () => {
      const p1 = store.addPattern(makePatternObj({ name: 'popular' }));
      store.addPattern(makePatternObj({ name: 'unpopular', code: 'x()' }));
      store.votePattern(p1.id, 'alice', 1);
      const top = store.topVoted(2);
      assert.equal(top[0].name, 'popular');
    });

    it('voter reputation: getVoter creates profile, getVoteWeight returns weight', () => {
      const voter = store.getVoter('new-user');
      assert.equal(voter.reputation, 1.0);
      assert.equal(voter.total_votes, 0);
      const weight = store.getVoteWeight('new-user');
      assert.equal(weight, 1.0);
    });

    it('updateVoterReputation adjusts reputation on feedback', () => {
      const p = store.addPattern(makePatternObj());
      store.votePattern(p.id, 'alice', 1);
      store.updateVoterReputation(p.id, true); // succeeded — alice upvoted, good judgment
      const voter = store.getVoter('alice');
      assert.ok(voter.reputation > 1.0);
      assert.equal(voter.accurate_votes, 1);
    });

    it('topVoters and getVoterHistory', () => {
      const p = store.addPattern(makePatternObj());
      store.votePattern(p.id, 'alice', 1);
      const top = store.topVoters(5);
      assert.ok(top.length >= 1);
      const history = store.getVoterHistory('alice', 10);
      assert.equal(history.length, 1);
      assert.equal(history[0].pattern_name, 'test-pattern');
    });
  });

  // ─── Healing ──────────────────────────────────────────────────────────

  describe('Healing', () => {
    it('addHealedVariant and getHealedVariants', () => {
      const p = store.addPattern(makePatternObj());
      const v = store.addHealedVariant({
        parentPatternId: p.id,
        healedCode: 'function mul(a,b){return a*b;}',
        originalCoherency: 0.6,
        healedCoherency: 0.9,
        healingLoops: 2,
        healingStrategy: 'refactor',
      });
      assert.ok(v.id);
      assert.equal(v.coherencyDelta, 0.30000000000000004); // float math
      const variants = store.getHealedVariants(p.id);
      assert.equal(variants.length, 1);
    });

    it('getBestHealedVariant returns highest coherency', () => {
      const p = store.addPattern(makePatternObj());
      store.addHealedVariant({ parentPatternId: p.id, healedCode: 'v1', originalCoherency: 0.5, healedCoherency: 0.7 });
      store.addHealedVariant({ parentPatternId: p.id, healedCode: 'v2', originalCoherency: 0.5, healedCoherency: 0.95 });
      const best = store.getBestHealedVariant(p.id);
      assert.equal(best.healedCoherency, 0.95);
      assert.equal(store.getBestHealedVariant('missing'), null);
    });

    it('getHealingLineage returns full lineage', () => {
      const p = store.addPattern(makePatternObj({ name: 'heal-target' }));
      store.addHealedVariant({ parentPatternId: p.id, healedCode: 'v1', originalCoherency: 0.5, healedCoherency: 0.8 });
      const lineage = store.getHealingLineage(p.id);
      assert.equal(lineage.patternName, 'heal-target');
      assert.equal(lineage.healingCount, 1);
      assert.ok(lineage.totalImprovement !== 0);
    });

    it('recordHealingAttempt and getHealingSuccessRate', () => {
      store.recordHealingAttempt({ patternId: 'p1', succeeded: true, coherencyBefore: 0.5, coherencyAfter: 0.8 });
      store.recordHealingAttempt({ patternId: 'p1', succeeded: false, coherencyBefore: 0.5, coherencyAfter: 0.4 });
      assert.equal(store.getHealingSuccessRate('p1'), 0.5);
      assert.equal(store.getHealingSuccessRate('unknown'), 1.0); // optimistic default
    });

    it('getPatternHealingStats returns detailed stats', () => {
      store.recordHealingAttempt({ patternId: 'p1', succeeded: true, coherencyBefore: 0.5, coherencyAfter: 0.9, healingLoops: 3 });
      const stats = store.getPatternHealingStats('p1');
      assert.equal(stats.attempts, 1);
      assert.equal(stats.successes, 1);
      assert.equal(stats.rate, 1.0);
      assert.equal(stats.peakCoherency, 0.9);
      assert.equal(stats.history.length, 1);
      assert.equal(stats.history[0].succeeded, true);
    });

    it('getAllHealingStats returns aggregate', () => {
      store.recordHealingAttempt({ patternId: 'p1', succeeded: true, coherencyBefore: 0.5, coherencyAfter: 0.8 });
      store.recordHealingAttempt({ patternId: 'p2', succeeded: false, coherencyBefore: 0.4, coherencyAfter: 0.3 });
      const all = store.getAllHealingStats();
      assert.equal(all.totalAttempts, 2);
      assert.equal(all.totalSuccesses, 1);
      assert.equal(all.patterns, 2);
    });

    it('queryHealingImprovement filters by delta', () => {
      store.recordHealingAttempt({ patternId: 'p1', succeeded: true, coherencyBefore: 0.5, coherencyAfter: 0.9 });
      store.recordHealingAttempt({ patternId: 'p2', succeeded: true, coherencyBefore: 0.7, coherencyAfter: 0.75 });
      const improved = store.queryHealingImprovement(0.2);
      assert.equal(improved.length, 1);
      assert.equal(improved[0].id, 'p1');
    });

    it('getHealingCompositeBoost returns 1.0 for no history, boosted for successes', () => {
      assert.equal(store.getHealingCompositeBoost('no-history'), 1.0);
      store.recordHealingAttempt({ patternId: 'p1', succeeded: true, coherencyBefore: 0.5, coherencyAfter: 0.9 });
      const boost = store.getHealingCompositeBoost('p1');
      assert.ok(boost >= 1.0);
    });
  });

  // ─── Meta ─────────────────────────────────────────────────────────────

  describe('Meta', () => {
    it('getMeta and setMeta', () => {
      store.setMeta('foo', 'bar');
      assert.equal(store.getMeta('foo'), 'bar');
      assert.equal(store.getMeta('nonexistent'), null);
    });

    it('setMeta overwrites existing value', () => {
      store.setMeta('key', 'v1');
      store.setMeta('key', 'v2');
      assert.equal(store.getMeta('key'), 'v2');
    });

    it('incrementDecisions increments counter', () => {
      const v1 = store.incrementDecisions();
      const v2 = store.incrementDecisions();
      assert.equal(v2, v1 + 1);
    });
  });

  // ─── Archive ──────────────────────────────────────────────────────────

  describe('Archive', () => {
    it('_archivePattern and listArchived', () => {
      const p = store.addPattern(makePatternObj({ name: 'to-archive' }));
      const row = store.db.prepare('SELECT * FROM patterns WHERE id = ?').get(p.id);
      store._archivePattern(row, 'test-reason');
      const archived = store.listArchived();
      assert.ok(archived.length >= 1);
      assert.equal(archived[0].deleted_reason, 'test-reason');
    });

    it('restoreArchived restores a deleted pattern', () => {
      const p = store.addPattern(makePatternObj({ name: 'restore-me' }));
      const row = store.db.prepare('SELECT * FROM patterns WHERE id = ?').get(p.id);
      store._archivePattern(row, 'test');
      store.db.prepare('DELETE FROM patterns WHERE id = ?').run(p.id);
      assert.equal(store.getPattern(p.id), null);
      const result = store.restoreArchived({ id: p.id });
      assert.equal(result.restored, 1);
      assert.ok(store.getPattern(p.id));
    });

    it('restoreArchived skips if pattern already exists', () => {
      const p = store.addPattern(makePatternObj({ name: 'skip-restore' }));
      const row = store.db.prepare('SELECT * FROM patterns WHERE id = ?').get(p.id);
      store._archivePattern(row, 'test');
      const result = store.restoreArchived({ id: p.id });
      assert.equal(result.skipped, 1);
      assert.equal(result.restored, 0);
    });
  });

  // ─── Deduplication ────────────────────────────────────────────────────

  describe('Deduplication', () => {
    it('deduplicatePatterns keeps highest coherency', () => {
      // Insert directly to bypass unique constraint for testing
      const insert = store.db.prepare(`
        INSERT INTO patterns (id, name, code, language, pattern_type, complexity,
          description, tags, coherency_total, coherency_json, variants, test_code,
          usage_count, success_count, evolution_history, requires, composed_of,
          version, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'utility', 'composite', '', '[]', ?, '{}', '[]', NULL,
          0, 0, '[]', '[]', '[]', 1, ?, ?)
      `);
      const now = new Date().toISOString();
      // Must use different exact names for the unique index (drop it first)
      try { store.db.exec('DROP INDEX idx_patterns_unique_name_lang'); } catch {}
      insert.run('id-low', 'dup-name', 'code1', 'javascript', 0.5, now, now);
      insert.run('id-high', 'dup-name', 'code2', 'javascript', 0.9, now, now);

      const result = store.deduplicatePatterns();
      assert.equal(result.removed, 1);
      assert.equal(result.kept, 1);
      const remaining = store.getAllPatterns();
      assert.equal(remaining[0].coherencyScore.total || remaining[0].id, 'id-high');
    });

    it('retirePatterns removes low-composite-score patterns', () => {
      store.addPattern(makePatternObj({ name: 'retiree', coherencyScore: { total: 0.1 } }));
      store.addPattern(makePatternObj({ name: 'keeper', code: 'k()', coherencyScore: { total: 0.9 } }));
      const result = store.retirePatterns(0.30);
      assert.equal(result.retired, 1);
      assert.equal(result.remaining, 1);
    });
  });

  // ─── Fractal / Holo ───────────────────────────────────────────────────

  describe('Fractal and Holographic', () => {
    it('storeTemplate, getTemplate, getAllTemplates', () => {
      store.storeTemplate({ id: 't1', skeleton: 'function __NAME__() {}', language: 'javascript', memberCount: 5, avgCoherency: 0.8 });
      const t = store.getTemplate('t1');
      assert.equal(t.skeleton, 'function __NAME__() {}');
      assert.equal(t.memberCount, 5);
      assert.equal(store.getTemplate('missing'), null);
      const all = store.getAllTemplates();
      assert.equal(all.length, 1);
    });

    it('storeDelta, getDelta, getDeltasByTemplate', () => {
      store.storeDelta({ patternId: 'p1', templateId: 't1', delta: { name: 'add' }, originalSize: 100, deltaSize: 20 });
      const d = store.getDelta('p1');
      assert.deepEqual(d.delta, { name: 'add' });
      assert.equal(d.originalSize, 100);
      assert.equal(store.getDelta('missing'), null);
      const byT = store.getDeltasByTemplate('t1');
      assert.equal(byT.length, 1);
    });

    it('storeHoloPage, getHoloPage, getAllHoloPages', () => {
      store.storeHoloPage({ id: 'hp1', templateId: 't1', centroidVec: [0.1, 0.2], memberIds: ['p1', 'p2'], memberCount: 2 });
      const hp = store.getHoloPage('hp1');
      assert.deepEqual(hp.centroidVec, [0.1, 0.2]);
      assert.deepEqual(hp.memberIds, ['p1', 'p2']);
      assert.equal(store.getHoloPage('missing'), null);
      assert.equal(store.getAllHoloPages().length, 1);
    });

    it('storeHoloEmbedding, getHoloEmbedding, getAllHoloEmbeddings', () => {
      store.storeHoloEmbedding('p1', [0.5, 0.6, 0.7], 2);
      const emb = store.getHoloEmbedding('p1');
      assert.deepEqual(emb.embeddingVec, [0.5, 0.6, 0.7]);
      assert.equal(emb.version, 2);
      assert.equal(store.getHoloEmbedding('missing'), null);
      assert.equal(store.getAllHoloEmbeddings().length, 1);
    });

    it('fractalStats returns correct counts', () => {
      store.storeTemplate({ id: 't1', skeleton: 'sk', memberCount: 1, avgCoherency: 0.8 });
      store.storeDelta({ patternId: 'p1', templateId: 't1', delta: {}, originalSize: 100, deltaSize: 20 });
      store.storeHoloPage({ id: 'hp1', centroidVec: [0.1], memberIds: ['p1'], memberCount: 1 });
      store.storeHoloEmbedding('p1', [0.5]);
      const stats = store.fractalStats();
      assert.equal(stats.templateCount, 1);
      assert.equal(stats.deltaCount, 1);
      assert.equal(stats.pageCount, 1);
      assert.equal(stats.embeddingCount, 1);
      assert.equal(stats.savedBytes, 80);
    });

    it('cleanOrphans removes records referencing missing patterns', () => {
      store.storeDelta({ patternId: 'gone', templateId: 't1', delta: {} });
      store.storeHoloEmbedding('gone', [0.1]);
      const result = store.cleanOrphans();
      assert.equal(result.deletedDeltas, 1);
      assert.equal(result.deletedEmbeddings, 1);
    });
  });

  // ─── Audit Log ────────────────────────────────────────────────────────

  describe('Audit log', () => {
    it('_audit writes and getAuditLog reads with filters', () => {
      store._audit('test-action', 'entries', 'id1', { foo: 'bar' }, 'tester');
      store._audit('other-action', 'patterns', 'id2', {}, 'system');
      const all = store.getAuditLog({ limit: 100 });
      assert.ok(all.length >= 2);

      const filtered = store.getAuditLog({ table: 'entries', action: 'test-action' });
      assert.equal(filtered.length, 1);
      assert.equal(filtered[0].actor, 'tester');
      assert.deepEqual(filtered[0].detail, { foo: 'bar' });
    });

    it('getAuditLog respects since filter', () => {
      const past = '2020-01-01T00:00:00.000Z';
      store._audit('old-action', 'entries', 'id1');
      const log = store.getAuditLog({ since: past });
      assert.ok(log.length >= 1);
      const none = store.getAuditLog({ since: '2099-01-01T00:00:00.000Z' });
      assert.equal(none.length, 0);
    });
  });

  // ─── Edge Cases ───────────────────────────────────────────────────────

  describe('Edge cases', () => {
    it('_safeJSON returns fallback on malformed JSON', () => {
      assert.deepEqual(store._safeJSON('not json', []), []);
      assert.deepEqual(store._safeJSON(null, { x: 1 }), { x: 1 });
      assert.deepEqual(store._safeJSON('{"a":1}', {}), { a: 1 });
    });

    it('_patternFieldToCol returns null for unknown field', () => {
      assert.equal(store._patternFieldToCol('unknownField'), null);
      assert.equal(store._patternFieldToCol('usageCount'), 'usage_count');
    });

    it('close() closes the database without error', () => {
      const s = new SQLiteStore(makeTempDir('close-test'));
      assert.doesNotThrow(() => s.close());
    });

    it('addEntry with minimal fields uses defaults', () => {
      const e = store.addEntry({ code: 'x()' });
      assert.equal(e.language, 'unknown');
      assert.equal(e.author, 'anonymous');
      assert.deepEqual(e.tags, []);
      assert.equal(e.validation.testPassed, null);
    });
  });
});

} // end DatabaseSync guard
