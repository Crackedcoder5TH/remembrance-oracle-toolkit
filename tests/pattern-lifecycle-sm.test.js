const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const {
  createPatternLifecycle,
  STATES,
  TRANSITIONS,
  TRANSITION_MAP,
} = require('../src/evolution/pattern-state-machine');

// Minimal in-memory store mock for testing
function createMockStore() {
  const patterns = new Map();
  const candidates = new Map();
  const archive = new Map();
  const deltas = new Map();
  const templates = new Map();
  const embeddings = new Map();
  const auditLog = [];

  const stmts = {};
  const db = {
    prepare(sql) {
      return {
        get(...args) {
          if (sql.includes('FROM patterns WHERE id')) {
            return patterns.get(args[0]) || undefined;
          }
          if (sql.includes('FROM candidates WHERE id')) {
            return candidates.get(args[0]) || undefined;
          }
          if (sql.includes('FROM pattern_archive WHERE id')) {
            return archive.get(args[0]) || undefined;
          }
          if (sql.includes('COUNT(*)')) {
            return { c: patterns.size };
          }
          return undefined;
        },
        all(...args) {
          if (sql.includes('FROM patterns')) {
            return [...patterns.values()];
          }
          return [];
        },
        run(...args) {
          if (sql.includes('DELETE FROM patterns WHERE id')) {
            patterns.delete(args[0]);
          }
          if (sql.includes('DELETE FROM pattern_archive WHERE id')) {
            archive.delete(args[0]);
          }
          if (sql.includes('UPDATE candidates SET promoted_at')) {
            const c = candidates.get(args[2]);
            if (c) c.promoted_at = args[0];
          }
          if (sql.includes('INSERT') && sql.includes('candidates')) {
            candidates.set(args[0], {
              id: args[0], name: args[1], code: args[2], language: args[3],
              pattern_type: args[4], coherency_total: args[5], coherency_json: args[6],
              test_code: args[7], tags: args[8], description: args[9],
              parent_pattern: args[10], generation_method: args[11],
              created_at: args[12], updated_at: args[13],
              promoted_at: null,
            });
          }
          if (sql.includes('INSERT') && sql.includes('pattern_archive')) {
            // archive insert
          }
          return { changes: 1 };
        },
      };
    },
    exec() { /* BEGIN/COMMIT/ROLLBACK are no-ops in mock */ },
  };

  const store = {
    db,
    getCandidate(id) {
      const row = candidates.get(id);
      if (!row) return null;
      return {
        id: row.id, name: row.name, code: row.code,
        language: row.language, coherencyTotal: row.coherency_total,
        testCode: row.test_code, tags: row.tags ? JSON.parse(row.tags) : [],
        description: row.description,
      };
    },
    getPattern(id) {
      const row = patterns.get(id);
      if (!row) return null;
      return {
        id: row.id, name: row.name, code: row.code,
        language: row.language, evolutionHistory: [],
        coherencyScore: { total: row.coherency_total },
      };
    },
    updatePattern(id, updates) {
      const row = patterns.get(id);
      if (!row) return null;
      Object.assign(row, updates);
      return store.getPattern(id);
    },
    promoteCandidate(id) {
      const c = candidates.get(id);
      if (c) c.promoted_at = new Date().toISOString();
      return c;
    },
    _archivePattern(row, reason) {
      archive.set(row.id, { ...row, deleted_reason: reason, full_row_json: JSON.stringify(row) });
    },
    _cleanupFractalData(id) {
      deltas.delete(id);
    },
    _audit(action, table, id, meta) {
      auditLog.push({ action, table, id, meta });
    },
    // Expose internals for test verification
    _patterns: patterns,
    _candidates: candidates,
    _archive: archive,
    _auditLog: auditLog,
  };

  return store;
}

