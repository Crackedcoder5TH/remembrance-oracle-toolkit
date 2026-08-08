const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const {
  EmbeddingEngine,
  builtinEmbed,
  cosineSimilarity,
  CODE_STRUCTURE_FEATURES,
} = require('../src/search/embedding-engine');

// ─── builtinEmbed ───

describe('builtinEmbed', () => {
  it('returns a 64-dimensional vector', () => {
    const vec = builtinEmbed('function throttle(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }');
    assert.equal(vec.length, 64);
  });

  it('produces a unit vector (L2 norm ≈ 1)', () => {
    const vec = builtinEmbed('async function retry(fn, attempts) { for (let i = 0; i < attempts; i++) { try { return await fn(); } catch (e) { if (i === attempts - 1) throw e; } } }');
    let mag = 0;
    for (const v of vec) mag += v * v;
    mag = Math.sqrt(mag);
    assert.ok(Math.abs(mag - 1.0) < 0.01, `Expected unit vector, got magnitude ${mag}`);
  });

  it('activates concept dimensions for rate-limiting code', () => {
    const vec = builtinEmbed('function debounce(fn, wait) { let timeout; return () => { clearTimeout(timeout); timeout = setTimeout(fn, wait); }; }');
    // Dim 0 = rate-limiting concept cluster
    assert.ok(vec[0] > 0, 'Rate-limiting concept should be activated');
  });

  it('activates structure features for code with loops', () => {
    const vec = builtinEmbed('for (let i = 0; i < arr.length; i++) { sum += arr[i]; }');
    // Dim 14 = has-loops
    // After normalization this should be non-zero
    assert.ok(vec[14] > 0, 'Loop feature should be detected');
  });

  it('activates async feature', () => {
    const vec = builtinEmbed('async function fetchData() { const res = await fetch(url); return res.json(); }');
    // Dim 16 = has-async
    assert.ok(vec[16] > 0, 'Async feature should be detected');
  });

  it('handles empty string', () => {
    const vec = builtinEmbed('');
    assert.equal(vec.length, 64);
    // Should be all zeros (or at least not crash)
    assert.ok(true);
  });

  it('generates different vectors for different code', () => {
    const v1 = builtinEmbed('function sort(arr) { return arr.sort((a, b) => a - b); }');
    const v2 = builtinEmbed('async function fetchJSON(url) { return await fetch(url).then(r => r.json()); }');
    const sim = cosineSimilarity(v1, v2);
    assert.ok(sim < 0.95, `Vectors should differ, similarity: ${sim}`);
  });

  it('generates similar vectors for similar code', () => {
    const v1 = builtinEmbed('function debounce(fn, delay) { let timer; }');
    const v2 = builtinEmbed('function throttle(fn, wait) { let timeout; }');
    const sim = cosineSimilarity(v1, v2);
    assert.ok(sim > 0.3, `Similar code should have high similarity, got: ${sim}`);
  });
});

// ─── cosineSimilarity ───

describe('cosineSimilarity', () => {
  it('identical vectors = 1.0', () => {
    const v = [1, 2, 3, 4];
    assert.ok(Math.abs(cosineSimilarity(v, v) - 1.0) < 0.001);
  });

  it('orthogonal vectors = 0', () => {
    assert.ok(Math.abs(cosineSimilarity([1, 0], [0, 1])) < 0.001);
  });

  it('handles zero vectors', () => {
    assert.equal(cosineSimilarity([0, 0], [1, 1]), 0);
  });

  it('handles null', () => {
    assert.equal(cosineSimilarity(null, [1]), 0);
  });

  it('handles mismatched lengths', () => {
    assert.equal(cosineSimilarity([1, 2], [1, 2, 3]), 0);
  });
});

// ─── EmbeddingEngine ───

