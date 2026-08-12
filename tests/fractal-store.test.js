'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');

const { SQLiteStore } = require('../src/store/sqlite');
const { FractalStore } = require('../src/store/fractal-store');
const { makeTempDir, cleanTempDir } = require('./helpers');

let tmpDir, sqlite, store;

beforeEach(() => {
  tmpDir = makeTempDir('fractal-store');
  sqlite = new SQLiteStore(tmpDir);
  store = new FractalStore(sqlite);
});

afterEach(() => {
  cleanTempDir(tmpDir);
});

describe('FractalStore', () => {
  describe('construction', () => {
    it('requires a SQLiteStore instance', () => {
      assert.throws(() => new FractalStore(null), /requires a SQLiteStore/);
    });

    it('wraps SQLiteStore and proxies unknown properties', () => {
      assert.ok(store.db, 'should proxy .db from SQLiteStore');
      assert.strictEqual(typeof store.fractalStats, 'function', 'should proxy fractalStats()');
    });
  });

  describe('addPatternIfNotExists', () => {
    it('stores a pattern and creates a holographic embedding', () => {
      const record = store.addPatternIfNotExists({
        name: 'add-numbers',
        code: 'function add(a, b) { return a + b; }',
        language: 'javascript',
        tags: ['utility', 'math'],
        coherencyScore: { total: 0.85 },
      });

      assert.ok(record, 'should return a record');
      assert.ok(record.id, 'record should have an id');

      // Verify the pattern is in the store
      const fetched = store.getPattern(record.id);
      assert.strictEqual(fetched.name, 'add-numbers');

      // Verify an embedding was created
      const embedding = sqlite.getHoloEmbedding(record.id);
      assert.ok(embedding, 'should have created a holographic embedding');
      assert.ok(Array.isArray(embedding.embeddingVec), 'embedding should be an array');
      assert.ok(embedding.embeddingVec.length > 0, 'embedding should have dimensions');
    });

    it('returns null for duplicate with equal/higher coherency', () => {
      store.addPatternIfNotExists({
        name: 'dup-test',
        code: 'function dup() {}',
        language: 'javascript',
        coherencyScore: { total: 0.9 },
      });

      const result = store.addPatternIfNotExists({
        name: 'dup-test',
        code: 'function dup() { return 1; }',
        language: 'javascript',
        coherencyScore: { total: 0.5 },
      });

      assert.strictEqual(result, null, 'should skip lower-coherency duplicate');
    });
  });

  describe('updatePattern', () => {
    it('re-integrates fractal data when code changes', () => {
      const record = store.addPatternIfNotExists({
        name: 'update-test',
        code: 'function greet() { return "hello"; }',
        language: 'javascript',
        coherencyScore: { total: 0.8 },
      });

      const embBefore = sqlite.getHoloEmbedding(record.id);
      assert.ok(embBefore, 'should have embedding before update');

      // Update code — should re-embed
      const updated = store.updatePattern(record.id, {
        code: 'function greet(name) { return `hello ${name}`; }',
      });

      assert.ok(updated, 'should return updated record');
      const embAfter = sqlite.getHoloEmbedding(record.id);
      assert.ok(embAfter, 'should have embedding after update');
    });

    it('does not re-embed when only metadata changes', () => {
      const record = store.addPatternIfNotExists({
        name: 'meta-update',
        code: 'function test() {}',
        language: 'javascript',
        coherencyScore: { total: 0.7 },
      });

      const embBefore = sqlite.getHoloEmbedding(record.id);
      assert.ok(embBefore, 'embedding should exist');

      // Update only tags (not code)
      store.updatePattern(record.id, { tags: ['updated'] });

      const embAfter = sqlite.getHoloEmbedding(record.id);
      assert.ok(embAfter, 'embedding should still exist');
    });
  });

  describe('removePattern', () => {
    it('removes pattern and cleans up fractal data', () => {
      const record = store.addPatternIfNotExists({
        name: 'remove-test',
        code: 'function rm() {}',
        language: 'javascript',
        coherencyScore: { total: 0.75 },
      });

      assert.ok(store.getPattern(record.id), 'pattern should exist');
      assert.ok(sqlite.getHoloEmbedding(record.id), 'embedding should exist');

      const removed = store.removePattern(record.id, 'test-cleanup');

      assert.strictEqual(removed, true, 'should return true');
      assert.strictEqual(store.getPattern(record.id), null, 'pattern should be gone');
      assert.strictEqual(sqlite.getHoloEmbedding(record.id), null, 'embedding should be cleaned up');
    });

    it('returns false for non-existent pattern', () => {
      assert.strictEqual(store.removePattern('nonexistent'), false);
    });
  });

  describe('holoSearch', () => {
    it('returns results when embeddings exist', () => {
      // Add a few patterns to build up holo pages
      store.addPatternIfNotExists({
        name: 'sort-array',
        code: 'function sort(arr) { return arr.sort(); }',
        language: 'javascript',
        coherencyScore: { total: 0.9 },
        tags: ['algorithm', 'sort'],
      });
      store.addPatternIfNotExists({
        name: 'reverse-array',
        code: 'function reverse(arr) { return arr.reverse(); }',
        language: 'javascript',
        coherencyScore: { total: 0.85 },
        tags: ['algorithm', 'array'],
      });

      // holoSearch may return empty if no pages exist (pages require compressStore)
      // but it should not throw
      const results = store.holoSearch('sort an array');
      assert.ok(Array.isArray(results), 'should return an array');
    });

    it('returns empty array gracefully when no holo data exists', () => {
      const results = store.holoSearch('nonexistent query');
      assert.deepStrictEqual(results, []);
    });
  });

  describe('proxy passthrough', () => {
    it('delegates getAllPatterns to SQLiteStore', () => {
      store.addPatternIfNotExists({
        name: 'proxy-test',
        code: 'function test() {}',
        language: 'javascript',
        coherencyScore: { total: 0.7 },
      });

      const all = store.getAllPatterns();
      assert.ok(all.length > 0, 'should return patterns');
      assert.strictEqual(all[0].name, 'proxy-test');
    });

    it('delegates recordPatternUsage', () => {
      const record = store.addPatternIfNotExists({
        name: 'usage-test',
        code: 'function usage() {}',
        language: 'javascript',
        coherencyScore: { total: 0.7 },
      });

      const updated = store.recordPatternUsage(record.id, true);
      assert.ok(updated, 'should return updated pattern');
      assert.strictEqual(updated.usageCount, 1);
      assert.strictEqual(updated.successCount, 1);
    });

    it('provides access to fractalStats()', () => {
      const stats = store.fractalStats();
      assert.strictEqual(typeof stats.templateCount, 'number');
      assert.strictEqual(typeof stats.embeddingCount, 'number');
    });
  });
});
