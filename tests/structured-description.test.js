'use strict';

const { describe, it } = require('node:test');
const assert = require('assert');

const {
  parseStructuredDescription,
  validateStructuredDescription,
  structuralSimilarity,
  createEmptyStructured,
  extractTransform,
  extractConstraints,
  inferDomain,
  setOverlap,
  tokenSimilarity,
} = require('../src/core/structured-description');

describe('Structured Description Layer', () => {
  describe('parseStructuredDescription', () => {
    it('parses a sorting description', () => {
      const result = parseStructuredDescription('takes an array and returns a sorted array');
      assert.ok(result.inputs.length > 0, 'should extract inputs');
      assert.ok(result.outputs.length > 0, 'should extract outputs');
      assert.strictEqual(result.freeform, 'takes an array and returns a sorted array');
      assert.ok(result.domain, 'should have a domain');
    });

    it('handles empty/null descriptions', () => {
      const empty = parseStructuredDescription('');
      assert.deepStrictEqual(empty.inputs, []);
      assert.strictEqual(empty.transform, '');
      assert.deepStrictEqual(empty.outputs, []);

      const nullResult = parseStructuredDescription(null);
      assert.deepStrictEqual(nullResult.inputs, []);
    });

    it('extracts transform keywords', () => {
      const result = parseStructuredDescription('filter and sort the items then merge results');
      assert.ok(result.transform.includes('filter'), 'should find filter');
      assert.ok(result.transform.includes('sort'), 'should find sort');
      assert.ok(result.transform.includes('merge'), 'should find merge');
    });

    it('extracts constraints', () => {
      const result = parseStructuredDescription('a pure, immutable sort that is thread-safe');
      assert.ok(result.constraints.includes('pure'));
      assert.ok(result.constraints.includes('immutable'));
      assert.ok(result.constraints.includes('thread-safe'));
    });

    it('infers domain from description text', () => {
      const algo = parseStructuredDescription('binary search through a sorted tree');
      assert.strictEqual(algo.domain, 'algorithm');

      const security = parseStructuredDescription('encrypt and hash the auth token');
      assert.strictEqual(security.domain, 'security');
    });

    it('uses code context for input extraction', () => {
      const result = parseStructuredDescription('adds two numbers', {
        code: 'function add(left, right) { return left + right; }',
      });
      assert.ok(result.inputs.length >= 1, 'should extract params from code');
      assert.ok(result.inputs.some(i => i === 'left' || i === 'right'), 'should find param names');
    });
  });

  describe('validateStructuredDescription', () => {
    it('accepts a valid structured description', () => {
      const valid = {
        inputs: ['number'],
        transform: 'sort',
        outputs: ['array'],
        constraints: ['stable'],
        domain: 'algorithm',
      };
      const result = validateStructuredDescription(valid);
      assert.strictEqual(result.valid, true);
      assert.strictEqual(result.errors.length, 0);
    });

    it('rejects null/undefined', () => {
      const result = validateStructuredDescription(null);
      assert.strictEqual(result.valid, false);
    });

    it('reports missing fields', () => {
      const result = validateStructuredDescription({ inputs: 'not-array' });
      assert.strictEqual(result.valid, false);
      assert.ok(result.errors.length > 0);
    });
  });

  describe('structuralSimilarity', () => {
    it('returns 1.0 for identical structures', () => {
      const desc = {
        inputs: ['array'],
        transform: 'sort',
        outputs: ['array'],
        constraints: ['stable'],
        domain: 'algorithm',
      };
      assert.strictEqual(structuralSimilarity(desc, desc), 1.0);
    });

    it('returns 0 for completely different structures', () => {
      const a = {
        inputs: ['string'],
        transform: 'encrypt',
        outputs: ['buffer'],
        constraints: ['async'],
        domain: 'security',
      };
      const b = {
        inputs: ['number'],
        transform: 'sort',
        outputs: ['array'],
        constraints: ['stable'],
        domain: 'algorithm',
      };
      const sim = structuralSimilarity(a, b);
      assert.ok(sim < 0.3, `Expected low similarity, got ${sim}`);
    });

    it('returns moderate similarity for partially matching structures', () => {
      const a = {
        inputs: ['array'],
        transform: 'sort-filter',
        outputs: ['array'],
        constraints: ['stable'],
        domain: 'algorithm',
      };
      const b = {
        inputs: ['array'],
        transform: 'sort-merge',
        outputs: ['array'],
        constraints: ['in-place'],
        domain: 'algorithm',
      };
      const sim = structuralSimilarity(a, b);
      assert.ok(sim > 0.4, `Expected moderate similarity, got ${sim}`);
      assert.ok(sim < 1.0, `Expected less than perfect, got ${sim}`);
    });

    it('handles null/undefined gracefully', () => {
      assert.strictEqual(structuralSimilarity(null, null), 0);
      assert.strictEqual(structuralSimilarity({}, null), 0);
    });
  });

  describe('createEmptyStructured', () => {
    it('creates a valid empty structure', () => {
      const empty = createEmptyStructured('some text');
      assert.deepStrictEqual(empty.inputs, []);
      assert.strictEqual(empty.transform, '');
      assert.deepStrictEqual(empty.outputs, []);
      assert.deepStrictEqual(empty.constraints, []);
      assert.strictEqual(empty.domain, 'general');
      assert.strictEqual(empty.freeform, 'some text');
    });
  });

  describe('setOverlap', () => {
    it('returns 1.0 for identical sets', () => {
      assert.strictEqual(setOverlap(['a', 'b'], ['a', 'b']), 1.0);
    });

    it('returns 0.0 for disjoint sets', () => {
      assert.strictEqual(setOverlap(['a'], ['b']), 0.0);
    });

    it('returns 1.0 for two empty sets', () => {
      assert.strictEqual(setOverlap([], []), 1.0);
    });

    it('returns 0.0 when one set is empty', () => {
      assert.strictEqual(setOverlap(['a'], []), 0.0);
    });

    it('computes Jaccard correctly', () => {
      const overlap = setOverlap(['a', 'b', 'c'], ['b', 'c', 'd']);
      assert.ok(Math.abs(overlap - 0.5) < 0.01, `Expected ~0.5, got ${overlap}`);
    });
  });

  describe('tokenSimilarity', () => {
    it('returns 1.0 for identical strings', () => {
      assert.strictEqual(tokenSimilarity('sort-filter', 'sort-filter'), 1.0);
    });

    it('returns 0.0 for empty strings', () => {
      assert.strictEqual(tokenSimilarity('', ''), 0.0);
    });

    it('finds partial matches', () => {
      const sim = tokenSimilarity('sort-filter', 'sort-merge');
      assert.ok(sim > 0.2 && sim < 0.8, `Expected partial match, got ${sim}`);
    });
  });

  describe('inferDomain', () => {
    it('detects algorithm domain', () => {
      assert.strictEqual(inferDomain('sort and search through binary tree', []), 'algorithm');
    });

    it('detects network domain', () => {
      assert.strictEqual(inferDomain('http fetch api request', []), 'network');
    });

    it('defaults to general for unknown text', () => {
      assert.strictEqual(inferDomain('something completely unrelated xyzzy', []), 'general');
    });

    it('uses tags as additional signal', () => {
      const domain = inferDomain('process data', ['encryption', 'hash', 'auth']);
      assert.strictEqual(domain, 'security');
    });
  });

  describe('integration with pattern library', () => {
    it('parseStructuredDescription result passes validation', () => {
      const parsed = parseStructuredDescription('takes a list and returns sorted unique items');
      const validation = validateStructuredDescription(parsed);
      assert.strictEqual(validation.valid, true, `Errors: ${validation.errors.join(', ')}`);
    });

    it('cross-domain matching finds structural isomorphisms', () => {
      // Same structural pattern, different domains
      const sortDesc = parseStructuredDescription('takes an array and returns a sorted array');
      const filterDesc = parseStructuredDescription('takes an array and returns a filtered array');
      const encryptDesc = parseStructuredDescription('takes a string and returns encrypted buffer');

      const sortFilterSim = structuralSimilarity(sortDesc, filterDesc);
      const sortEncryptSim = structuralSimilarity(sortDesc, encryptDesc);

      // sort and filter should be more structurally similar than sort and encrypt
      assert.ok(sortFilterSim > sortEncryptSim,
        `sort-filter similarity (${sortFilterSim}) should exceed sort-encrypt (${sortEncryptSim})`);
    });
  });
});
