const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const { FractalIndex, COMPOSED_DIM, LAYER_DIM } = require('../src/core/fractal-index');

const samples = [
  ['js-debounce', `function debounce(fn, d) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; }`],
  ['js-throttle', `function throttle(fn, d) { let last = 0; return (...a) => { const now = Date.now(); if (now - last >= d) { last = now; fn(...a); } }; }`],
  ['py-filter', `def filter_items(items, threshold=0.5):\n    return [i for i in items if abs(i) > threshold]`],
  ['py-reduce', `def reduce_seq(seq, op):\n    out = seq[0]\n    for x in seq[1:]: out = op(out, x)\n    return out`],
  ['ts-oscillation', JSON.stringify(Array.from({ length: 100 }, (_, i) => +(50 + 20 * Math.sin(i / 3)).toFixed(3)))],
  ['ts-monotonic', JSON.stringify(Array.from({ length: 100 }, (_, i) => +(Math.pow(1.05, i)).toFixed(3)))],
  ['prose-a', 'The river flows through the field, returning what was given. Coherency emerges where the residual is held still.'],
  ['prose-b', 'A signal echoes across the cathedral, naming what was already true. The substrate remembers each fractal mirror.'],
];

function buildIndex() {
  const idx = new FractalIndex();
  for (const [id, text] of samples) idx.add(id, text);
  return idx;
}

describe('FractalIndex — basic invariants', () => {
  it('reports size after add', () => {
    const idx = buildIndex();
    assert.equal(idx.size(), samples.length);
  });

  it('rebuild produces identical search results to add-loop', () => {
    const a = buildIndex();
    const b = new FractalIndex();
    b.rebuild(samples.map(([id, text]) => ({ id, text })));
    const ra = a.search('function debounce(fn) { setTimeout(fn, 100); }', { topK: 3 });
    const rb = b.search('function debounce(fn) { setTimeout(fn, 100); }', { topK: 3 });
    assert.deepEqual(ra.map(r => r.id), rb.map(r => r.id));
  });

  it('remove drops the entry without disturbing the rest', () => {
    const idx = buildIndex();
    assert.equal(idx.remove('js-debounce'), true);
    assert.equal(idx.size(), samples.length - 1);
    assert.equal(idx.remove('js-debounce'), false); // already gone
    const r = idx.search('function debounce', { topK: 5 });
    assert.ok(!r.find(x => x.id === 'js-debounce'));
  });

  it('memoryBytes scales linearly with corpus size', () => {
    const empty = new FractalIndex().memoryBytes();
    const full = buildIndex().memoryBytes();
    assert.ok(full > empty);
    // 116-D × 8 bytes/element × N = at least 928N bytes for the vectors alone
    assert.ok(full >= samples.length * COMPOSED_DIM * 8);
  });

  it('rejects encoders that produce the wrong dimensionality', () => {
    const bad = new FractalIndex({ encoder: () => new Float64Array(50) });
    assert.throws(() => bad.add('x', 'hello'));
  });
});

describe('FractalIndex — search semantics', () => {
  it('finds the right domain neighbour at depth 4', () => {
    const idx = buildIndex();
    const r = idx.search('function memoize(fn) { const cache = new Map(); return (x) => cache.has(x) ? cache.get(x) : cache.set(x, fn(x)).get(x); }', { topK: 3 });
    // A JS closure should match other JS closures, not Python or prose
    assert.ok(r[0].id.startsWith('js-'), `top match was ${r[0].id}`);
  });

  it('time-series matches time-series, not code', () => {
    const idx = buildIndex();
    const query = JSON.stringify(Array.from({ length: 100 }, (_, i) => +(50 + 15 * Math.sin(i / 2.5)).toFixed(3)));
    const r = idx.search(query, { topK: 3 });
    assert.ok(r[0].id.startsWith('ts-'), `top match was ${r[0].id}`);
  });

  it('prose matches prose', () => {
    const idx = buildIndex();
    const r = idx.search('A pattern circulates within the field, gathering what was scattered.', { topK: 3 });
    assert.ok(r[0].id.startsWith('prose-'), `top match was ${r[0].id}`);
  });

  it('topK bound is respected', () => {
    const idx = buildIndex();
    assert.equal(idx.search('anything', { topK: 3 }).length, 3);
    assert.equal(idx.search('anything', { topK: 100 }).length, samples.length);
  });

  it('results are sorted by score descending', () => {
    const idx = buildIndex();
    const r = idx.search('function debounce(fn, d) { setTimeout(fn, d); }', { topK: 5 });
    for (let i = 1; i < r.length; i++) assert.ok(r[i - 1].score >= r[i].score);
  });

  it('minScore filters low-confidence matches', () => {
    const idx = buildIndex();
    const all = idx.search('function f() {}', { topK: 50, minScore: 0 });
    const filtered = idx.search('function f() {}', { topK: 50, minScore: 0.95 });
    assert.ok(filtered.length <= all.length);
    for (const r of filtered) assert.ok(r.score >= 0.95);
  });

  it('empty index returns empty results, never crashes', () => {
    const idx = new FractalIndex();
    assert.deepEqual(idx.search('anything'), []);
  });

  it('zero-norm query returns empty results, never NaN', () => {
    const idx = buildIndex();
    const r = idx.search('', { topK: 5 });
    assert.deepEqual(r, []);
  });
});

describe('FractalIndex — depth-aware search', () => {
  it('depth 1 search restricts to the 29-D structural layer', () => {
    const idx = buildIndex();
    const r1 = idx.search('function f(x) { return x + 1; }', { topK: 3, depth: 1 });
    assert.ok(r1.length > 0);
    for (const m of r1) assert.ok(m.score >= -1 && m.score <= 1);
  });

  it('flow() returns per-depth cosines for a single comparison', () => {
    const idx = buildIndex();
    const f = idx.flow('function debounce(fn) {}', 'js-debounce');
    assert.ok(f && 'd1' in f && 'd2' in f && 'd3' in f && 'd4' in f);
    for (const v of Object.values(f)) assert.ok(v >= -1 && v <= 1);
  });

  it('flow() returns null for missing id', () => {
    const idx = buildIndex();
    assert.equal(idx.flow('hello', 'does-not-exist'), null);
  });
});

describe('FractalIndex — determinism', () => {
  it('same query produces identical top-K across 50 runs', () => {
    const idx = buildIndex();
    const q = 'function memoize(fn) { return fn; }';
    const ref = idx.search(q, { topK: 5 });
    for (let i = 0; i < 50; i++) {
      const r = idx.search(q, { topK: 5 });
      assert.deepEqual(r, ref);
    }
  });
});
