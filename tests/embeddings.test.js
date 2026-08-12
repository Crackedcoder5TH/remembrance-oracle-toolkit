const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  expandQuery,
  identifyConcepts,
  semanticSimilarity,
  semanticSearch,
  charNgrams,
  cosineSim,
} = require('../src/search/embeddings');

describe('expandQuery', () => {
  it('expands rate-limiting intent', () => {
    const expanded = expandQuery('prevent calling too often');
    assert.ok(expanded.includes('throttle'));
    assert.ok(expanded.includes('debounce'));
    assert.ok(expanded.includes('rate-limit'));
  });

  it('expands caching intent', () => {
    const expanded = expandQuery('remember already computed result');
    assert.ok(expanded.includes('memoize'));
    assert.ok(expanded.includes('cache'));
    assert.ok(expanded.includes('lru'));
  });

  it('preserves original terms', () => {
    const expanded = expandQuery('sort an array');
    assert.ok(expanded.includes('sort'));
    assert.ok(expanded.includes('array'));
  });

  it('handles no cluster match', () => {
    const expanded = expandQuery('quantum computing');
    assert.ok(expanded.includes('quantum'));
    assert.ok(expanded.includes('computing'));
    assert.equal(expanded.length, 2);
  });
});

describe('identifyConcepts', () => {
  it('identifies rate-limiting concepts from throttle code', () => {
    const concepts = identifyConcepts('function throttle(fn, delay) { let last = 0; return (...args) => { const now = Date.now(); if (now - last >= delay) { last = now; fn(...args); } }; }');
    const ids = concepts.map(c => c.id);
    assert.ok(ids.includes('rate-limiting'));
  });

  it('identifies caching concepts from memoize code', () => {
    const concepts = identifyConcepts('function memoize(fn) { const cache = new Map(); return (...args) => { const key = JSON.stringify(args); if (cache.has(key)) return cache.get(key); const result = fn(...args); cache.set(key, result); return result; }; }');
    const ids = concepts.map(c => c.id);
    assert.ok(ids.includes('caching'));
  });

  it('returns empty for unrelated text', () => {
    const concepts = identifyConcepts('hello world quantum physics');
    assert.equal(concepts.length, 0);
  });
});

describe('semanticSimilarity', () => {
  it('scores high for intent-matching query + code', () => {
    const result = semanticSimilarity(
      'prevent calling too often',
      'function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }'
    );
    assert.ok(result.similarity > 0.2, `Expected > 0.2, got ${result.similarity}`);
    assert.ok(result.matchedConcepts.includes('rate-limiting'));
  });

  it('scores low for unrelated query + code', () => {
    const result = semanticSimilarity(
      'quantum computing simulation',
      'function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }'
    );
    assert.ok(result.similarity < 0.15, `Expected < 0.15, got ${result.similarity}`);
  });

  it('scores high for synonym-level match', () => {
    const result = semanticSimilarity(
      'remember results already computed',
      'function memoize(fn) { const cache = new Map(); return (...args) => { const key = JSON.stringify(args); if (cache.has(key)) return cache.get(key); const r = fn(...args); cache.set(key, r); return r; }; }'
    );
    assert.ok(result.similarity > 0.15, `Expected > 0.15, got ${result.similarity}`);
  });
});

describe('semanticSearch', () => {
  const items = [
    { id: '1', name: 'debounce', description: 'Delay function execution', tags: ['utility', 'rate-limit'], code: 'function debounce(fn, d) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; }', language: 'javascript' },
    { id: '2', name: 'merge-sort', description: 'Sort array using merge sort', tags: ['algorithm', 'sort'], code: 'function mergeSort(arr) { if (arr.length <= 1) return arr; }', language: 'javascript' },
    { id: '3', name: 'memoize', description: 'Cache function results', tags: ['utility', 'cache'], code: 'function memoize(fn) { const cache = new Map(); return (...a) => { const k = JSON.stringify(a); if (cache.has(k)) return cache.get(k); const r = fn(...a); cache.set(k, r); return r; }; }', language: 'javascript' },
    { id: '4', name: 'binary-search', description: 'Find element in sorted array', tags: ['algorithm', 'search'], code: 'function bsearch(arr, t) { let lo = 0, hi = arr.length - 1; while (lo <= hi) { const mid = (lo + hi) >> 1; if (arr[mid] === t) return mid; arr[mid] < t ? lo = mid + 1 : hi = mid - 1; } return -1; }', language: 'javascript' },
  ];

  it('ranks throttle/debounce first for rate-limiting intent', () => {
    const results = semanticSearch(items, 'prevent calling too often');
    assert.ok(results.length > 0);
    assert.equal(results[0].id, '1'); // debounce
  });

  it('ranks memoize first for caching intent', () => {
    const results = semanticSearch(items, 'remember computed results');
    assert.ok(results.length > 0);
    assert.equal(results[0].id, '3'); // memoize
  });

  it('ranks sort first for sorting intent', () => {
    const results = semanticSearch(items, 'arrange numbers in ascending order');
    assert.ok(results.length > 0);
    assert.equal(results[0].id, '2'); // merge-sort
  });

  it('filters by language', () => {
    const results = semanticSearch(items, 'sort', { language: 'python' });
    assert.equal(results.length, 0);
  });
});

describe('charNgrams', () => {
  it('generates correct bigrams', () => {
    const grams = charNgrams('abc', 2);
    assert.deepEqual(grams, { ab: 1, bc: 1 });
  });

  it('counts repeated grams', () => {
    const grams = charNgrams('abab', 2);
    assert.equal(grams['ab'], 2);
    assert.equal(grams['ba'], 1);
  });
});

describe('cosineSim', () => {
  it('returns 1 for identical vectors', () => {
    const v = { a: 1, b: 2 };
    assert.ok(Math.abs(cosineSim(v, v) - 1) < 1e-10);
  });

  it('returns 0 for orthogonal vectors', () => {
    assert.equal(cosineSim({ a: 1 }, { b: 1 }), 0);
  });

  it('handles empty vectors', () => {
    assert.equal(cosineSim({}, {}), 0);
  });
});