describe('Pattern Lifecycle State Machine', () => {
  let store;
  let lifecycle;

  beforeEach(() => {
    store = createMockStore();
    lifecycle = createPatternLifecycle(store);
  });

  // ─── Constants ───

  it('should export valid states and transitions', () => {
    assert.equal(STATES.CANDIDATE, 'candidate');
    assert.equal(STATES.PATTERN, 'pattern');
    assert.equal(STATES.RETIRED, 'retired');
    assert.equal(TRANSITIONS.PROMOTE, 'promote');
    assert.equal(TRANSITIONS.RETIRE, 'retire');
    assert.equal(TRANSITIONS.EVOLVE, 'evolve');
    assert.equal(TRANSITIONS.RESURRECT, 'resurrect');
  });

  it('should have valid transition map', () => {
    assert.equal(TRANSITION_MAP[STATES.CANDIDATE][TRANSITIONS.PROMOTE], STATES.PATTERN);
    assert.equal(TRANSITION_MAP[STATES.PATTERN][TRANSITIONS.RETIRE], STATES.RETIRED);
    assert.equal(TRANSITION_MAP[STATES.PATTERN][TRANSITIONS.EVOLVE], STATES.PATTERN);
    assert.equal(TRANSITION_MAP[STATES.RETIRED][TRANSITIONS.RESURRECT], STATES.CANDIDATE);
  });

  // ─── getState ───

  it('should detect pattern state', () => {
    store._patterns.set('p1', { id: 'p1', name: 'test' });
    assert.equal(lifecycle.getState('p1'), STATES.PATTERN);
  });

  it('should detect candidate state', () => {
    store._candidates.set('c1', { id: 'c1', name: 'test', promoted_at: null });
    assert.equal(lifecycle.getState('c1'), STATES.CANDIDATE);
  });

  it('should detect promoted candidate as pattern', () => {
    store._candidates.set('c1', { id: 'c1', name: 'test', promoted_at: '2026-01-01' });
    assert.equal(lifecycle.getState('c1'), STATES.PATTERN);
  });

  it('should detect retired state', () => {
    store._archive.set('a1', { id: 'a1', name: 'test' });
    assert.equal(lifecycle.getState('a1'), STATES.RETIRED);
  });

  it('should return null for unknown entity', () => {
    assert.equal(lifecycle.getState('nonexistent'), null);
  });

  // ─── PROMOTE ───

  it('should promote a candidate with test code', () => {
    store._candidates.set('c1', {
      id: 'c1', name: 'myFunc', code: 'function f() {}',
      language: 'javascript', coherency_total: 0.8,
      test_code: 'assert(true)', tags: '[]', promoted_at: null,
    });

    const result = lifecycle.promote('c1', 'assert(true)');
    assert.equal(result.success, true);
    assert.equal(result.event.transition, TRANSITIONS.PROMOTE);
    assert.equal(result.event.from, STATES.CANDIDATE);
    assert.equal(result.event.to, STATES.PATTERN);
  });

  it('should reject promotion without test code', () => {
    store._candidates.set('c1', {
      id: 'c1', name: 'myFunc', code: 'function f() {}',
      language: 'javascript', coherency_total: 0.8,
      test_code: null, tags: '[]', promoted_at: null,
    });

    const result = lifecycle.promote('c1');
    assert.equal(result.success, false);
    assert.ok(result.reason.includes('test'));
  });

  it('should reject promotion below coherency threshold', () => {
    store._candidates.set('c1', {
      id: 'c1', name: 'myFunc', code: 'function f() {}',
      language: 'javascript', coherency_total: 0.3,
      test_code: 'assert(true)', tags: '[]', promoted_at: null,
    });

    const result = lifecycle.promote('c1', 'assert(true)');
    assert.equal(result.success, false);
    assert.ok(result.reason.includes('Coherency'));
  });

  it('should reject promoting a pattern (wrong state)', () => {
    store._patterns.set('p1', { id: 'p1', name: 'test' });

    const result = lifecycle.promote('p1', 'assert(true)');
    assert.equal(result.success, false);
    assert.ok(result.reason.includes('not allowed'));
  });

  // ─── RETIRE ───

  it('should retire a low-scoring pattern', () => {
    store._patterns.set('p1', {
      id: 'p1', name: 'badFunc', coherency_total: 0.1,
      usage_count: 10, success_count: 1, code: '...',
    });

    const result = lifecycle.retire('p1');
    assert.equal(result.success, true);
    assert.equal(result.event.transition, TRANSITIONS.RETIRE);
    assert.ok(store._archive.has('p1'));
    assert.ok(!store._patterns.has('p1'));
  });

  it('should refuse to retire a healthy pattern', () => {
    store._patterns.set('p1', {
      id: 'p1', name: 'goodFunc', coherency_total: 0.9,
      usage_count: 10, success_count: 9, code: '...',
    });

    const result = lifecycle.retire('p1');
    assert.equal(result.success, false);
    assert.ok(result.reason.includes('healthy'));
  });

  it('should force-retire a healthy pattern', () => {
    store._patterns.set('p1', {
      id: 'p1', name: 'goodFunc', coherency_total: 0.9,
      usage_count: 10, success_count: 9, code: '...',
    });

    const result = lifecycle.retire('p1', { force: true });
    assert.equal(result.success, true);
  });

  it('should reject retiring a candidate (wrong state)', () => {
    store._candidates.set('c1', { id: 'c1', name: 'test', promoted_at: null });

    const result = lifecycle.retire('c1');
    assert.equal(result.success, false);
    assert.ok(result.reason.includes('not allowed'));
  });

  // ─── RETIRE BULK ───

  it('should bulk retire low-scoring patterns', () => {
    store._patterns.set('p1', {
      id: 'p1', name: 'bad1', coherency_total: 0.1,
      usage_count: 5, success_count: 0, code: '...',
    });
    store._patterns.set('p2', {
      id: 'p2', name: 'good1', coherency_total: 0.9,
      usage_count: 10, success_count: 9, code: '...',
    });

    const result = lifecycle.retireBulk(0.30);
    assert.equal(result.retired, 1);
    assert.equal(result.events.length, 1);
    assert.equal(result.events[0].entityId, 'p1');
  });

  // ─── EVOLVE ───

  it('should evolve a pattern with new code', () => {
    store._patterns.set('p1', {
      id: 'p1', name: 'myFunc', code: 'function f() { return 1; }',
      coherency_total: 0.8, usage_count: 5, success_count: 4,
    });

    const result = lifecycle.evolve('p1', { code: 'function f() { return 2; }' });
    assert.equal(result.success, true);
    assert.equal(result.event.transition, TRANSITIONS.EVOLVE);
    assert.equal(result.event.from, STATES.PATTERN);
    assert.equal(result.event.to, STATES.PATTERN);
  });

  it('should reject evolve without code', () => {
    store._patterns.set('p1', { id: 'p1', name: 'myFunc', code: '...' });

    const result = lifecycle.evolve('p1', {});
    assert.equal(result.success, false);
    assert.ok(result.reason.includes('code'));
  });

  it('should reject evolving a retired pattern', () => {
    store._archive.set('a1', { id: 'a1', name: 'test' });

    const result = lifecycle.evolve('a1', { code: 'new code' });
    assert.equal(result.success, false);
    assert.ok(result.reason.includes('not allowed'));
  });

  // ─── RESURRECT ───

  it('should resurrect an archived pattern back to candidate', () => {
    store._archive.set('a1', {
      id: 'a1', name: 'resurrected_func', code: 'function f() {}',
      language: 'javascript', pattern_type: 'utility',
      coherency_total: 0.5, coherency_json: '{}',
      test_code: 'assert(true)', tags: '[]',
      deleted_reason: 'retirement', full_row_json: '{}',
    });

    const result = lifecycle.resurrect('a1');
    assert.equal(result.success, true);
    assert.equal(result.event.transition, TRANSITIONS.RESURRECT);
    assert.equal(result.event.from, STATES.RETIRED);
    assert.equal(result.event.to, STATES.CANDIDATE);
    assert.ok(!store._archive.has('a1'));
    assert.ok(store._candidates.has('a1'));
  });

  it('should reject resurrecting a live pattern', () => {
    store._patterns.set('p1', { id: 'p1', name: 'test' });

    const result = lifecycle.resurrect('p1');
    assert.equal(result.success, false);
    assert.ok(result.reason.includes('not allowed'));
  });

  // ─── Subscriptions ───

  it('should notify subscribers on transitions', () => {
    const events = [];
    lifecycle.subscribe(e => events.push(e));

    store._candidates.set('c1', {
      id: 'c1', name: 'myFunc', code: 'function f() {}',
      language: 'javascript', coherency_total: 0.8,
      test_code: 'assert(true)', tags: '[]', promoted_at: null,
    });

    lifecycle.promote('c1', 'assert(true)');
    assert.equal(events.length, 1);
    assert.equal(events[0].transition, TRANSITIONS.PROMOTE);
  });

  it('should support unsubscribe', () => {
    const events = [];
    const unsub = lifecycle.subscribe(e => events.push(e));

    store._candidates.set('c1', {
      id: 'c1', name: 'fn1', code: 'f()', language: 'javascript',
      coherency_total: 0.8, test_code: 'ok', tags: '[]', promoted_at: null,
    });
    lifecycle.promote('c1', 'ok');
    unsub();

    store._candidates.set('c2', {
      id: 'c2', name: 'fn2', code: 'g()', language: 'javascript',
      coherency_total: 0.8, test_code: 'ok', tags: '[]', promoted_at: null,
    });
    lifecycle.promote('c2', 'ok');

    assert.equal(events.length, 1);
  });

  // ─── onTransition hook ───

  it('should call onTransition option hook', () => {
    const hookEvents = [];
    const lc = createPatternLifecycle(store, {
      onTransition: (e) => hookEvents.push(e.transition),
    });

    store._candidates.set('c1', {
      id: 'c1', name: 'fn', code: 'f()', language: 'javascript',
      coherency_total: 0.8, test_code: 'ok', tags: '[]', promoted_at: null,
    });
    lc.promote('c1', 'ok');

    assert.deepEqual(hookEvents, [TRANSITIONS.PROMOTE]);
  });
});
