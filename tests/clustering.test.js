'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const {
  clusterPatterns,
  findIsomorphisms,
  patternSimilarity,
  codeSimilarity,
  toBigrams,
  inferDomainFromTags,
} = require('../src/patterns/clustering');

// Test pattern factories
function makeTestPattern(overrides = {}) {
  return {
    id: overrides.id || `p-${Math.random().toString(36).slice(2, 8)}`,
    name: overrides.name || 'test-pattern',
    code: overrides.code || 'function test() { return 1; }',
    language: overrides.language || 'javascript',
    description: overrides.description || '',
    tags: overrides.tags || [],
    structuredDescription: overrides.structuredDescription || undefined,
    coherencyScore: overrides.coherencyScore || { total: 0.85 },
  };
}

describe('Similarity Clustering', () => {
  describe('codeSimilarity', () => {
    it('returns 1.0 for identical code', () => {
      const code = 'function add(a, b) { return a + b; }';
      assert.strictEqual(codeSimilarity(code, code), 1.0);
    });

    it('returns 0 for null/empty inputs', () => {
      assert.strictEqual(codeSimilarity(null, 'code'), 0);
      assert.strictEqual(codeSimilarity('code', null), 0);
      assert.strictEqual(codeSimilarity('', ''), 0);
    });

    it('returns high similarity for similar code', () => {
      const a = 'function add(a, b) { return a + b; }';
      const b = 'function add(x, y) { return x + y; }';
      const sim = codeSimilarity(a, b);
      assert.ok(sim > 0.6, `Expected high similarity, got ${sim}`);
    });

    it('returns low similarity for different code', () => {
      const a = 'function add(a, b) { return a + b; }';
      const b = 'class DatabaseConnection { constructor(url) { this.url = url; } }';
      const sim = codeSimilarity(a, b);
      assert.ok(sim < 0.4, `Expected low similarity, got ${sim}`);
    });
  });

  describe('toBigrams', () => {
    it('creates bigrams from text', () => {
      const bigrams = toBigrams('abc');
      assert.ok(bigrams.has('ab'));
      assert.ok(bigrams.has('bc'));
      assert.strictEqual(bigrams.size, 2);
    });

    it('normalizes whitespace', () => {
      const a = toBigrams('a  b');
      const b = toBigrams('a b');
      assert.strictEqual(a.size, b.size);
    });
  });

  describe('patternSimilarity', () => {
    it('returns high similarity for structurally similar patterns', () => {
      const a = makeTestPattern({
        name: 'sort-array',
        description: 'takes an array and returns sorted array',
        code: 'function sort(arr) { return arr.sort(); }',
        tags: ['algorithm', 'sort'],
      });
      const b = makeTestPattern({
        name: 'sort-list',
        description: 'takes a list and returns sorted list',
        code: 'function sortList(list) { return list.sort(); }',
        tags: ['algorithm', 'sort'],
      });
      const sim = patternSimilarity(a, b);
      assert.ok(sim.total > 0.5, `Expected high total, got ${sim.total}`);
    });

    it('returns low similarity for different patterns', () => {
      const a = makeTestPattern({
        name: 'encrypt-data',
        description: 'encrypt a string with a key',
        code: 'function encrypt(data, key) { return crypto.encrypt(data, key); }',
        tags: ['security'],
      });
      const b = makeTestPattern({
        name: 'sort-array',
        description: 'sort an array of numbers',
        code: 'function sort(arr) { return arr.sort((a, b) => a - b); }',
        tags: ['algorithm'],
      });
      const sim = patternSimilarity(a, b);
      assert.ok(sim.total < 0.5, `Expected low total, got ${sim.total}`);
    });
  });

  describe('clusterPatterns', () => {
    it('returns empty array for empty input', () => {
      const clusters = clusterPatterns([]);
      assert.strictEqual(clusters.length, 0);
    });

    it('returns single cluster for single pattern', () => {
      const patterns = [makeTestPattern({ name: 'only-one' })];
      const clusters = clusterPatterns(patterns);
      assert.strictEqual(clusters.length, 1);
      assert.strictEqual(clusters[0].members.length, 1);
      assert.strictEqual(clusters[0].crossDomain, false);
    });

    it('groups similar patterns together', () => {
      const patterns = [
        makeTestPattern({
          name: 'sort-ascending',
          code: 'function sortAsc(arr) { return arr.sort((a, b) => a - b); }',
          description: 'sort array ascending',
          tags: ['algorithm', 'sort'],
        }),
        makeTestPattern({
          name: 'sort-descending',
          code: 'function sortDesc(arr) { return arr.sort((a, b) => b - a); }',
          description: 'sort array descending',
          tags: ['algorithm', 'sort'],
        }),
        makeTestPattern({
          name: 'encrypt-data',
          code: 'function encrypt(data, key) { return crypto.createCipher("aes256", key).update(data); }',
          description: 'encrypt data with key',
          tags: ['security', 'encryption'],
        }),
      ];
      const clusters = clusterPatterns(patterns, { threshold: 0.4 });
      // The two sort patterns should be in the same cluster
      const sortCluster = clusters.find(c =>
        c.members.some(m => m.name === 'sort-ascending') &&
        c.members.some(m => m.name === 'sort-descending')
      );
      assert.ok(sortCluster, 'Sort patterns should be in the same cluster');
    });

    it('respects maxClusters limit', () => {
      const patterns = Array.from({ length: 20 }, (_, i) =>
        makeTestPattern({
          name: `unique-pattern-${i}`,
          code: `function unique${i}() { return ${i * 97}; }`,
        })
      );
      const clusters = clusterPatterns(patterns, { threshold: 0.99, maxClusters: 5 });
      assert.ok(clusters.length <= 5, `Expected ≤5 clusters, got ${clusters.length}`);
    });

    it('marks cross-domain clusters', () => {
      const patterns = [
        makeTestPattern({
          name: 'retry-http',
          code: 'function retry(fn, attempts) { for (let i = 0; i < attempts; i++) { try { return fn(); } catch(e) { if (i === attempts - 1) throw e; } } }',
          description: 'retry a function with attempts',
          tags: ['network', 'http'],
          structuredDescription: { inputs: ['function', 'number'], transform: 'retry', outputs: ['result'], constraints: ['async'], domain: 'network' },
        }),
        makeTestPattern({
          name: 'retry-db',
          code: 'function retryQuery(fn, attempts) { for (let i = 0; i < attempts; i++) { try { return fn(); } catch(e) { if (i === attempts - 1) throw e; } } }',
          description: 'retry a database query with attempts',
          tags: ['database'],
          structuredDescription: { inputs: ['function', 'number'], transform: 'retry', outputs: ['result'], constraints: ['async'], domain: 'io' },
        }),
      ];
      const clusters = clusterPatterns(patterns, { threshold: 0.3 });
      const combined = clusters.find(c => c.members.length === 2);
      if (combined) {
        assert.strictEqual(combined.crossDomain, true, 'Cluster should be marked cross-domain');
      }
    });
  });

  describe('findIsomorphisms', () => {
    it('returns empty for empty input', () => {
      assert.deepStrictEqual(findIsomorphisms([]), []);
    });

    it('finds cross-domain structural matches', () => {
      const patterns = [
        makeTestPattern({
          name: 'retry-http',
          description: 'retry http request',
          tags: ['network', 'http', 'retry'],
          structuredDescription: { inputs: ['function', 'number'], transform: 'retry', outputs: ['result'], constraints: ['async'], domain: 'network' },
        }),
        makeTestPattern({
          name: 'retry-database',
          description: 'retry database query',
          tags: ['database', 'retry'],
          structuredDescription: { inputs: ['function', 'number'], transform: 'retry', outputs: ['result'], constraints: ['async'], domain: 'io' },
        }),
      ];
      const isos = findIsomorphisms(patterns, { threshold: 0.3 });
      assert.ok(isos.length > 0, 'Should find retry isomorphism across domains');
      assert.notStrictEqual(isos[0].patternA.domain, isos[0].patternB.domain);
    });

    it('skips same-domain pairs', () => {
      const patterns = [
        makeTestPattern({
          name: 'sort-asc',
          structuredDescription: { inputs: ['array'], transform: 'sort', outputs: ['array'], constraints: ['stable'], domain: 'algorithm' },
        }),
        makeTestPattern({
          name: 'sort-desc',
          structuredDescription: { inputs: ['array'], transform: 'sort', outputs: ['array'], constraints: [], domain: 'algorithm' },
        }),
      ];
      const isos = findIsomorphisms(patterns);
      assert.strictEqual(isos.length, 0, 'Same-domain pairs should not be isomorphisms');
    });

    it('sorts results by structural similarity descending', () => {
      const patterns = [
        makeTestPattern({
          name: 'retry-http', tags: ['network'],
          structuredDescription: { inputs: ['function'], transform: 'retry', outputs: ['result'], constraints: [], domain: 'network' },
        }),
        makeTestPattern({
          name: 'retry-db', tags: ['database'],
          structuredDescription: { inputs: ['function'], transform: 'retry', outputs: ['result'], constraints: [], domain: 'io' },
        }),
        makeTestPattern({
          name: 'cache-http', tags: ['network'],
          structuredDescription: { inputs: ['key', 'value'], transform: 'cache', outputs: ['value'], constraints: [], domain: 'network' },
        }),
        makeTestPattern({
          name: 'cache-db', tags: ['database'],
          structuredDescription: { inputs: ['key', 'value'], transform: 'cache', outputs: ['value'], constraints: [], domain: 'io' },
        }),
      ];
      const isos = findIsomorphisms(patterns, { threshold: 0.3 });
      for (let i = 1; i < isos.length; i++) {
        assert.ok(isos[i - 1].similarity.structural >= isos[i].similarity.structural,
          'Results should be sorted by structural similarity descending');
      }
    });
  });

  describe('inferDomainFromTags', () => {
    it('detects algorithm from tags', () => {
      assert.strictEqual(inferDomainFromTags(['sort', 'array']), 'algorithm');
    });

    it('detects network from tags', () => {
      assert.strictEqual(inferDomainFromTags(['http', 'api']), 'network');
    });

    it('defaults to general', () => {
      assert.strictEqual(inferDomainFromTags(['misc', 'stuff']), 'general');
    });
  });
});
