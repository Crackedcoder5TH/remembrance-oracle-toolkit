const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  computeRelevance,
  rankEntries,
  tokenize,
  cosineSimilarity,
  computeTF,
} = require('../src/core/relevance');

describe('tokenize', () => {
  it('lowercases and splits on non-alphanumeric', () => {
    const tokens = tokenize('Hello World! foo_bar');
    assert.deepEqual(tokens, ['hello', 'world', 'foo_bar']);
  });

  it('filters single-char tokens', () => {
    const tokens = tokenize('a b cd ef');
    assert.deepEqual(tokens, ['cd', 'ef']);
  });
});

describe('cosineSimilarity', () => {
  it('returns 1 for identical vectors', () => {
    const tf = { a: 0.5, b: 0.5 };
    assert.ok(Math.abs(cosineSimilarity(tf, tf) - 1) < 1e-10);
  });

  it('returns 0 for orthogonal vectors', () => {
    const tfA = { a: 1 };
    const tfB = { b: 1 };
    assert.equal(cosineSimilarity(tfA, tfB), 0);
  });
});

describe('computeRelevance', () => {
  it('scores high for matching tags and language', () => {
    const query = { description: 'sort array', tags: ['sort'], language: 'javascript' };
    const entry = {
      description: 'Sort array ascending',
      tags: ['sort', 'array'],
      language: 'javascript',
      coherencyScore: { total: 0.9 },
    };
    const result = computeRelevance(query, entry);
    assert.ok(result.relevance > 0.5);
  });

  it('scores low for unrelated entries', () => {
    const query = { description: 'machine learning', tags: ['ml'], language: 'python' };
    const entry = {
      description: 'CSS flex layout',
      tags: ['css', 'layout'],
      language: 'css',
      coherencyScore: { total: 0.5 },
    };
    const result = computeRelevance(query, entry);
    assert.ok(result.relevance < 0.4);
  });
});

describe('rankEntries', () => {
  it('ranks more relevant entries first', () => {
    const entries = [
      { description: 'CSS styling', tags: ['css'], language: 'css', coherencyScore: { total: 0.9 } },
      { description: 'Sort array', tags: ['sort', 'array'], language: 'javascript', coherencyScore: { total: 0.8 } },
      { description: 'Random unrelated', tags: ['other'], language: 'go', coherencyScore: { total: 0.7 } },
    ];
    const ranked = rankEntries({ description: 'sort array', tags: ['sort'], language: 'javascript' }, entries);
    assert.ok(ranked.length > 0);
    assert.ok(ranked[0].description.toLowerCase().includes('sort'));
  });

  it('filters by minimum coherency', () => {
    const entries = [
      { description: 'Good code', tags: ['a'], language: 'js', coherencyScore: { total: 0.9 } },
      { description: 'Bad code', tags: ['a'], language: 'js', coherencyScore: { total: 0.2 } },
    ];
    const ranked = rankEntries({ description: 'code', tags: ['a'] }, entries, { minCoherency: 0.5 });
    assert.equal(ranked.length, 1);
  });

  it('respects limit', () => {
    const entries = Array.from({ length: 20 }, (_, i) => ({
      description: `Entry ${i}`, tags: ['test'], language: 'js', coherencyScore: { total: 0.8 },
    }));
    const ranked = rankEntries({ description: 'entry', tags: ['test'] }, entries, { limit: 3 });
    assert.equal(ranked.length, 3);
  });
});
