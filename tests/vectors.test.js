const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { getVector, embedDocument, vectorSimilarity, nearestTerms, VOCABULARY, DIMENSIONS } = require('../src/core/vectors');

describe('getVector', () => {
  it('returns vector for known term', () => {
    const v = getVector('sort');
    assert.ok(v);
    assert.equal(v.length, 32);
  });

  it('returns null for unknown term', () => {
    assert.equal(getVector('xyznonexistent'), null);
  });

  it('handles hyphenated terms', () => {
    const v = getVector('binary-search');
    assert.ok(v);
    assert.equal(v.length, 32);
  });

  it('is case-insensitive', () => {
    const lower = getVector('sort');
    const upper = getVector('SORT');
    assert.deepStrictEqual(lower, upper);
  });

  it('normalizes spaces to hyphens', () => {
    const v = getVector('binary search');
    assert.ok(v);
  });
});

describe('embedDocument', () => {
  it('returns 32-dimensional vector', () => {
    const v = embedDocument('sort an array using quicksort');
    assert.equal(v.length, 32);
  });

  it('normalizes to unit vector', () => {
    const v = embedDocument('binary search algorithm');
    let mag = 0;
    for (let i = 0; i < 32; i++) mag += v[i] * v[i];
    mag = Math.sqrt(mag);
    assert.ok(Math.abs(mag - 1.0) < 0.01, `expected unit vector, got magnitude ${mag}`);
  });

  it('returns zero vector for unknown text', () => {
    const v = embedDocument('xyzxyz abcabc');
    const allZero = v.every(x => x === 0);
    assert.ok(allZero);
  });

  it('handles bigrams', () => {
    const withBigram = embedDocument('binary search');
    const withoutBigram = embedDocument('binary');
    // They should differ since bigram adds signal
    assert.notDeepStrictEqual(withBigram, withoutBigram);
  });
});

describe('vectorSimilarity', () => {
  it('returns high similarity for related concepts', () => {
    const sim = vectorSimilarity('quicksort algorithm', 'merge sort array');
    assert.ok(sim > 0.7, `expected > 0.7, got ${sim}`);
  });

  it('returns lower similarity for unrelated concepts', () => {
    const sim = vectorSimilarity('sort array', 'http request network');
    assert.ok(sim < 0.7, `expected < 0.7, got ${sim}`);
  });

  it('returns high for same text', () => {
    const sim = vectorSimilarity('cache memoize', 'cache memoize');
    assert.ok(sim > 0.99, `expected ~1.0, got ${sim}`);
  });

  it('handles intent queries', () => {
    const sim = vectorSimilarity('prevent calling too often', 'throttle debounce rate limit');
    assert.ok(sim > 0.5, `expected > 0.5, got ${sim}`);
  });
});

describe('nearestTerms', () => {
  it('returns sorted results for cache query', () => {
    const results = nearestTerms('cache', 5);
    assert.ok(results.length > 0);
    assert.ok(results[0].similarity >= results[results.length - 1].similarity);
  });

  it('returns sort-related terms for sorting query', () => {
    const results = nearestTerms('sort', 5);
    const terms = results.map(r => r.term);
    assert.ok(terms.some(t => t.includes('sort') || t === 'search' || t === 'pivot'));
  });

  it('returns empty for unknown terms', () => {
    const results = nearestTerms('xyznonexistent', 5);
    assert.equal(results.length, 0);
  });
});

describe('VOCABULARY', () => {
  it('has 150+ terms', () => {
    assert.ok(Object.keys(VOCABULARY).length >= 150, `only ${Object.keys(VOCABULARY).length} terms`);
  });

  it('all vectors are 32-dimensional', () => {
    for (const [term, vec] of Object.entries(VOCABULARY)) {
      assert.equal(vec.length, 32, `${term} has ${vec.length} dimensions`);
    }
  });
});

describe('DIMENSIONS', () => {
  it('has 32 named dimensions', () => {
    assert.equal(DIMENSIONS.length, 32);
  });
});
