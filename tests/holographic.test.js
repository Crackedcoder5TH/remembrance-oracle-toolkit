const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { holoEmbed, createPage, holoSearch, cosineSimilarity, HOLO_DIMS } = require('../src/compression/holographic');

describe('Holographic Encoding', () => {

  describe('holoEmbed', () => {

    it('should produce a 128-dimensional vector', () => {
      const pattern = { code: 'function add(a, b) { return a + b; }', name: 'add', description: 'adds two numbers', tags: ['math'] };
      const vec = holoEmbed(pattern);
      assert.equal(vec.length, HOLO_DIMS, `Should be ${HOLO_DIMS} dimensions`);
    });

    it('should produce a unit vector (L2 normalized)', () => {
      const pattern = { code: 'function sort(arr) { return arr.sort(); }', name: 'sort', description: 'sorts array', tags: ['sorting'] };
      const vec = holoEmbed(pattern);
      const mag = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0));
      assert.ok(Math.abs(mag - 1.0) < 0.01, `Magnitude should be ~1.0, got ${mag}`);
    });

    it('should produce similar embeddings for similar patterns', () => {
      const patA = { code: 'function add(a, b) { return a + b; }', name: 'add', description: 'add two numbers', tags: ['math'] };
      const patB = { code: 'function sum(x, y) { return x + y; }', name: 'sum', description: 'sum two values', tags: ['math'] };
      const vecA = holoEmbed(patA);
      const vecB = holoEmbed(patB);
      const sim = cosineSimilarity(vecA, vecB);
      assert.ok(sim > 0.3, `Similar patterns should have cosine > 0.3, got ${sim}`);
    });

    it('should produce dissimilar embeddings for different patterns', () => {
      const patA = { code: 'function sort(arr) { return arr.sort((a,b) => a-b); }', name: 'sort', description: 'sort array', tags: ['sorting'] };
      const patB = { code: 'async function fetchData(url) { const r = await fetch(url); return r.json(); }', name: 'fetch', description: 'fetch data from API', tags: ['networking', 'async'] };
      const vecA = holoEmbed(patA);
      const vecB = holoEmbed(patB);
      const sim = cosineSimilarity(vecA, vecB);
      assert.ok(sim < 0.7, `Different patterns should have lower similarity, got ${sim}`);
    });

    it('should handle pattern with no code', () => {
      const pattern = { code: '', name: 'empty', description: 'empty pattern', tags: [] };
      const vec = holoEmbed(pattern);
      assert.equal(vec.length, HOLO_DIMS);
    });

    it('should incorporate usage data into embeddings', () => {
      const patBase = { code: 'function x() { return 1; }', name: 'x', tags: [] };
      const patUsed = { ...patBase, usageCount: 100, successCount: 95 };
      const vecBase = holoEmbed(patBase);
      const vecUsed = holoEmbed(patUsed);
      // Embeddings should differ due to usage signals
      const sim = cosineSimilarity(vecBase, vecUsed);
      assert.ok(sim < 1.0, 'Usage data should change the embedding');
    });
  });

  describe('createPage', () => {

    it('should compute centroid and interference matrix', () => {
      const members = [
        { patternId: 'p1', embedding: [1, 0, 0, 0] },
        { patternId: 'p2', embedding: [0, 1, 0, 0] },
        { patternId: 'p3', embedding: [0, 0, 1, 0] },
      ];
      const page = createPage('test-page', members, 'template-1');

      assert.equal(page.id, 'test-page');
      assert.equal(page.templateId, 'template-1');
      assert.equal(page.memberCount, 3);
      assert.equal(page.centroidVec.length, 4);
      assert.equal(page.interferenceMatrix.length, 3);
      assert.equal(page.interferenceMatrix[0].length, 3);
      // Diagonal should be 1.0
      assert.equal(page.interferenceMatrix[0][0], 1.0);
      assert.equal(page.interferenceMatrix[1][1], 1.0);
    });

    it('should return null for empty members', () => {
      const page = createPage('empty', []);
      assert.equal(page, null);
    });

    it('should produce L2-normalized centroid', () => {
      const members = [
        { patternId: 'p1', embedding: [3, 4, 0] },
        { patternId: 'p2', embedding: [3, 4, 0] },
      ];
      const page = createPage('norm-test', members);
      const mag = Math.sqrt(page.centroidVec.reduce((s, v) => s + v * v, 0));
      assert.ok(Math.abs(mag - 1.0) < 0.01, `Centroid should be unit vector, got magnitude ${mag}`);
    });
  });

  describe('holoSearch', () => {

    it('should return ranked results by cosine similarity', () => {
      const queryEmb = [1, 0, 0, 0];
      const pages = [
        { id: 'page1', centroidVec: [0.9, 0.1, 0, 0], memberIds: ['p1', 'p2'], memberCount: 2 },
        { id: 'page2', centroidVec: [0, 0, 1, 0], memberIds: ['p3'], memberCount: 1 },
      ];
      const embeddingMap = new Map([
        ['p1', [1, 0, 0, 0]],
        ['p2', [0.5, 0.5, 0, 0]],
        ['p3', [0, 0, 1, 0]],
      ]);

      const results = holoSearch(queryEmb, pages, embeddingMap, { topK: 2 });
      assert.ok(results.length >= 1, 'Should find at least 1 result');
      assert.equal(results[0].patternId, 'p1', 'Most similar pattern should rank first');
    });

    it('should return empty for no pages', () => {
      const results = holoSearch([1, 0], [], new Map());
      assert.equal(results.length, 0);
    });

    it('should respect minScore threshold', () => {
      const queryEmb = [1, 0, 0, 0];
      const pages = [
        { id: 'page1', centroidVec: [0, 0, 1, 0], memberIds: ['p1'], memberCount: 1 },
      ];
      const embeddingMap = new Map([['p1', [0, 0, 1, 0]]]);

      const results = holoSearch(queryEmb, pages, embeddingMap, { minScore: 0.9 });
      assert.equal(results.length, 0, 'Should filter out low-scoring results');
    });

    it('should deduplicate across pages', () => {
      const queryEmb = [1, 0, 0, 0];
      const pages = [
        { id: 'page1', centroidVec: [1, 0, 0, 0], memberIds: ['p1'], memberCount: 1 },
        { id: 'page2', centroidVec: [0.9, 0.1, 0, 0], memberIds: ['p1'], memberCount: 1 },
      ];
      const embeddingMap = new Map([['p1', [1, 0, 0, 0]]]);

      const results = holoSearch(queryEmb, pages, embeddingMap, { topK: 5 });
      const ids = results.map(r => r.patternId);
      assert.equal(new Set(ids).size, ids.length, 'Should not have duplicates');
    });
  });
});
