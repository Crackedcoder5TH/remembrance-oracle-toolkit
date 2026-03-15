const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const path = require('path');
const fs = require('fs');

describe('Retention Policy', () => {
  let store;
  const testDir = path.join(__dirname, '.test-retention-' + Date.now());
  const dbPath = path.join(testDir, 'oracle.db');

  before(() => {
    fs.mkdirSync(testDir, { recursive: true });
    const { SQLiteStore } = require('../src/store/sqlite');
    store = new SQLiteStore(dbPath);
  });

  after(() => {
    store.close();
    fs.rmSync(testDir, { recursive: true, force: true });
  });

  describe('purgeCandidateArchive', () => {
    it('should keep only recent N rows', () => {
      // Seed 50 candidate_archive rows
      for (let i = 0; i < 50; i++) {
        const d = new Date(Date.now() - (50 - i) * 60000).toISOString();
        store.db.prepare(`INSERT INTO candidate_archive (id, name, code, language, deleted_at) VALUES (?, ?, ?, ?, ?)`)
          .run(`ca-${i}`, `test-${i}`, 'code', 'javascript', d);
      }
      const result = store.purgeCandidateArchive({ keepRecent: 10 });
      assert.strictEqual(result.before, 50);
      assert.strictEqual(result.after, 10);
      assert.strictEqual(result.removed, 40);
    });

    it('should no-op when under limit', () => {
      const result = store.purgeCandidateArchive({ keepRecent: 100 });
      assert.strictEqual(result.removed, 0);
    });

    it('should respect dryRun', () => {
      const before = store.db.prepare('SELECT COUNT(*) as c FROM candidate_archive').get().c;
      const result = store.purgeCandidateArchive({ keepRecent: 1, dryRun: true });
      assert.strictEqual(result.removed, before - 1);
      // Verify nothing was actually deleted
      const after = store.db.prepare('SELECT COUNT(*) as c FROM candidate_archive').get().c;
      assert.strictEqual(after, before);
    });
  });

  describe('purgePatternArchive', () => {
    it('should keep only N versions per pattern name', () => {
      // Seed 10 versions of same pattern
      for (let i = 0; i < 10; i++) {
        const d = new Date(Date.now() - (10 - i) * 60000).toISOString();
        store.db.prepare(`INSERT INTO pattern_archive (id, name, code, language, deleted_at, deleted_reason) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(`pa-${i}`, 'test-pattern', `code-v${i}`, 'javascript', d, 'test');
      }
      const result = store.purgePatternArchive({ maxVersions: 3 });
      assert.strictEqual(result.before, 10);
      assert.strictEqual(result.after, 3);
      assert.strictEqual(result.removed, 7);
    });

    it('should keep different patterns independently', () => {
      store.db.exec('DELETE FROM pattern_archive');
      for (let i = 0; i < 5; i++) {
        const d = new Date(Date.now() - (5 - i) * 60000).toISOString();
        store.db.prepare(`INSERT INTO pattern_archive (id, name, code, language, deleted_at, deleted_reason) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(`pa-a-${i}`, 'pattern-a', `code-a-v${i}`, 'javascript', d, 'test');
        store.db.prepare(`INSERT INTO pattern_archive (id, name, code, language, deleted_at, deleted_reason) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(`pa-b-${i}`, 'pattern-b', `code-b-v${i}`, 'javascript', d, 'test');
      }
      const result = store.purgePatternArchive({ maxVersions: 2 });
      // 10 total, keep 2 per pattern = 4, remove 6
      assert.strictEqual(result.removed, 6);
      assert.strictEqual(result.after, 4);
    });
  });

  describe('rotateEntries', () => {
    it('should remove untested, unused old entries', () => {
      const old = new Date(Date.now() - 90 * 86400000).toISOString();
      const now = new Date().toISOString();
      for (let i = 0; i < 5; i++) {
        store.db.prepare(`INSERT INTO entries (id, code, language, created_at, updated_at, times_used, times_succeeded) VALUES (?, ?, ?, ?, ?, ?, ?)`)
          .run(`stale-${i}`, 'function stale() {}', 'javascript', old, now, 0, 0);
      }
      const result = store.rotateEntries({ maxAgeDays: 60 });
      assert.ok(result.staleRemoved >= 5);
    });
  });

  describe('retentionSweep', () => {
    it('should run all retention operations', () => {
      const result = store.retentionSweep();
      assert.ok('candidateArchive' in result);
      assert.ok('patternArchive' in result);
      assert.ok('entries' in result);
      assert.ok('auditLog' in result);
    });

    it('should support dryRun', () => {
      const result = store.retentionSweep({ dryRun: true });
      assert.ok('candidateArchive' in result);
    });
  });
});