describe('EmbeddingEngine', () => {
  it('creates an engine with default options', () => {
    const engine = new EmbeddingEngine();
    assert.ok(engine);
    assert.equal(engine.status().tier, 'builtin');
  });

  it('embeds text synchronously', () => {
    const engine = new EmbeddingEngine();
    const vec = engine.embed('sort an array efficiently');
    assert.equal(vec.length, 64);
  });

  it('caches embeddings', () => {
    const engine = new EmbeddingEngine();
    const v1 = engine.embed('test query');
    const v2 = engine.embed('test query');
    assert.deepEqual(v1, v2);
    assert.equal(engine.status().cacheSize, 1);
  });

  it('clears cache', () => {
    const engine = new EmbeddingEngine();
    engine.embed('one');
    engine.embed('two');
    assert.equal(engine.status().cacheSize, 2);
    engine.clearCache();
    assert.equal(engine.status().cacheSize, 0);
  });

  it('evicts cache when max reached', () => {
    const engine = new EmbeddingEngine({ maxCache: 3 });
    engine.embed('a');
    engine.embed('b');
    engine.embed('c');
    engine.embed('d'); // Should evict 'a'
    assert.equal(engine.status().cacheSize, 3);
  });

  it('computes similarity between texts', () => {
    const engine = new EmbeddingEngine();
    const sim = engine.similarity(
      'debounce function with delay',
      'throttle function with timer wait'
    );
    assert.ok(sim > 0, 'Should have positive similarity');
    assert.ok(sim <= 1, 'Should be <= 1');
  });

  it('searches items and returns ranked results', () => {
    const engine = new EmbeddingEngine();
    const items = [
      { name: 'quicksort', description: 'Sort an array using quicksort algorithm', tags: ['sort', 'algorithm'], code: 'function quicksort(arr) { if (arr.length <= 1) return arr; }', language: 'javascript' },
      { name: 'debounce', description: 'Debounce a function call', tags: ['rate-limit', 'timing'], code: 'function debounce(fn, wait) { let timer; }', language: 'javascript' },
      { name: 'deepClone', description: 'Deep clone an object', tags: ['clone', 'copy'], code: 'function deepClone(obj) { return JSON.parse(JSON.stringify(obj)); }', language: 'javascript' },
    ];

    const results = engine.search('sort array', items);
    assert.ok(results.length > 0);
    assert.equal(results[0].name, 'quicksort'); // Should rank first
    assert.ok(results[0]._relevance.relevance > 0);
  });

  it('filters by language', () => {
    const engine = new EmbeddingEngine();
    const items = [
      { name: 'sort-js', language: 'javascript', code: 'arr.sort()' },
      { name: 'sort-py', language: 'python', code: 'sorted(arr)' },
    ];

    const results = engine.search('sort', items, { language: 'python' });
    assert.equal(results.length, 1);
    assert.equal(results[0].name, 'sort-py');
  });

  it('returns empty for empty items', () => {
    const engine = new EmbeddingEngine();
    assert.deepEqual(engine.search('test', []), []);
  });

  it('returns status info', () => {
    const engine = new EmbeddingEngine();
    const status = engine.status();
    assert.equal(status.tier, 'builtin');
    assert.equal(status.cacheSize, 0);
    assert.equal(typeof status.maxCache, 'number');
  });
});

// ─── Tier detection ───

describe('EmbeddingEngine tier detection', () => {
  it('defaults to builtin when no Ollama available', async () => {
    const engine = new EmbeddingEngine({ ollamaPort: 1 }); // Unreachable port
    const tier = await engine.detectTier();
    assert.equal(tier, 'builtin');
  });

  it('detects plugin tier when search registry has embedding provider', async () => {
    const { SearchProviderRegistry } = require('../src/plugins/registry');
    const registry = new SearchProviderRegistry();
    registry.register('test-embed', {
      embed: (text) => [1, 0, 0, 0],
      similarity: (a, b) => 0.5,
    });

    const engine = new EmbeddingEngine({ searchRegistry: registry });
    const tier = await engine.detectTier();
    assert.equal(tier, 'plugin');
  });
});

// ─── Semantic quality checks ───

describe('Embedding semantic quality', () => {
  it('"retry with exponential backoff" matches resilientFetch', () => {
    const engine = new EmbeddingEngine();
    const query = 'retry with exponential backoff';
    const items = [
      { name: 'resilientFetch', description: 'Fetch with retry and exponential backoff', tags: ['retry', 'fetch', 'resilient'], code: 'async function resilientFetch(url, attempts) { for (let i = 0; i < attempts; i++) { try { return await fetch(url); } catch (e) { await new Promise(r => setTimeout(r, Math.pow(2, i) * 1000)); } } }' },
      { name: 'capitalize', description: 'Capitalize a string', tags: ['string'], code: 'function capitalize(s) { return s[0].toUpperCase() + s.slice(1); }' },
    ];

    const results = engine.search(query, items);
    assert.ok(results.length >= 1);
    assert.equal(results[0].name, 'resilientFetch');
  });

  it('"prevent calling too often" matches debounce', () => {
    const engine = new EmbeddingEngine();
    const query = 'prevent calling too often';
    const items = [
      { name: 'debounce', description: 'Debounce function calls', tags: ['timing', 'rate-limit'], code: 'function debounce(fn, delay) { let timer; return (...args) => { clearTimeout(timer); timer = setTimeout(() => fn(...args), delay); }; }' },
      { name: 'quicksort', description: 'Sort array efficiently', tags: ['sort'], code: 'function sort(arr) { return arr.sort(); }' },
    ];

    const results = engine.search(query, items);
    assert.equal(results[0].name, 'debounce');
  });
});
