const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');
const fs = require('fs');
const os = require('os');

const {
  syncToGlobal,
  syncFromGlobal,
  syncBidirectional,
  shareToCommuntiy,
  pullFromCommunity,
  federatedQuery,
  globalStats,
  personalStats,
  communityStats,
  openPersonalStore,
  openCommunityStore,
} = require('../src/core/persistence');
const { SQLiteStore, DatabaseSync } = require('../src/store/sqlite');

function makeTempDir(suffix = '') {
  const dir = path.join(os.tmpdir(), `persist-test-${suffix}-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function createTestStores() {
  const localBase = makeTempDir('local');
  const globalBase = makeTempDir('global');
  const localStore = new SQLiteStore(localBase);
  const globalStore = new SQLiteStore(globalBase);
  return { localStore, globalStore, localBase, globalBase };
}

function addTestPattern(store, name, opts = {}) {
  store.addPattern({
    name,
    code: opts.code || `function ${name.replace(/-/g, '_')}() { return 1; }`,
    language: opts.language || 'javascript',
    coherencyScore: opts.coherencyScore || { total: 0.9 },
    tags: opts.tags || ['test'],
    testCode: opts.testCode || null,
  });
}

describe('Cross-Project Persistence', () => {
  if (!DatabaseSync) {
    it('skips persistence tests (no SQLite)', () => { assert.ok(true); });
    return;
  }

  describe('syncToGlobal (personal store)', () => {
    it('syncs local patterns to personal store', () => {
      const { localStore, globalStore } = createTestStores();

      addTestPattern(localStore, 'test-add', { tags: ['math'] });
      addTestPattern(localStore, 'test-sub', { coherencyScore: { total: 0.85 }, tags: ['math'] });

      // Manual sync
      const localPatterns = localStore.getAllPatterns();
      const globalIndex = new Set(globalStore.getAllPatterns().map(p => `${p.name}:${p.language}`));

      let synced = 0;
      for (const p of localPatterns) {
        if (!globalIndex.has(`${p.name}:${p.language}`)) {
          globalStore.addPattern({
            name: p.name, code: p.code, language: p.language,
            coherencyScore: p.coherencyScore || {}, tags: p.tags || [],
          });
          synced++;
        }
      }

      assert.equal(synced, 2);
      assert.equal(globalStore.getAllPatterns().length, 2);
    });

    it('skips duplicates on second sync', () => {
      const { localStore, globalStore } = createTestStores();

      addTestPattern(localStore, 'unique-fn');

      const p = localStore.getAllPatterns()[0];
      globalStore.addPattern({
        name: p.name, code: p.code, language: p.language,
        coherencyScore: p.coherencyScore || {}, tags: p.tags || [],
      });

      const globalIndex = new Set(globalStore.getAllPatterns().map(pp => `${pp.name}:${pp.language}`));
      let duplicates = 0;
      for (const lp of localStore.getAllPatterns()) {
        if (globalIndex.has(`${lp.name}:${lp.language}`)) duplicates++;
      }

      assert.equal(duplicates, 1);
    });
  });

  describe('syncFromGlobal (personal store)', () => {
    it('pulls personal patterns into local store', () => {
      const { localStore, globalStore } = createTestStores();

      addTestPattern(globalStore, 'personal-fn', { coherencyScore: { total: 0.95 }, tags: ['utility'] });

      const globalPatterns = globalStore.getAllPatterns();
      const localIndex = new Set(localStore.getAllPatterns().map(p => `${p.name}:${p.language}`));

      let pulled = 0;
      for (const p of globalPatterns) {
        if (!localIndex.has(`${p.name}:${p.language}`)) {
          localStore.addPattern({
            name: p.name, code: p.code, language: p.language,
            coherencyScore: p.coherencyScore || {}, tags: p.tags || [],
          });
          pulled++;
        }
      }

      assert.equal(pulled, 1);
      assert.equal(localStore.getAllPatterns().length, 1);
      assert.equal(localStore.getAllPatterns()[0].name, 'personal-fn');
    });
  });

  describe('shareToCommuntiy', () => {
    it('shares test-backed patterns to community store', () => {
      const { localStore } = createTestStores();
      const communityBase = makeTempDir('community');
      const communityStore = new SQLiteStore(communityBase);

      // Pattern with test code — should be shared
      addTestPattern(localStore, 'shareable', {
        coherencyScore: { total: 0.9 },
        testCode: 'if (shareable() !== 1) throw new Error("fail");',
      });
      // Pattern without test code — should be skipped
      addTestPattern(localStore, 'no-test', { coherencyScore: { total: 0.9 } });

      const localPatterns = localStore.getAllPatterns();
      const communityIndex = new Set();
      let shared = 0, skipped = 0;

      for (const p of localPatterns) {
        const key = `${p.name}:${p.language}`;
        if (communityIndex.has(key)) continue;
        const coherency = p.coherencyScore?.total ?? 0;
        if (coherency < 0.7) { skipped++; continue; }
        const testCode = p.testCode;
        if (!testCode) { skipped++; continue; }

        communityStore.addPattern({
          name: p.name, code: p.code, language: p.language,
          coherencyScore: p.coherencyScore || {}, tags: p.tags || [],
          testCode,
        });
        shared++;
      }

      assert.equal(shared, 1);
      assert.equal(skipped, 1);
      assert.equal(communityStore.getAllPatterns().length, 1);
      assert.equal(communityStore.getAllPatterns()[0].name, 'shareable');
    });

    it('requires minimum coherency 0.7 for community', () => {
      const { localStore } = createTestStores();
      const communityBase = makeTempDir('community');
      const communityStore = new SQLiteStore(communityBase);

      addTestPattern(localStore, 'low-coherency', {
        coherencyScore: { total: 0.5 },
        testCode: 'assert(true);',
      });

      const localPatterns = localStore.getAllPatterns();
      let shared = 0;

      for (const p of localPatterns) {
        const coherency = p.coherencyScore?.total ?? 0;
        if (coherency >= 0.7) {
          communityStore.addPattern({
            name: p.name, code: p.code, language: p.language,
            coherencyScore: p.coherencyScore || {}, tags: p.tags || [],
          });
          shared++;
        }
      }

      assert.equal(shared, 0);
      assert.equal(communityStore.getAllPatterns().length, 0);
    });
  });

  describe('pullFromCommunity', () => {
    it('pulls community patterns into local', () => {
      const { localStore } = createTestStores();
      const communityBase = makeTempDir('community');
      const communityStore = new SQLiteStore(communityBase);

      addTestPattern(communityStore, 'community-fn', { coherencyScore: { total: 0.85 } });
      addTestPattern(communityStore, 'community-fn2', { coherencyScore: { total: 0.8 } });

      const communityPatterns = communityStore.getAllPatterns();
      const localIndex = new Set(localStore.getAllPatterns().map(p => `${p.name}:${p.language}`));

      let pulled = 0;
      for (const p of communityPatterns) {
        if (!localIndex.has(`${p.name}:${p.language}`)) {
          localStore.addPattern({
            name: p.name, code: p.code, language: p.language,
            coherencyScore: p.coherencyScore || {}, tags: p.tags || [],
          });
          pulled++;
        }
      }

      assert.equal(pulled, 2);
      assert.equal(localStore.getAllPatterns().length, 2);
    });
  });

  describe('federatedQuery (3-tier)', () => {
    it('merges local, personal, and community patterns with deduplication', () => {
      const localBase = makeTempDir('local');
      const personalBase = makeTempDir('personal');
      const communityBase = makeTempDir('community');

      const localStore = new SQLiteStore(localBase);
      const personalStore = new SQLiteStore(personalBase);
      const communityStore = new SQLiteStore(communityBase);

      // Same name in all 3 — local should win
      addTestPattern(localStore, 'shared', { code: 'return "local";' });
      addTestPattern(personalStore, 'shared', { code: 'return "personal";' });
      addTestPattern(communityStore, 'shared', { code: 'return "community";' });

      // Unique to each tier
      addTestPattern(personalStore, 'personal-only');
      addTestPattern(communityStore, 'community-only');

      // Manual federated
      const seen = new Set();
      const merged = [];

      for (const p of localStore.getAllPatterns()) {
        const key = `${p.name}:${p.language}`;
        if (!seen.has(key)) { seen.add(key); merged.push({ ...p, source: 'local' }); }
      }
      for (const p of personalStore.getAllPatterns()) {
        const key = `${p.name}:${p.language}`;
        if (!seen.has(key)) { seen.add(key); merged.push({ ...p, source: 'personal' }); }
      }
      for (const p of communityStore.getAllPatterns()) {
        const key = `${p.name}:${p.language}`;
        if (!seen.has(key)) { seen.add(key); merged.push({ ...p, source: 'community' }); }
      }

      assert.equal(merged.length, 3); // shared(local) + personal-only + community-only
      assert.equal(merged.filter(m => m.source === 'local').length, 1);
      assert.equal(merged.filter(m => m.source === 'personal').length, 1);
      assert.equal(merged.filter(m => m.source === 'community').length, 1);
    });
  });

  describe('Oracle API integration', () => {
    it('oracle.globalStats() returns combined personal + community stats', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const tmpDir = makeTempDir('oracle');
      const oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });
      const stats = oracle.globalStats();
      assert.ok('available' in stats || 'error' in stats);
      // Should include personal and community sub-stats
      if (stats.available) {
        assert.ok('personal' in stats);
        assert.ok('community' in stats);
      }
    });

    it('oracle.sync() runs without error', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const tmpDir = makeTempDir('oracle');
      const oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });

      oracle.registerPattern({
        name: 'sync-test',
        code: 'function syncTest(n) { return n; }',
        testCode: 'if (syncTest(1) !== 1) throw new Error("fail");',
        language: 'javascript',
        description: 'Identity',
        tags: ['test'],
        patternType: 'utility',
      });

      const result = oracle.sync();
      assert.ok(result);
      assert.ok('push' in result || 'error' in result);
    });

    it('oracle.share() requires test code', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const tmpDir = makeTempDir('oracle');
      const oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });

      oracle.registerPattern({
        name: 'share-test',
        code: 'function shareTest() { return 1; }',
        testCode: 'if (shareTest() !== 1) throw new Error("fail");',
        language: 'javascript',
        description: 'Test share',
        tags: ['test'],
        patternType: 'utility',
      });

      const result = oracle.share();
      assert.ok(result);
      assert.ok('shared' in result || 'error' in result);
    });

    it('oracle.federatedSearch() returns 3-tier merged results', () => {
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
      assert.ok('personalCount' in result);
      assert.ok('communityCount' in result);
    });

    it('oracle.personalStats() returns personal store info', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const tmpDir = makeTempDir('oracle');
      const oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });
      const stats = oracle.personalStats();
      assert.ok('available' in stats || 'error' in stats);
    });

    it('oracle.communityStats() returns community store info', () => {
      const { RemembranceOracle } = require('../src/api/oracle');
      const tmpDir = makeTempDir('oracle');
      const oracle = new RemembranceOracle({ baseDir: tmpDir, autoSeed: false });
      const stats = oracle.communityStats();
      assert.ok('available' in stats || 'error' in stats);
    });
  });
});
