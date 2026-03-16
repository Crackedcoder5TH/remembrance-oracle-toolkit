/**
 * Tests for oracle health check, candidate dedup, orphan cleanup,
 * entry pruning, audit rotation, vacuum, and candidate cap.
 */

const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');

let SQLiteStore;

function createTempStore() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-health-'));
  const store = new SQLiteStore(tmpDir);
  return { store, tmpDir };
}

function cleanup(tmpDir) {
  try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (e) {}
}

describe('Health & Dedup', () => {
  before(() => {
    ({ SQLiteStore } = require('../src/store/sqlite'));
  });

  describe('deduplicateCandidates', () => {
    it('keeps only highest-coherency candidate per (name, language)', () => {
      const { store, tmpDir } = createTempStore();
      try {
        // Add multiple candidates with same name/lang but different coherency
        for (let i = 0; i < 5; i++) {
          store.db.prepare(`
            INSERT INTO candidates (id, name, code, language, coherency_total, coherency_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '{}', datetime('now'), datetime('now'))
          `).run(`dup-${i}`, 'myFunc', `code-v${i}`, 'javascript', 0.5 + i * 0.1);
        }
        const before = store.db.prepare('SELECT COUNT(*) as c FROM candidates').get().c;
        assert.equal(before, 5);

        const result = store.deduplicateCandidates();
        assert.equal(result.removed, 4);
        assert.equal(result.kept, 1);
        assert.equal(result.groups, 1);

        // The remaining candidate should have the highest coherency
        const remaining = store.db.prepare('SELECT * FROM candidates').get();
        assert.equal(remaining.coherency_total, 0.9);
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });

    it('respects maxPerGroup', () => {
      const { store, tmpDir } = createTempStore();
      try {
        for (let i = 0; i < 5; i++) {
          store.db.prepare(`
            INSERT INTO candidates (id, name, code, language, coherency_total, coherency_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '{}', datetime('now'), datetime('now'))
          `).run(`dup-${i}`, 'myFunc', `code-v${i}`, 'javascript', 0.5 + i * 0.1);
        }

        const result = store.deduplicateCandidates({ maxPerGroup: 3 });
        assert.equal(result.removed, 2);
        assert.equal(result.kept, 3);
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });

    it('dry run does not delete', () => {
      const { store, tmpDir } = createTempStore();
      try {
        for (let i = 0; i < 3; i++) {
          store.db.prepare(`
            INSERT INTO candidates (id, name, code, language, coherency_total, coherency_json, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, '{}', datetime('now'), datetime('now'))
          `).run(`dup-${i}`, 'myFunc', `code-v${i}`, 'javascript', 0.5 + i * 0.1);
        }

        const result = store.deduplicateCandidates({ dryRun: true });
        assert.equal(result.removed, 2);

        // Nothing actually deleted
        const after = store.db.prepare('SELECT COUNT(*) as c FROM candidates').get().c;
        assert.equal(after, 3);
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });
  });

  describe('cleanOrphanCandidates', () => {
    it('removes candidates pointing to non-existent parents', () => {
      const { store, tmpDir } = createTempStore();
      try {
        // Add a candidate with a parent that doesn't exist
        store.db.prepare(`
          INSERT INTO candidates (id, name, code, language, coherency_total, coherency_json, parent_pattern, created_at, updated_at)
          VALUES ('orphan1', 'orphanFunc', 'code', 'javascript', 0.7, '{}', 'nonExistentParent', datetime('now'), datetime('now'))
        `).run();

        // Add a pattern and a candidate that references it
        store.addPattern({ name: 'realParent', code: 'x', language: 'javascript', testCode: 'test' });
        store.db.prepare(`
          INSERT INTO candidates (id, name, code, language, coherency_total, coherency_json, parent_pattern, created_at, updated_at)
          VALUES ('valid1', 'validFunc', 'code2', 'javascript', 0.7, '{}', 'realParent', datetime('now'), datetime('now'))
        `).run();

        const result = store.cleanOrphanCandidates();
        assert.equal(result.removed, 1);

        // Only the valid one remains
        const remaining = store.db.prepare('SELECT COUNT(*) as c FROM candidates').get().c;
        assert.equal(remaining, 1);
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });
  });

  describe('pruneStaleEntries', () => {
    it('removes old entries with no tests and no usage', () => {
      const { store, tmpDir } = createTempStore();
      try {
        // Add old stale entry (200 days ago)
        const oldDate = new Date(Date.now() - 200 * 86400000).toISOString();
        store.db.prepare(`
          INSERT INTO entries (id, code, language, coherency_total, coherency_json, times_used, times_succeeded, historical_score, version, created_at, updated_at)
          VALUES ('stale1', 'old code', 'javascript', 0.5, '{}', 0, 0, 1.0, 1, ?, ?)
        `).run(oldDate, oldDate);

        // Add recent stale entry (5 days ago)
        const recentDate = new Date(Date.now() - 5 * 86400000).toISOString();
        store.db.prepare(`
          INSERT INTO entries (id, code, language, coherency_total, coherency_json, times_used, times_succeeded, historical_score, version, created_at, updated_at)
          VALUES ('fresh1', 'new code', 'javascript', 0.5, '{}', 0, 0, 1.0, 1, ?, ?)
        `).run(recentDate, recentDate);

        const result = store.pruneStaleEntries({ maxAgeDays: 90 });
        assert.equal(result.removed, 1);
        assert.equal(result.remaining, 1);
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });
  });

  describe('rotateAuditLogNow', () => {
    it('rotates audit log immediately', () => {
      const { store, tmpDir } = createTempStore();
      try {
        // Add some audit entries
        for (let i = 0; i < 5; i++) {
          store.db.prepare(`
            INSERT INTO audit_log (timestamp, action, target_table, target_id, detail, actor)
            VALUES (?, 'test', 'patterns', ?, '{}', 'test')
          `).run(new Date().toISOString(), `id-${i}`);
        }

        const result = store.rotateAuditLogNow();
        assert.ok(result.before >= 5);
        assert.ok(result.after >= 0);
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });
  });

  describe('healthCheck', () => {
    it('returns a health report', () => {
      const { store, tmpDir } = createTempStore();
      try {
        const report = store.healthCheck();
        assert.ok(report.stats);
        assert.ok(Array.isArray(report.warnings));
        assert.equal(typeof report.healthy, 'boolean');
        assert.ok(report.stats.patterns != null);
        assert.ok(report.stats.candidates != null);
        assert.ok(report.stats.entries != null);
        assert.ok(report.stats.auditLogSize != null);
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });
  });

  describe('vacuum', () => {
    it('runs without error and reports sizes', () => {
      const { store, tmpDir } = createTempStore();
      try {
        const result = store.vacuum();
        assert.ok(result.beforeMB != null);
        assert.ok(result.afterMB != null);
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });
  });

  describe('addCandidate dedup guard', () => {
    it('rejects candidate when same name/lang exists with higher coherency', () => {
      const { store, tmpDir } = createTempStore();
      try {
        const first = store.addCandidate({
          name: 'testFunc', code: 'function a() { return 1; }',
          language: 'javascript', coherencyScore: { total: 0.9 },
        });
        assert.ok(first);
        assert.equal(first.name, 'testFunc');

        // Try to add lower coherency — should be rejected (returns existing)
        const second = store.addCandidate({
          name: 'testFunc', code: 'function a() { return 2; }',
          language: 'javascript', coherencyScore: { total: 0.7 },
        });
        assert.equal(second.coherencyTotal, 0.9);

        // Only 1 candidate in table
        const count = store.db.prepare('SELECT COUNT(*) as c FROM candidates').get().c;
        assert.equal(count, 1);
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });

    it('enforces cap of 5 candidates per (name, language)', () => {
      const { store, tmpDir } = createTempStore();
      try {
        // Add 5 candidates
        for (let i = 0; i < 5; i++) {
          store.addCandidate({
            name: 'capped', code: `function v${i}() { return ${i}; }`,
            language: 'javascript', coherencyScore: { total: 0.5 + i * 0.05 },
          });
        }

        const countBefore = store.db.prepare('SELECT COUNT(*) as c FROM candidates WHERE name = ?').get('capped').c;
        assert.equal(countBefore, 5);

        // Adding a 6th with higher coherency should evict the worst
        store.addCandidate({
          name: 'capped', code: 'function v5() { return 5; }',
          language: 'javascript', coherencyScore: { total: 0.9 },
        });

        const countAfter = store.db.prepare('SELECT COUNT(*) as c FROM candidates WHERE name = ?').get('capped').c;
        assert.equal(countAfter, 5);  // Still 5, not 6
      } finally {
        store.close();
        cleanup(tmpDir);
      }
    });
  });
});
