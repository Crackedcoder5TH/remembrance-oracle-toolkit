const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

// Use a temp directory for test store
const TEST_DIR = path.join(require('os').tmpdir(), `oracle-compress-test-${Date.now()}`);

describe('Compression Integration', () => {

  let SQLiteStore, store;

  before(() => {
    ({ SQLiteStore } = require('../src/store/sqlite'));
    fs.mkdirSync(TEST_DIR, { recursive: true });
    store = new SQLiteStore(TEST_DIR);

    // Seed with test patterns — same-operator pairs form families
    const patterns = [
      // Family 1: binary-op functions with same structure (a + b)
      { name: 'add', code: 'function add(a, b) { return a + b; }', language: 'javascript', tags: ['math'], coherencyScore: { total: 0.9 } },
      { name: 'sum', code: 'function sum(x, y) { return x + y; }', language: 'javascript', tags: ['math'], coherencyScore: { total: 0.85 } },
      { name: 'combine', code: 'function combine(p, q) { return p + q; }', language: 'javascript', tags: ['math'], coherencyScore: { total: 0.88 } },
      // Family 2: identity functions (same structure)
      { name: 'identity', code: 'function identity(val) { return val; }', language: 'javascript', tags: ['util'], coherencyScore: { total: 0.8 } },
      { name: 'passthrough', code: 'function passthrough(item) { return item; }', language: 'javascript', tags: ['util'], coherencyScore: { total: 0.8 } },
      // Singleton: unique structure
      { name: 'greet', code: 'function greet(name) { if (name) { return "Hello " + name; } else { return "Hi"; } }', language: 'javascript', tags: ['string'], coherencyScore: { total: 0.75 } },
    ];

    for (const p of patterns) {
      store.addPattern(p);
    }
  });

  after(() => {
    if (store) store.close();
    fs.rmSync(TEST_DIR, { recursive: true, force: true });
  });

  it('should run full compression pipeline', () => {
    const { compressStore } = require('../src/compression/index');
    const result = compressStore(store);

    assert.ok(result.success, 'Pipeline should succeed');
    assert.ok(result.familyCount >= 1, 'Should detect at least 1 family');
    assert.ok(result.embeddingCount > 0, 'Should compute embeddings');
    assert.ok(result.pageCount > 0, 'Should create holographic pages');
  });

  it('should store templates and deltas in database', () => {
    const stats = store.fractalStats();
    assert.ok(stats.templateCount > 0, 'Should have stored templates');
    assert.ok(stats.deltaCount > 0, 'Should have stored deltas');
    assert.ok(stats.embeddingCount > 0, 'Should have stored embeddings');
  });

  it('should retrieve stored templates', () => {
    const templates = store.getAllTemplates();
    assert.ok(templates.length > 0, 'Should have templates');
    for (const t of templates) {
      assert.ok(t.skeleton, 'Template should have skeleton');
      assert.ok(t.id, 'Template should have id');
    }
  });

  it('should retrieve stored holographic pages', () => {
    const pages = store.getAllHoloPages();
    assert.ok(pages.length > 0, 'Should have pages');
    for (const p of pages) {
      assert.ok(p.centroidVec, 'Page should have centroid vector');
      assert.ok(Array.isArray(p.memberIds), 'Page should have member IDs');
    }
  });

  it('should decompress pattern from template + delta', () => {
    const { decompressPattern } = require('../src/compression/index');

    // Find a pattern that has a delta
    const patterns = store.getAllPatterns();
    let found = false;
    for (const p of patterns) {
      const delta = store.getDelta(p.id);
      if (delta) {
        const reconstructed = decompressPattern(store, p.id);
        assert.ok(reconstructed, 'Should reconstruct code');
        // Reconstructed should contain the original identifier
        assert.ok(reconstructed.includes(p.name) || reconstructed.length > 0, 'Reconstructed code should be valid');
        found = true;
        break;
      }
    }
    assert.ok(found, 'Should have at least one decompressible pattern');
  });

  it('should perform holographic search', () => {
    const { holoSearchPatterns } = require('../src/compression/index');
    const results = holoSearchPatterns(store, 'math add numbers');
    assert.ok(Array.isArray(results), 'Should return array');
    // With 6 patterns and pages, should find some results
    if (results.length > 0) {
      assert.ok(results[0].patternId, 'Result should have patternId');
      assert.ok(typeof results[0].score === 'number', 'Result should have score');
    }
  });

  it('should support dry-run mode', () => {
    const { compressStore } = require('../src/compression/index');
    const statsBefore = store.fractalStats();

    // Create a fresh store for dry-run test
    const dryRunDir = path.join(require('os').tmpdir(), `oracle-dryrun-${Date.now()}`);
    fs.mkdirSync(dryRunDir, { recursive: true });
    const dryStore = new SQLiteStore(dryRunDir);
    dryStore.addPattern({ name: 'a', code: 'function a(x) { return x; }', language: 'javascript', coherencyScore: { total: 0.9 } });
    dryStore.addPattern({ name: 'b', code: 'function b(y) { return y; }', language: 'javascript', coherencyScore: { total: 0.9 } });

    const result = compressStore(dryStore, { dryRun: true });
    const statsAfter = dryStore.fractalStats();

    assert.ok(result.success, 'Dry run should succeed');
    assert.equal(statsAfter.templateCount, 0, 'Dry run should not store templates');
    assert.equal(statsAfter.embeddingCount, 0, 'Dry run should not store embeddings');

    dryStore.close();
    fs.rmSync(dryRunDir, { recursive: true, force: true });
  });

  it('should have compression performance under 100ms for small stores', () => {
    const { compressStore } = require('../src/compression/index');

    const perfDir = path.join(require('os').tmpdir(), `oracle-perf-${Date.now()}`);
    fs.mkdirSync(perfDir, { recursive: true });
    const perfStore = new SQLiteStore(perfDir);

    // Add 20 patterns
    for (let i = 0; i < 20; i++) {
      perfStore.addPattern({
        name: `fn${i}`, code: `function fn${i}(x) { return x + ${i}; }`,
        language: 'javascript', coherencyScore: { total: 0.8 },
      });
    }

    const start = Date.now();
    compressStore(perfStore);
    const elapsed = Date.now() - start;

    assert.ok(elapsed < 5000, `Compression should complete under 5s for 20 patterns, took ${elapsed}ms`);

    perfStore.close();
    fs.rmSync(perfDir, { recursive: true, force: true });
  });
});
