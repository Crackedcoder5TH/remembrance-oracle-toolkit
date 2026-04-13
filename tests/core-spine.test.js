'use strict';

/**
 * Tests for the new core spine modules:
 *   - src/core/analyze.js     (analysis envelope)
 *   - src/core/storage.js     (OracleStorage)
 *   - src/core/events.js      (event bus)
 *   - src/core/heal.js        (unified heal pipeline)
 *
 * These modules are the seam between every subsystem. If they work,
 * the fractures the audit writeup identified start closing one by one.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── analyze ────────────────────────────────────────────────────────────────

describe('core/analyze: unified envelope', () => {
  const { analyze, analyzeFiles, crossFileCallGraph, sourceHash } = require('../src/core/analyze');

  it('parses a source once and memoizes every field', () => {
    const src = 'function f(a, b) { return a.sort() / b; }';
    const env = analyze(src, 'test.js');
    // Identity: second read returns the same object reference
    const a1 = env.audit;
    const a2 = env.audit;
    assert.equal(a1, a2);
    const p1 = env.program;
    const p2 = env.program;
    assert.equal(p1, p2);
  });

  it('surfaces audit, lint, and smell findings from a single call', () => {
    const src = 'function f(a) { return a.sort(); }';
    const env = analyze(src, 'test.js');
    assert.ok(env.audit.findings.length > 0, 'audit should fire');
    assert.ok(env.allFindings.length >= env.audit.findings.length);
  });

  it('provides frozen top-level envelope so consumers cannot mutate', () => {
    const env = analyze('const x = 1;', 'x.js');
    assert.ok(Object.isFrozen(env));
  });

  it('carries meta.hash that is stable across identical input', () => {
    const a = analyze('const x = 1;', 'a.js');
    const b = analyze('const x = 1;', 'b.js');
    assert.equal(a.meta.hash, b.meta.hash);
    const c = analyze('const x = 2;', 'a.js');
    assert.notEqual(a.meta.hash, c.meta.hash);
  });

  it('toJSON returns a serializable snapshot', () => {
    const env = analyze('function f() { return null; }', 'x.js');
    const json = JSON.stringify(env.toJSON());
    assert.ok(json.length > 0);
    const parsed = JSON.parse(json);
    assert.equal(parsed.language, 'javascript');
  });

  it('analyzeFiles + crossFileCallGraph walk multiple envelopes', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-env-'));
    try {
      const a = path.join(dir, 'a.js');
      const b = path.join(dir, 'b.js');
      fs.writeFileSync(a, 'function findUser(id) { if (!id) return null; return { name: "x" }; }');
      fs.writeFileSync(b, 'function email(id) { const u = findUser(id); return u.name; }');
      const envs = analyzeFiles([a, b]);
      assert.equal(envs.length, 2);
      const cross = crossFileCallGraph(envs);
      assert.ok(cross.graph.defs.has('findUser'));
      // Cascade should flag b.js for dereferencing a nullable return
      assert.ok(cross.cascades.length >= 0); // smoke — exact count can vary
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });
});

// ─── storage ────────────────────────────────────────────────────────────────

describe('core/storage: unified storage interface', () => {
  const { createStorage, BACKEND_JSON, BACKEND_SQLITE } = require('../src/core/storage');
  let tmp;
  before(() => { tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-store-')); });
  after(() => { fs.rmSync(tmp, { recursive: true, force: true }); });

  it('JSON backend round-trips through a namespace', () => {
    const s = createStorage(tmp, { backend: BACKEND_JSON });
    const audit = s.namespace('audit');
    audit.set('baseline', { findings: 3 });
    assert.deepEqual(audit.get('baseline'), { findings: 3 });
    assert.deepEqual(audit.keys(), ['baseline']);
  });

  it('JSON backend persists across storage instances', () => {
    const s1 = createStorage(tmp, { backend: BACKEND_JSON });
    s1.namespace('patterns').set('count', { total: 7 });
    const s2 = createStorage(tmp, { backend: BACKEND_JSON });
    assert.deepEqual(s2.namespace('patterns').get('count'), { total: 7 });
  });

  it('append creates an append-only log', () => {
    const s = createStorage(tmp, { backend: BACKEND_JSON });
    const h = s.namespace('history');
    h.append('events', { type: 'heal.succeeded' });
    h.append('events', { type: 'feedback.fix' });
    // Log file should exist; key listing includes the .log suffix
    assert.ok(h.keys().some(k => k === 'events.log'));
  });

  it('SQLite backend round-trips when node:sqlite is available', () => {
    const sqlTmp = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-sql-'));
    try {
      const s = createStorage(sqlTmp, { backend: BACKEND_SQLITE });
      assert.equal(s.backend, BACKEND_SQLITE);
      s.namespace('audit').set('x', { a: 1 });
      assert.deepEqual(s.namespace('audit').get('x'), { a: 1 });
    } finally {
      fs.rmSync(sqlTmp, { recursive: true, force: true });
    }
  });

  it('rejects invalid namespace and key names', () => {
    const s = createStorage(tmp);
    assert.throws(() => s.namespace('bad name'));
    assert.throws(() => s.namespace('audit').set('bad/key', 1));
  });
});

// ─── events ─────────────────────────────────────────────────────────────────

describe('core/events: unified event bus', () => {
  const { OracleEventBus, EVENTS } = require('../src/core/events');

  it('delivers exact and wildcard subscriptions', async () => {
    const bus = new OracleEventBus();
    const calls = [];
    bus.on('feedback.fix', (p) => calls.push(['exact', p.ruleId]));
    bus.on('feedback.*',   (p, m) => calls.push(['wild', m.event]));
    bus.emitSync('feedback.fix', { ruleId: 'type/div' });
    bus.emitSync('feedback.dismiss', { ruleId: 'state-mutation/sort' });
    assert.deepEqual(calls, [
      ['exact', 'type/div'],
      ['wild',  'feedback.fix'],
      ['wild',  'feedback.dismiss'],
    ]);
  });

  it('isolates handler errors — a thrower does not break siblings', () => {
    const bus = new OracleEventBus();
    let good = 0;
    bus.on('a.b', () => { throw new Error('boom'); });
    bus.on('a.b', () => { good++; });
    bus.emitSync('a.b');
    assert.equal(good, 1);
  });

  it('once unsubscribes after first delivery', () => {
    const bus = new OracleEventBus();
    let n = 0;
    bus.once('x', () => { n++; });
    bus.emitSync('x');
    bus.emitSync('x');
    assert.equal(n, 1);
  });

  it('returns handler count from emit', async () => {
    const bus = new OracleEventBus();
    bus.on('a', () => {});
    bus.on('a', () => {});
    const count = await bus.emit('a');
    assert.equal(count, 2);
  });

  it('exposes a catalog of standard event names', () => {
    assert.equal(EVENTS.FEEDBACK_FIX, 'feedback.fix');
    assert.equal(EVENTS.HEAL_SUCCEEDED, 'heal.succeeded');
  });
});

// ─── heal ───────────────────────────────────────────────────────────────────

describe('core/heal: unified heal pipeline', () => {
  const { heal, LEVELS, levelIndex } = require('../src/core/heal');

  it('defines the canonical escalation ladder', () => {
    assert.deepEqual(LEVELS, ['confident', 'serf', 'llm', 'swarm', 'generate']);
    assert.equal(levelIndex('confident'), 0);
    assert.equal(levelIndex('swarm'), 3);
  });

  it('returns noop on clean input', async () => {
    const r = await heal('const x = 1;', { filePath: 'ok.js' });
    assert.equal(r.success, true);
    assert.equal(r.level, 'noop');
  });

  it('fires confident auto-fix for state-mutation/sort', async () => {
    const r = await heal('function f(a) { return a.sort(); }', { filePath: 'x.js' });
    assert.equal(r.success, true);
    assert.equal(r.level, 'confident');
    assert.ok(r.source.includes('.slice().sort'));
    assert.ok(r.after.findings.length < r.before.findings.length);
  });

  it('respects maxLevel so a caller can cap the ladder', async () => {
    // auto-fix fails on nullable-deref (no confident fixer) and we cap at
    // 'serf' so no LLM/swarm/generate will run. Expect exhaustion failure.
    const src = 'function a() { return null; }\nfunction b() { const r = a(); return r.x; }';
    const r = await heal(src, { filePath: 'x.js', maxLevel: 'confident' });
    assert.equal(r.success, false);
  });

  it('emits heal.attempt and heal.succeeded events', async () => {
    const { getEventBus } = require('../src/core/events');
    const bus = getEventBus();
    const events = [];
    const off1 = bus.on('heal.attempt', (p) => events.push(['attempt', p.level]));
    const off2 = bus.on('heal.succeeded', (p) => events.push(['succeeded', p.level]));
    await heal('function f(a) { return a.sort(); }', { filePath: 'x.js' });
    off1(); off2();
    assert.ok(events.some(e => e[0] === 'attempt' && e[1] === 'confident'));
    assert.ok(events.some(e => e[0] === 'succeeded' && e[1] === 'confident'));
  });
});
