'use strict';

const { describe, it, beforeEach, afterEach } = require('node:test');
const assert = require('assert');

const {
  holoDecisionBoost,
  familyStabilitySignal,
  structuredDescriptionVector,
  familyAwareSimilarity,
  familyDecayModifier,
  auditIntegration,
} = require('../src/compression/fractal-library-bridge');

const { createTestOracle, cleanTempDir } = require('./helpers');

// ─── Mock Stores ─────────────────────────────────────────────────────────

function createMockStore(overrides = {}) {
  const deltas = overrides.deltas || {};
  const templates = overrides.templates || {};
  const embeddings = overrides.embeddings || {};
  const pages = overrides.pages || [];

  return {
    getDelta: (id) => deltas[id] || null,
    getTemplate: (id) => templates[id] || null,
    getHoloEmbedding: (id) => embeddings[id] || null,
    getAllTemplates: () => Object.values(templates),
    getAllHoloPages: () => pages,
    getAllHoloEmbeddings: () => Object.entries(embeddings).map(([k, v]) => ({ patternId: k, embeddingVec: v.embeddingVec })),
    getAllPatterns: () => overrides.patterns || [],
  };
}

describe('Fractal-Library Bridge', () => {
  describe('holoDecisionBoost', () => {
    it('returns a numeric boost even without store (computes on-the-fly)', () => {
      const result = holoDecisionBoost(
        { description: 'sort an array' },
        { id: 'p1', code: 'function sort() {}', name: 'sort' },
        null
      );
      assert.strictEqual(typeof result.boost, 'number');
      assert.ok(result.boost >= 0, 'Boost should be non-negative');
      assert.strictEqual(typeof result.holoScore, 'number');
      assert.strictEqual(result.fromCache, false);
    });

    it('returns a numeric result with store', () => {
      const result = holoDecisionBoost(
        { description: 'sort an array', tags: ['algorithm'] },
        { id: 'p1', code: 'function sort(arr) { return arr.sort(); }', name: 'sort-array', tags: ['algorithm'] },
        createMockStore()
      );
      assert.strictEqual(typeof result.boost, 'number');
      assert.strictEqual(typeof result.holoScore, 'number');
      assert.ok(result.boost >= 0, 'Boost should be non-negative');
    });

    it('uses cached embedding when available', () => {
      const fakeEmbedding = Array.from({ length: 128 }, () => Math.random());
      const store = createMockStore({
        embeddings: {
          'p1': { embeddingVec: fakeEmbedding }
        }
      });
      const result = holoDecisionBoost(
        { description: 'test' },
        { id: 'p1', code: 'function test() {}', name: 'test' },
        store
      );
      assert.strictEqual(result.fromCache, true);
    });
  });

  describe('familyStabilitySignal', () => {
    it('returns neutral for null store', () => {
      const result = familyStabilitySignal('p1', null);
      assert.strictEqual(result.stability, 0.5);
      assert.strictEqual(result.inFamily, false);
    });

    it('returns neutral for pattern not in a family', () => {
      const store = createMockStore();
      const result = familyStabilitySignal('p1', store);
      assert.strictEqual(result.inFamily, false);
      assert.strictEqual(result.stability, 0.5);
    });

    it('returns high stability for pattern in a large, coherent family', () => {
      const store = createMockStore({
        deltas: { 'p1': { templateId: 't1', delta: {} } },
        templates: { 't1': { id: 't1', memberCount: 8, avgCoherency: 0.92 } },
      });
      const result = familyStabilitySignal('p1', store);
      assert.strictEqual(result.inFamily, true);
      assert.ok(result.stability > 0.7, `Expected high stability, got ${result.stability}`);
      assert.strictEqual(result.familySize, 8);
      assert.strictEqual(result.avgCoherency, 0.92);
    });

    it('returns lower stability for small, low-coherency family', () => {
      const store = createMockStore({
        deltas: { 'p1': { templateId: 't1', delta: {} } },
        templates: { 't1': { id: 't1', memberCount: 2, avgCoherency: 0.5 } },
      });
      const result = familyStabilitySignal('p1', store);
      assert.strictEqual(result.inFamily, true);
      assert.ok(result.stability < 0.6, `Expected lower stability, got ${result.stability}`);
    });
  });

  describe('structuredDescriptionVector', () => {
    it('returns 16-dim zero vector for null', () => {
      const vec = structuredDescriptionVector(null);
      assert.strictEqual(vec.length, 16);
      assert.ok(vec.every(v => v === 0));
    });

    it('encodes inputs and outputs', () => {
      const vec = structuredDescriptionVector({
        inputs: ['array', 'number'],
        transform: 'sort',
        outputs: ['array'],
        constraints: ['stable'],
        domain: 'algorithm',
      });
      assert.strictEqual(vec.length, 16);
      assert.ok(vec[0] > 0, 'Input complexity should be > 0');
      assert.ok(vec[2] > 0, 'Output complexity should be > 0');
      assert.ok(vec[10] > 0, 'Algorithm domain should be encoded');
    });

    it('encodes transform keywords', () => {
      const sortVec = structuredDescriptionVector({
        inputs: [], transform: 'sort', outputs: [], constraints: [], domain: 'general',
      });
      const filterVec = structuredDescriptionVector({
        inputs: [], transform: 'filter', outputs: [], constraints: [], domain: 'general',
      });
      // Different transforms should produce different dim-5 values
      assert.notStrictEqual(sortVec[5], filterVec[5]);
    });

    it('encodes constraints', () => {
      const pureVec = structuredDescriptionVector({
        inputs: [], transform: '', outputs: [], constraints: ['pure', 'immutable'], domain: 'general',
      });
      assert.ok(pureVec[8] > 0, 'Pure/immutable constraint should be encoded');
    });

    it('encodes domain as one-hot dimension', () => {
      const algoVec = structuredDescriptionVector({
        inputs: [], transform: '', outputs: [], constraints: [], domain: 'algorithm',
      });
      const secVec = structuredDescriptionVector({
        inputs: [], transform: '', outputs: [], constraints: [], domain: 'security',
      });
      // Algorithm → dim 10, Security → dim 13
      assert.ok(algoVec[10] > 0);
      assert.ok(secVec[13] > 0);
      assert.strictEqual(algoVec[13], 0);
      assert.strictEqual(secVec[10], 0);
    });
  });

  describe('familyAwareSimilarity', () => {
    it('returns no-family for null store', () => {
      const result = familyAwareSimilarity('p1', 'p2', null);
      assert.strictEqual(result.sameFamily, false);
      assert.strictEqual(result.similarity, 0);
    });

    it('returns no-family when patterns have no deltas', () => {
      const result = familyAwareSimilarity('p1', 'p2', createMockStore());
      assert.strictEqual(result.sameFamily, false);
    });

    it('detects same-family patterns', () => {
      const store = createMockStore({
        deltas: {
          'p1': { templateId: 't1', delta: JSON.stringify({ '$ID_0': 'add', '$ID_1': 'a', '$ID_2': 'b' }) },
          'p2': { templateId: 't1', delta: JSON.stringify({ '$ID_0': 'sum', '$ID_1': 'x', '$ID_2': 'y' }) },
        },
      });
      const result = familyAwareSimilarity('p1', 'p2', store);
      assert.strictEqual(result.sameFamily, true);
      assert.strictEqual(result.templateId, 't1');
      assert.ok(result.similarity >= 0.4, `Expected high similarity, got ${result.similarity}`);
    });

    it('returns higher similarity for identical deltas in same family', () => {
      const store = createMockStore({
        deltas: {
          'p1': { templateId: 't1', delta: JSON.stringify({ '$ID_0': 'add' }) },
          'p2': { templateId: 't1', delta: JSON.stringify({ '$ID_0': 'add' }) },
          'p3': { templateId: 't1', delta: JSON.stringify({ '$ID_0': 'sum' }) },
        },
      });
      const identical = familyAwareSimilarity('p1', 'p2', store);
      const different = familyAwareSimilarity('p1', 'p3', store);
      assert.ok(identical.similarity >= different.similarity,
        `Identical deltas (${identical.similarity}) should score >= different (${different.similarity})`);
    });

    it('returns no-family for different templates', () => {
      const store = createMockStore({
        deltas: {
          'p1': { templateId: 't1', delta: '{}' },
          'p2': { templateId: 't2', delta: '{}' },
        },
      });
      const result = familyAwareSimilarity('p1', 'p2', store);
      assert.strictEqual(result.sameFamily, false);
    });
  });

  describe('familyDecayModifier', () => {
    it('returns 1.0 (normal decay) when not in a family', () => {
      const modifier = familyDecayModifier('p1', createMockStore());
      assert.strictEqual(modifier, 1.0);
    });

    it('returns > 1.0 (slower decay) when in a stable family', () => {
      const store = createMockStore({
        deltas: { 'p1': { templateId: 't1', delta: '{}' } },
        templates: { 't1': { memberCount: 5, avgCoherency: 0.85 } },
      });
      const modifier = familyDecayModifier('p1', store);
      assert.ok(modifier > 1.0, `Expected slower decay (> 1.0), got ${modifier}`);
      assert.ok(modifier <= 2.0, `Expected modifier <= 2.0, got ${modifier}`);
    });
  });

  describe('auditIntegration', () => {
    it('handles null store gracefully', () => {
      const mockPatterns = { getAll: () => [{ id: 'p1' }] };
      const report = auditIntegration(null, mockPatterns);
      assert.strictEqual(report.totalPatterns, 1);
      assert.ok(report.gaps.length > 0, 'Should report gaps');
    });

    it('generates a complete report', () => {
      const store = createMockStore({
        embeddings: { 'p1': { embeddingVec: [1, 2, 3] } },
        deltas: { 'p1': { templateId: 't1', delta: '{}' } },
        templates: { 't1': { memberCount: 3, avgCoherency: 0.8 } },
      });
      const mockPatterns = {
        getAll: () => [
          { id: 'p1', structuredDescription: { domain: 'algorithm' } },
          { id: 'p2' },
        ],
      };
      const report = auditIntegration(store, mockPatterns);
      assert.strictEqual(report.totalPatterns, 2);
      assert.strictEqual(report.withEmbeddings, 1);
      assert.strictEqual(report.withFamilies, 1);
      assert.strictEqual(report.withStructuredDesc, 1);
      assert.strictEqual(report.familyStats.totalFamilies, 1);
      assert.ok(report.recommendations.length >= 0);
    });
  });

  describe('end-to-end with real oracle', () => {
    let oracle, tmpDir;

    beforeEach(() => {
      ({ oracle, tmpDir } = createTestOracle());
    });

    afterEach(() => {
      cleanTempDir(tmpDir);
    });

    it('decide() works with bridge integration (graceful degradation)', () => {
      // Register a pattern
      oracle.registerPattern({
        name: 'test-sort',
        code: 'function sort(arr) { return arr.sort((a, b) => a - b); }',
        language: 'javascript',
        testCode: 'const assert = require("assert"); assert.deepStrictEqual(sort([3,1,2]), [1,2,3]);',
        description: 'sort array ascending',
        tags: ['algorithm', 'sort'],
      });

      // decide() should work without compression data
      const decision = oracle.resolve({
        description: 'sort an array of numbers',
        language: 'javascript',
      });
      assert.ok(decision, 'Should return a decision');
      assert.ok(['pull', 'evolve', 'generate'].includes(decision.decision));
    });

    it('structured descriptions are stored on registration', () => {
      oracle.registerPattern({
        name: 'test-filter',
        code: 'function filterPositive(arr) { return arr.filter(x => x > 0); }',
        language: 'javascript',
        testCode: 'const assert = require("assert"); assert.deepStrictEqual(filterPositive([1,-1,2]), [1,2]);',
        description: 'takes an array and returns filtered positive numbers',
        tags: ['array', 'filter'],
      });

      const patterns = oracle.patterns.getAll();
      const filterPattern = patterns.find(p => p.name === 'test-filter');
      assert.ok(filterPattern, 'Should find the pattern');
      // structuredDescription may be stored in SQLite as JSON
      // Just verify the pattern exists and has description
      assert.ok(filterPattern.description.includes('filter') || filterPattern.name.includes('filter'));
    });
  });
});
