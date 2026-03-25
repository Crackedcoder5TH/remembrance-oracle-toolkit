const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const { QuantumField } = require('../src/quantum/quantum-field');
const { QUANTUM_STATES, PLANCK_AMPLITUDE } = require('../src/quantum/quantum-core');

let tmpDir;
let store;
let field;

function createTestStore() {
  const { SQLiteStore } = require('../src/store/sqlite');
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'quantum-field-'));
  store = new SQLiteStore(tmpDir);
  return store;
}

describe('QuantumField — Migration', () => {
  beforeEach(() => {
    store = createTestStore();
    field = new QuantumField(store);
  });

  it('adds quantum columns to patterns table', () => {
    const cols = store.db.prepare("PRAGMA table_info(patterns)").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('quantum_state'), 'missing quantum_state');
    assert.ok(colNames.includes('amplitude'), 'missing amplitude');
    assert.ok(colNames.includes('phase'), 'missing phase');
    assert.ok(colNames.includes('last_observed_at'), 'missing last_observed_at');
    assert.ok(colNames.includes('entangled_with'), 'missing entangled_with');
    assert.ok(colNames.includes('observation_count'), 'missing observation_count');
  });

  it('adds quantum columns to entries table', () => {
    const cols = store.db.prepare("PRAGMA table_info(entries)").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('amplitude'), 'missing amplitude on entries');
    assert.ok(colNames.includes('quantum_state'), 'missing quantum_state on entries');
  });

  it('adds quantum columns to candidates table', () => {
    const cols = store.db.prepare("PRAGMA table_info(candidates)").all();
    const colNames = cols.map(c => c.name);
    assert.ok(colNames.includes('amplitude'), 'missing amplitude on candidates');
  });

  it('is idempotent — safe to run twice', () => {
    // Second construction should not throw
    const field2 = new QuantumField(store);
    assert.ok(field2);
  });
});

