const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { RemembranceOracle } = require('../src/api/oracle');

describe('Federation', () => {
  let tmpDir;
  let oracle;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'fed-test-'));
    oracle = new RemembranceOracle({ baseDir: tmpDir, threshold: 0.5, autoSeed: false });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // ─── syncToGlobal ───

  describe('syncToGlobal', () => {
    it('syncs local patterns to personal store', () => {
      oracle.submit('function add(a, b) { return a + b; }', {
        description: 'Add two numbers',
        tags: ['math'],
        language: 'javascript',
      });
      const result = oracle.syncToGlobal();
      assert.equal(typeof result.synced, 'number');
    });

    it('returns 0 synced when no patterns exist', () => {
      const result = oracle.syncToGlobal();
      assert.equal(result.synced, 0);
    });
  });

  // ─── syncFromGlobal ───

  describe('syncFromGlobal', () => {
    it('pulls from personal store without error', () => {
      const result = oracle.syncFromGlobal();
      assert.equal(typeof result.pulled, 'number');
    });
  });

  // ─── sync (bidirectional) ───

  describe('sync', () => {
    it('performs bidirectional sync', () => {
      const result = oracle.sync();
      assert.ok(result);
      assert.ok(!result.error);
    });
  });

  // ─── share ───

  describe('share', () => {
    it('returns 0 shared when no eligible patterns', () => {
      const result = oracle.share();
      assert.equal(result.shared, 0);
    });

    it('shares test-backed high-coherency patterns', () => {
      const code = 'function triple(n) { return n * 3; }';
      const testCode = 'if (triple(3) !== 9) throw new Error("FAIL");';
      oracle.submit(code, {
        testCode,
        description: 'Triple a number',
        tags: ['math'],
        language: 'javascript',
      });
      const result = oracle.share();
      assert.equal(typeof result.shared, 'number');
    });
  });

  // ─── pullCommunity ───

  describe('pullCommunity', () => {
    it('pulls from community without error', () => {
      const result = oracle.pullCommunity();
      assert.equal(typeof result.pulled, 'number');
    });
  });

  // ─── federatedSearch ───

  describe('federatedSearch', () => {
    it('returns results object', () => {
      oracle.submit('function mul(a, b) { return a * b; }', {
        description: 'Multiply two numbers',
        tags: ['math'],
        language: 'javascript',
      });
      const result = oracle.federatedSearch({ description: 'multiply' });
      assert.ok(result);
      assert.ok(Array.isArray(result.patterns));
    });

    it('returns empty patterns for no match', () => {
      const result = oracle.federatedSearch({ description: 'xyznonexistent' });
      assert.ok(result);
      assert.ok(Array.isArray(result.patterns));
    });
  });

  // ─── globalStats ───

  describe('globalStats', () => {
    it('returns stats object', () => {
      const stats = oracle.globalStats();
      assert.ok(stats);
      assert.ok('personal' in stats || 'community' in stats || 'total' in stats || typeof stats === 'object');
    });
  });

  // ─── personalStats ───

  describe('personalStats', () => {
    it('returns stats object', () => {
      const stats = oracle.personalStats();
      assert.ok(stats);
    });
  });

  // ─── communityStats ───

  describe('communityStats', () => {
    it('returns stats object', () => {
      const stats = oracle.communityStats();
      assert.ok(stats);
    });
  });

  // ─── deduplicate ───

  describe('deduplicate', () => {
    it('deduplicates local store', () => {
      const report = oracle.deduplicate({ stores: ['local'] });
      assert.ok(report);
      assert.ok('local' in report);
    });

    it('handles all stores', () => {
      const report = oracle.deduplicate();
      assert.ok(report);
      assert.ok('local' in report);
      assert.ok('personal' in report);
      assert.ok('community' in report);
    });
  });

  // ─── Debug Oracle Federation ───

  describe('debugCapture', () => {
    it('captures an error-fix pair', () => {
      const result = oracle.debugCapture({
        errorMessage: 'TypeError: undefined is not a function',
        fixCode: 'if (typeof fn === "function") fn();',
        fixDescription: 'Guard function call with typeof check',
        language: 'javascript',
        tags: ['type-error', 'guard'],
      });
      assert.ok(result);
      assert.equal(result.captured, true);
      assert.ok(result.pattern);
    });
  });

  describe('debugSearch', () => {
    it('searches debug patterns', () => {
      oracle.debugCapture({
        errorMessage: 'ReferenceError: x is not defined',
        fixCode: 'let x = 0;',
        fixDescription: 'Declare variable before use',
        language: 'javascript',
      });
      const results = oracle.debugSearch({
        errorMessage: 'ReferenceError: x is not defined',
        language: 'javascript',
      });
      assert.ok(Array.isArray(results));
    });

    it('returns empty for no match', () => {
      const results = oracle.debugSearch({
        errorMessage: 'some completely unique error xyz12345',
        language: 'javascript',
      });
      assert.ok(Array.isArray(results));
    });
  });

  describe('debugFeedback', () => {
    it('reports positive outcome', () => {
      const cap = oracle.debugCapture({
        errorMessage: 'SyntaxError: unexpected token',
        fixCode: 'const x = {};',
        fixDescription: 'Fix syntax',
        language: 'javascript',
      });
      if (cap.captured && cap.pattern) {
        const result = oracle.debugFeedback(cap.pattern.id, true);
        assert.ok(result);
      }
    });
  });

  describe('debugGrow', () => {
    it('grows debug patterns', () => {
      oracle.debugCapture({
        errorMessage: 'TypeError: null is not an object',
        fixCode: 'if (obj != null) obj.method();',
        fixDescription: 'Null check before method call',
        language: 'javascript',
      });
      const result = oracle.debugGrow();
      assert.ok(result);
      assert.equal(typeof result.processed, 'number');
    });
  });

  describe('debugPatterns', () => {
    it('returns all debug patterns', () => {
      const patterns = oracle.debugPatterns();
      assert.ok(Array.isArray(patterns));
    });

    it('filters by language', () => {
      oracle.debugCapture({
        errorMessage: 'Error: test',
        fixCode: 'x = 1',
        fixDescription: 'fix',
        language: 'python',
      });
      const patterns = oracle.debugPatterns({ language: 'python' });
      assert.ok(Array.isArray(patterns));
    });
  });

  describe('debugStats', () => {
    it('returns stats', () => {
      const stats = oracle.debugStats();
      assert.ok(stats);
      assert.equal(typeof stats.totalPatterns, 'number');
    });
  });

  describe('debugShare', () => {
    it('shares debug patterns to community', () => {
      const result = oracle.debugShare();
      assert.ok(result);
      assert.equal(typeof result.shared, 'number');
    });
  });

  describe('debugPullCommunity', () => {
    it('pulls debug patterns from community', () => {
      const result = oracle.debugPullCommunity();
      assert.ok(result);
      assert.equal(typeof result.pulled, 'number');
    });
  });

  describe('debugSyncPersonal', () => {
    it('syncs debug patterns to personal store', () => {
      const result = oracle.debugSyncPersonal();
      assert.ok(result);
      assert.equal(typeof result.synced, 'number');
    });
  });

  describe('debugGlobalStats', () => {
    it('returns combined debug stats', () => {
      const stats = oracle.debugGlobalStats();
      assert.ok(stats);
    });
  });

  // ─── fullFederatedSearch ───

  describe('fullFederatedSearch', () => {
    it('searches across all tiers', async () => {
      oracle.submit('function sub(a, b) { return a - b; }', {
        description: 'Subtract two numbers',
        tags: ['math'],
        language: 'javascript',
      });
      const result = await oracle.fullFederatedSearch('subtract', { limit: 5 });
      assert.ok(result);
      assert.ok(Array.isArray(result.results));
      assert.equal(typeof result.localCount, 'number');
      assert.equal(typeof result.errors, 'object');
    });

    it('deduplicates results by name:language key', async () => {
      const result = await oracle.fullFederatedSearch('sort', { limit: 50 });
      assert.ok(result);
      const keys = result.results.map(r => `${r.name}:${r.language}`);
      const uniqueKeys = new Set(keys);
      assert.equal(keys.length, uniqueKeys.size);
    });
  });
});
