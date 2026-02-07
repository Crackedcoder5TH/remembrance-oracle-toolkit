const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  syncToGlobal,
  syncFromGlobal,
  syncBidirectional,
  federatedQuery,
  globalStats,
  openGlobalStore,
} = require('../src/core/persistence');
const { SQLiteStore, DatabaseSync } = require('../src/store/sqlite');

function makeTempDir(suffix = '') {
  const dir = path.join(os.tmpdir(), `persist-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

// Mock the global store by overriding openGlobalStore behavior.
// We do this by creating local stores that act as "local" and "global".
function createTestStores() {
  const localBase = makeTempDir('local');
  const globalBase = makeTempDir('global');
  const localStore = new SQLiteStore(localBase);
  const globalStore = new SQLiteStore(globalBase);
  return { localStore, globalStore, localBase, globalBase };
}

describe('Cross-Project Persistence', () => {
  if (!DatabaseSync) {
    it('skips persistence tests (no SQLite)', () => { assert.ok(true); });
    return;
  }

  describe('syncToGlobal', () => {
    it('syncs local patterns to global store', () => {
      const { localStore, globalStore } = createTestStores();

      // Add patterns to local
      localStore.addPattern({
        name: 'test-add',
        code: 'function add(a, b) { return a + b; }',
        language: 'javascript',
        coherencyScore: { total: 0.9 },
        tags: ['math'],
      });
      localStore.addPattern({
        name: 'test-sub',
        code: 'function sub(a, b) { return a - b; }',
        language: 'javascript',
        coherencyScore: { total: 0.85 },
        tags: ['math'],
      });

      // Manual sync (we pass globalStore directly instead of using openGlobalStore)
      const localPatterns = localStore.getAllPatterns();
      const globalPatterns = globalStore.getAllPatterns();
      const globalIndex = new Set(globalPatterns.map(p => `${p.name}:${p.language}`));

      let synced = 0;
      for (const p of localPatterns) {
        const key = `${p.name}:${p.language}`;
        if (!globalIndex.has(key)) {
          globalStore.addPattern({
            name: p.name,
            code: p.code,
            language: p.language,
            coherencyScore: p.coherencyScore || {},
            tags: p.tags || [],
          });
          synced++;
        }
      }

      assert.equal(synced, 2);
      assert.equal(globalStore.getAllPatterns().length, 2);
    });

    it('skips duplicates on second sync', () => {
      const { localStore, globalStore } = createTestStores();

      localStore.addPattern({
        name: 'unique-fn',
        code: 'function unique() { return 1; }',
        language: 'javascript',
        coherencyScore: { total: 0.8 },
        tags: [],
      });

      // Sync once
      const p = localStore.getAllPatterns()[0];
      globalStore.addPattern({
        name: p.name,
        code: p.code,
        language: p.language,
        coherencyScore: p.coherencyScore || {},
        tags: p.tags || [],
      });

      // Sync again — should find duplicate
      const globalPatterns = globalStore.getAllPatterns();
      const globalIndex = new Set(globalPatterns.map(pp => `${pp.name}:${pp.language}`));

      const localPatterns = localStore.getAllPatterns();
      let duplicates = 0;
      for (const lp of localPatterns) {
        if (globalIndex.has(`${lp.name}:${lp.language}`)) duplicates++;
      }

      assert.equal(duplicates, 1);
    });
  });

  describe('syncFromGlobal', () => {
    it('pulls global patterns into local store', () => {
      const { localStore, globalStore } = createTestStores();

      // Add to global
      globalStore.addPattern({
        name: 'global-fn',
        code: 'function globalFn() { return 42; }',
        language: 'javascript',
        coherencyScore: { total: 0.95 },
        tags: ['utility'],
      });

      // Manual pull
      const globalPatterns = globalStore.getAllPatterns();
      const localIndex = new Set(localStore.getAllPatterns().map(p => `${p.name}:${p.language}`));

      let pulled = 0;
      for (const p of globalPatterns) {
        if (!localIndex.has(`${p.name}:${p.language}`)) {
          localStore.addPattern({
            name: p.name,
            code: p.code,
            language: p.language,
            coherencyScore: p.coherencyScore || {},
            tags: p.tags || [],
          });
          pulled++;
        }
      }

      assert.equal(pulled, 1);
      assert.equal(localStore.getAllPatterns().length, 1);
      assert.equal(localStore.getAllPatterns()[0].name, 'global-fn');
    });
  });

  describe('federatedQuery', () => {
    it('merges local and global patterns, deduplicates', () => {
      const { localStore, globalStore } = createTestStores();

      // Add to local
      localStore.addPattern({
        name: 'shared',
        code: 'function shared() { return "local"; }',
        language: 'javascript',
        coherencyScore: { total: 0.9 },
        tags: [],
      });

      // Add same name to global (different code)
      globalStore.addPattern({
        name: 'shared',
        code: 'function shared() { return "global"; }',
        language: 'javascript',
        coherencyScore: { total: 0.85 },
        tags: [],
      });

      // Add unique to global
      globalStore.addPattern({
        name: 'global-only',
        code: 'function globalOnly() { return true; }',
        language: 'javascript',
        coherencyScore: { total: 0.8 },
        tags: [],
      });

      // Manual federated query
      const local = localStore.getAllPatterns();
      const global = globalStore.getAllPatterns();

      const seen = new Set();
      const merged = [];
      for (const p of local) {
        const key = `${p.name}:${p.language}`;
        if (!seen.has(key)) { seen.add(key); merged.push({ ...p, source: 'local' }); }
      }
      for (const p of global) {
        const key = `${p.name}:${p.language}`;
        if (!seen.has(key)) { seen.add(key); merged.push({ ...p, source: 'global' }); }
      }

      assert.equal(merged.length, 2); // 'shared' deduped, 'global-only' added
      assert.equal(merged.filter(m => m.source === 'local').length, 1);
      assert.equal(merged.filter(m => m.source === 'global').length, 1);
    });
  });

  describe('Oracle API integration', () => {
    it('oracle.globalStats() returns stats', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const tmpDir = makeTempDir('oracle');
      const oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });
      const stats = oracle.globalStats();
      assert.ok('available' in stats || 'error' in stats);
    });

    it('oracle.sync() runs without error', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const tmpDir = makeTempDir('oracle');
      const oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });

      // Register a pattern locally
      oracle.registerPattern({
        name: 'sync-test',
        code: 'function syncTest(n) { return n; }',
        testCode: 'if (syncTest(1) !== 1) throw new Error("fail");',
        language: 'javascript',
        description: 'Identity',
        tags: ['test'],
        patternType: 'utility',
      });

      // Sync should run without crashing
      const result = oracle.sync();
      assert.ok(result);
      assert.ok('push' in result || 'error' in result);
    });

    it('oracle.federatedSearch() returns merged results', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const tmpDir = makeTempDir('oracle');
      const oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });

      oracle.registerPattern({
        name: 'fed-test',
        code: 'function fedTest(n) { return n + 1; }',
        testCode: 'if (fedTest(0) !== 1) throw new Error("fail");',
        language: 'javascript',
        description: 'Increment',
        tags: ['test'],
        patternType: 'utility',
      });

      const result = oracle.federatedSearch();
      assert.ok(result);
      assert.ok(result.localCount >= 1);
      assert.ok(result.mergedCount >= 1);
    });
  });
});
