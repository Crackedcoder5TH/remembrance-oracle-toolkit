const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ingestPatterns, ingestConstants, ingest } = require('../src/core/field-ingest');
const { SQLiteStore } = require('../src/store/sqlite');

let tmpDir;
let store;

function freshStore() {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'field-ingest-'));
  store = new SQLiteStore(tmpDir);
  return store;
}

describe('field-ingest — pattern library → field', () => {
  beforeEach(() => {
    freshStore();
    const now = new Date().toISOString();
    // Seed a few code patterns without waveforms
    for (const [id, name, code] of [
      ['p1', 'adder', 'function add(a,b){return a+b;}'],
      ['p2', 'mapper', 'function mapAll(xs,f){return xs.map(f);}'],
      ['p3', 'guard', 'function guard(x){if(!x)return null;return x;}'],
    ]) {
      store.db.prepare(`
        INSERT INTO patterns (id, name, code, language, coherency_total, coherency_json, created_at, updated_at)
        VALUES (?, ?, ?, 'javascript', 0.85, '{}', ?, ?)
      `).run(id, name, code, now, now);
    }
  });

  afterEach(() => {
    try { store.db.close(); } catch (_) { /* noop */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
  });

  it('backfills a 256-D waveform onto every code pattern', () => {
    const report = ingestPatterns(store);
    assert.equal(report.total, 3);
    assert.equal(report.encoded, 3, 'all 3 patterns should be encoded');

    const rows = store.db.prepare('SELECT coherency_json FROM patterns').all();
    for (const r of rows) {
      const cj = JSON.parse(r.coherency_json);
      assert.ok(Array.isArray(cj.waveform), 'waveform must be backfilled');
      assert.equal(cj.waveform.length, 256);
      assert.ok(typeof cj.digest === 'string' && cj.digest.length === 8);
    }
  });

  it('is idempotent — second run encodes nothing new', () => {
    ingestPatterns(store);
    const second = ingestPatterns(store);
    assert.equal(second.encoded, 0, 're-run should encode 0 (waveforms already present)');
    assert.equal(second.total, 3);
  });

  it('skips field-* patterns (already encoded by field-memory)', () => {
    const now = new Date().toISOString();
    store.db.prepare(`
      INSERT INTO patterns (id, name, code, language, coherency_total, coherency_json, created_at, updated_at)
      VALUES ('fe1', 'field-event:abc', 'field-event\nsource: x', 'field', 0.5,
              '{"waveform":[],"total":0.5}', ?, ?)
    `).run(now, now);
    const report = ingestPatterns(store);
    assert.equal(report.skipped, 1, 'the field-* pattern must be skipped');
    assert.equal(report.encoded, 3, 'only the 3 code patterns get encoded');
  });

  it('honors the limit option', () => {
    const report = ingestPatterns(store, { limit: 2 });
    assert.equal(report.total, 2);
  });

  it('tolerates a missing/invalid store', () => {
    const r = ingestPatterns(null);
    assert.equal(r.total, 0);
    assert.equal(r.encoded, 0);
  });
});

describe('field-ingest — constants → field', () => {
  it('registers numeric constants and reports a count', () => {
    const report = ingestConstants();
    // thresholds.js + quantum-core.js carry many numbers; expect a healthy count.
    assert.ok(report.total > 0, 'should find numeric constants');
    assert.ok(report.contributed <= report.total);
  });
});

describe('field-ingest — full ingest', () => {
  beforeEach(() => {
    freshStore();
    const now = new Date().toISOString();
    store.db.prepare(`
      INSERT INTO patterns (id, name, code, language, coherency_total, coherency_json, created_at, updated_at)
      VALUES ('x1', 'sample', 'function sample(){return 42;}', 'javascript', 0.9, '{}', ?, ?)
    `).run(now, now);
  });

  afterEach(() => {
    try { store.db.close(); } catch (_) { /* noop */ }
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) { /* noop */ }
  });

  it('ingest() returns both pattern and constant reports', () => {
    const report = ingest(store);
    assert.ok(report.patterns);
    assert.ok(report.constants);
    assert.equal(report.patterns.total, 1);
    assert.equal(report.patterns.encoded, 1);
    assert.ok(report.constants.total > 0);
  });
});
