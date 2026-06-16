const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const { RemembranceOracle } = require('../src/api/oracle');
const { FractalIndex: FieldToolFractalIndex } =
  require('../packages/field-tool/src/fractal-index');

const SAMPLES = [
  { lang: 'javascript', desc: 'js debounce',
    code: `function debounce(fn, d) { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), d); }; }` },
  { lang: 'javascript', desc: 'js throttle',
    code: `function throttle(fn, d) { let last = 0; return (...a) => { const n = Date.now(); if (n - last >= d) { last = n; fn(...a); } }; }` },
  { lang: 'python', desc: 'py filter',
    code: `def filter_items(items, t=0.5):\n    return [i for i in items if abs(i) > t]` },
  { lang: 'python', desc: 'py reduce',
    code: `def reduce_seq(seq, op):\n    out = seq[0]\n    for x in seq[1:]: out = op(out, x)\n    return out` },
  { lang: 'json', desc: 'time-series oscillation',
    code: JSON.stringify(Array.from({ length: 80 }, (_, i) => +(50 + 20 * Math.sin(i / 3)).toFixed(3))) },
  { lang: 'json', desc: 'time-series accumulation',
    code: JSON.stringify(Array.from({ length: 80 }, (_, i) => +(Math.pow(1.04, i)).toFixed(3))) },
];

function makeOracle() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'oracle-fsearch-'));
  const oracle = new RemembranceOracle({
    baseDir: tmpDir, autoSeed: false, lifecycle: false, autoGrow: false,
  });
  return { oracle, tmpDir };
}

describe('oracle.fractalSearch — wired native search path', () => {
  let oracle, tmpDir, submitted;

  before(() => {
    ({ oracle, tmpDir } = makeOracle());
    submitted = [];
    for (const s of SAMPLES) {
      const r = oracle.submit(s.code, {
        language: s.lang, description: s.desc, tags: [s.lang, 'test'],
        author: 'test', autoProve: false,
      });
      submitted.push({ id: r.entry && r.entry.id, desc: s.desc, lang: s.lang });
    }
  });

  after(() => {
    try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {}
  });

  it('initializes the fractal index on construction', () => {
    assert.ok(oracle._fractalIndex, 'oracle._fractalIndex should exist');
    assert.equal(oracle._fractalIndex.size(), SAMPLES.length);
  });

  it('submit() adds the new entry to the index in real time', () => {
    const sizeBefore = oracle._fractalIndex.size();
    const r = oracle.submit(
      `function memoize(fn) { const c = new Map(); return x => c.has(x) ? c.get(x) : c.set(x, fn(x)).get(x); }`,
      { language: 'javascript', description: 'js memoize', tags: ['javascript', 'test'], author: 'test', autoProve: false }
    );
    assert.ok(r.success);
    assert.equal(oracle._fractalIndex.size(), sizeBefore + 1);
    const hits = oracle.fractalSearch(
      'function cache(fn) { const m = new Map(); return x => m.has(x) ? m.get(x) : m.set(x, fn(x)).get(x); }',
      { topK: 3 }
    );
    assert.ok(hits.length > 0);
    assert.ok(hits.some(h => h.id === String(r.entry.id)));
  });

  it('returns hydrated entries by default', () => {
    const hits = oracle.fractalSearch(SAMPLES[0].code, { topK: 1 });
    assert.equal(hits.length, 1);
    assert.ok(hits[0].entry, 'top hit should carry the hydrated store entry');
    assert.ok(typeof hits[0].entry.code === 'string');
    assert.ok(typeof hits[0].score === 'number');
  });

  it('hydrate:false returns bare id+score', () => {
    const hits = oracle.fractalSearch(SAMPLES[0].code, { topK: 2, hydrate: false });
    assert.ok(hits.length > 0);
    for (const h of hits) {
      assert.ok('id' in h && 'score' in h);
      assert.ok(!('entry' in h));
    }
  });

  it('returns [] gracefully on empty input rather than throwing', () => {
    assert.deepEqual(oracle.fractalSearch(''), []);
    assert.deepEqual(oracle.fractalSearch(null), []);
  });

  it('top-1 match comes from the same domain as the query', () => {
    const jsQuery = `function curry(fn) { return a => b => fn(a, b); }`;
    const top = oracle.fractalSearch(jsQuery, { topK: 1 });
    assert.equal(top.length, 1);
    assert.ok(top[0].entry, 'expected hydrated entry');
    assert.equal(top[0].entry.language, 'javascript');
  });
});

describe('oracle.exportSignatures — round-trip into field-tool', () => {
  it('exports every indexed pattern in JSON-safe form', () => {
    const { oracle, tmpDir } = makeOracle();
    for (const s of SAMPLES) {
      oracle.submit(s.code, {
        language: s.lang, description: s.desc, tags: [s.lang], author: 'test', autoProve: false,
      });
    }
    const sigs = oracle.exportSignatures();
    assert.equal(sigs.length, SAMPLES.length);
    for (const s of sigs) {
      assert.ok(typeof s.id === 'string');
      assert.ok(Array.isArray(s.vec));
      assert.equal(s.vec.length, 116);
      for (const x of s.vec) assert.ok(Number.isFinite(x));
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('field-tool index ingests substrate signatures and returns matching top-K', () => {
    const { oracle, tmpDir } = makeOracle();
    for (const s of SAMPLES) {
      oracle.submit(s.code, {
        language: s.lang, description: s.desc, tags: [s.lang], author: 'test', autoProve: false,
      });
    }
    const sigs = oracle.exportSignatures();
    const ft = new FieldToolFractalIndex();
    const loaded = ft.loadSignatures(sigs);
    assert.equal(loaded, SAMPLES.length);
    assert.equal(ft.size(), SAMPLES.length);

    // For each indexed pattern, encode it via the oracle's index to
    // get the depth-4 query vector, hand that vector to the field-tool
    // index, and confirm the SAME id wins. This is the round-trip
    // covenant: same vectors in, same top-K out, across packages.
    for (const sig of sigs) {
      const oracleTopK = oracle._fractalIndex.search(
        oracle.store.get(sig.id).code, { topK: 1 }
      );
      const qVec = oracle._fractalIndex._vecs[oracle._fractalIndex._idIndex.get(sig.id)];
      const fieldTopK = ft.searchVec(qVec, { topK: 1 });
      assert.equal(fieldTopK.length, 1, `field-tool returned no result for ${sig.id}`);
      assert.equal(oracleTopK[0].id, fieldTopK[0].id,
        `top-K mismatch for ${sig.id}: oracle=${oracleTopK[0].id} field=${fieldTopK[0].id}`);
      // Scores must match to within Float64 precision.
      assert.ok(Math.abs(oracleTopK[0].score - fieldTopK[0].score) < 1e-12,
        `score drift on ${sig.id}: oracle=${oracleTopK[0].score} field=${fieldTopK[0].score}`);
    }
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('field-tool index rejects malformed signatures rather than corrupting state', () => {
    const ft = new FieldToolFractalIndex();
    const loaded = ft.loadSignatures([
      { id: 'good', vec: new Array(116).fill(0.1) },
      { id: 'wrong-length', vec: [1, 2, 3] },
      { id: 'no-vec' },
      null,
      { vec: new Array(116).fill(0.1) },  // no id
    ]);
    assert.equal(loaded, 1);
    assert.equal(ft.size(), 1);
  });
});