describe('QuantumField — Observe', () => {
  beforeEach(() => {
    store = createTestStore();
    field = new QuantumField(store);

    // Insert a test pattern
    const now = new Date().toISOString();
    store.db.prepare(`
      INSERT INTO patterns (id, name, code, language, coherency_total, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run('test-p1', 'test-pattern', 'function foo() {}', 'javascript', 0.7, now, now);
  });

  it('collapses observed pattern quantum state', () => {
    const collapsed = field.observe('patterns', ['test-p1']);
    assert.equal(collapsed, 1);

    const row = store.db.prepare('SELECT quantum_state, observation_count FROM patterns WHERE id = ?').get('test-p1');
    assert.equal(row.quantum_state, QUANTUM_STATES.COLLAPSED);
    assert.ok(row.observation_count >= 1);
  });

  it('returns 0 for empty ID list', () => {
    assert.equal(field.observe('patterns', []), 0);
  });

  it('returns 0 for non-existent ID', () => {
    assert.equal(field.observe('patterns', ['nonexistent']), 0);
  });
});

describe('QuantumField — Feedback', () => {
  beforeEach(() => {
    store = createTestStore();
    field = new QuantumField(store);

    const now = new Date().toISOString();
    store.db.prepare(`
      INSERT INTO patterns (id, name, code, language, coherency_total, amplitude, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `).run('fb-p1', 'fb-pattern', 'function bar() {}', 'javascript', 0.7, 0.5, now, now);
  });

  it('increases amplitude on success', () => {
    const result = field.feedback('patterns', 'fb-p1', true);
    assert.ok(result);
    assert.ok(result.amplitude > 0.5);
    assert.equal(result.quantumState, QUANTUM_STATES.COLLAPSED);
  });

  it('decreases amplitude on failure', () => {
    const result = field.feedback('patterns', 'fb-p1', false);
    assert.ok(result);
    assert.ok(result.amplitude < 0.5);
  });

  it('returns null for non-existent pattern', () => {
    const result = field.feedback('patterns', 'nonexistent', true);
    assert.equal(result, null);
  });
});

describe('QuantumField — Entanglement', () => {
  beforeEach(() => {
    store = createTestStore();
    field = new QuantumField(store);

    const now = new Date().toISOString();
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, coherency_total, amplitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('ent-a', 'pattern-a', 'code a', 'js', 0.7, 0.6, now, now);
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, coherency_total, amplitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run('ent-b', 'pattern-b', 'code b', 'js', 0.7, 0.6, now, now);
  });

  it('creates bidirectional entanglement links', () => {
    field.entangle('patterns', 'ent-a', 'ent-b');

    const rowA = store.db.prepare('SELECT entangled_with FROM patterns WHERE id = ?').get('ent-a');
    const rowB = store.db.prepare('SELECT entangled_with FROM patterns WHERE id = ?').get('ent-b');

    const linksA = JSON.parse(rowA.entangled_with);
    const linksB = JSON.parse(rowB.entangled_with);

    assert.ok(linksA.includes('ent-b'));
    assert.ok(linksB.includes('ent-a'));
  });

  it('does not duplicate entanglement links', () => {
    field.entangle('patterns', 'ent-a', 'ent-b');
    field.entangle('patterns', 'ent-a', 'ent-b');

    const rowA = store.db.prepare('SELECT entangled_with FROM patterns WHERE id = ?').get('ent-a');
    const links = JSON.parse(rowA.entangled_with);
    assert.equal(links.filter(l => l === 'ent-b').length, 1);
  });

  it('propagates amplitude changes via entanglement', () => {
    field.entangle('patterns', 'ent-a', 'ent-b');

    // Positive feedback on A should shift B's amplitude
    const beforeB = store.db.prepare('SELECT amplitude FROM patterns WHERE id = ?').get('ent-b').amplitude;
    field.feedback('patterns', 'ent-a', true);
    const afterB = store.db.prepare('SELECT amplitude FROM patterns WHERE id = ?').get('ent-b').amplitude;

    assert.ok(afterB > beforeB, `B amplitude should increase: ${beforeB} → ${afterB}`);
  });
});

describe('QuantumField — Decoherence Sweep', () => {
  beforeEach(() => {
    store = createTestStore();
    field = new QuantumField(store);

    const old = new Date(Date.now() - 200 * 86400000).toISOString();
    const now = new Date().toISOString();
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, amplitude, last_observed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('stale-1', 'stale', 'code', 'js', 0.5, old, old, old);
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, amplitude, last_observed_at, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('fresh-1', 'fresh', 'code', 'js', 0.8, now, now, now);
  });

  it('decays stale patterns', () => {
    const report = field.decoherenceSweep({ maxDays: 100 });
    assert.ok(report.patterns);
    assert.ok(report.patterns.swept >= 1);

    const stale = store.db.prepare('SELECT amplitude FROM patterns WHERE id = ?').get('stale-1');
    assert.ok(stale.amplitude < 0.5);
  });

  it('leaves fresh patterns untouched', () => {
    field.decoherenceSweep({ maxDays: 100 });
    const fresh = store.db.prepare('SELECT amplitude FROM patterns WHERE id = ?').get('fresh-1');
    assert.equal(fresh.amplitude, 0.8);
  });
});

describe('QuantumField — Re-excite', () => {
  beforeEach(() => {
    store = createTestStore();
    field = new QuantumField(store);

    const now = new Date().toISOString();
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, amplitude, quantum_state, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('dead-1', 'dead', 'code', 'js', 0.01, 'decohered', now, now);
  });

  it('re-excites decohered patterns', () => {
    const report = field.reexcite('patterns');
    assert.ok(report.reexcited >= 1);

    const row = store.db.prepare('SELECT amplitude, quantum_state FROM patterns WHERE id = ?').get('dead-1');
    assert.ok(row.amplitude >= PLANCK_AMPLITUDE);
    assert.equal(row.quantum_state, QUANTUM_STATES.SUPERPOSITION);
  });
});

describe('QuantumField — Stats', () => {
  beforeEach(() => {
    store = createTestStore();
    field = new QuantumField(store);

    const now = new Date().toISOString();
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, amplitude, quantum_state, observation_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('s1', 'p1', 'code', 'js', 0.8, 'collapsed', 5, now, now);
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, amplitude, quantum_state, observation_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      .run('s2', 'p2', 'code', 'js', 0.3, 'superposition', 0, now, now);
  });

  it('returns comprehensive field statistics', () => {
    const stats = field.stats();
    assert.ok(stats.totalPatterns >= 2);
    assert.ok(stats.avgAmplitude > 0);
    assert.ok(stats.fieldEnergy > 0);
    assert.ok(stats.byState);
    assert.ok(stats.byTable.patterns);
    assert.ok(stats.byTable.patterns.count >= 2);
  });
});

describe('QuantumField — Entanglement Graph', () => {
  beforeEach(() => {
    store = createTestStore();
    field = new QuantumField(store);

    const now = new Date().toISOString();
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, amplitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('g-a', 'a', 'code', 'js', 0.7, now, now);
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, amplitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('g-b', 'b', 'code', 'js', 0.6, now, now);
    store.db.prepare(`INSERT INTO patterns (id, name, code, language, amplitude, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run('g-c', 'c', 'code', 'js', 0.5, now, now);

    field.entangle('patterns', 'g-a', 'g-b');
    field.entangle('patterns', 'g-b', 'g-c');
  });

  it('traverses entanglement graph', () => {
    const graph = field.getEntanglementGraph('g-a', 2);
    assert.ok(graph.nodes.length >= 2);
    assert.ok(graph.edges.length >= 1);

    const nodeIds = graph.nodes.map(n => n.id);
    assert.ok(nodeIds.includes('g-a'));
    assert.ok(nodeIds.includes('g-b'));
  });
});
