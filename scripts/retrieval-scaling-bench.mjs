// retrieval-scaling-bench.mjs — the RIGHT way to measure retrieval scaling: use the
// substrate's own functions, not a hand-rolled brute-force scan. Three methods on
// the real library at growing N:
//   naive     — full-dim cosine, norms recomputed every comparison (what I wrongly
//               benchmarked before) — O(N) with a fat constant
//   fractal   — FractalIndex.searchFlow: precomputed per-depth norms, one pass — O(N) lean
//   holo      — holoSearch: rank holographic PAGES (superposed centroids), then scan
//               only the top pages' members — address the page, don't load the library
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { FractalIndex } = require('../src/core/fractal-index');
const { createPage, holoSearch } = require('../src/compression/holographic');

const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const idx = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8')).index;
const keys = Object.keys(idx).filter((k) => Array.isArray(idx[k].composed_v1) && idx[k].composed_v1.length === 116);
const hr = () => Number(process.hrtime.bigint()) / 1e6;

// The substrate-bypass guard is RIGHT to flag the next line — this hand-rolled cosine
// IS the deliberate naive baseline this benchmark measures the native functions against.
// oracle-ignore-next-line: substrate/handrolled-cosine
function cosFull(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; }

console.log('RETRIEVAL SCALING — substrate functions vs my brute-force (real library, ' + keys.length + ' patterns)\n');
console.log('  N        naive scan     FractalIndex.searchFlow     holoSearch (page-addressed)     holo pages');
const Q = 60;
for (const N of [1000, 10000, 40000]) {
  const sel = keys.slice(0, N);
  const vecs = sel.map((k) => idx[k].composed_v1);
  const queries = Array.from({ length: Q }, (_, i) => vecs[(i * 613) % N]);   // real vectors as queries

  // naive brute-force (the wrong method I used)
  let t = hr();
  for (const q of queries) { let best = -2; for (const v of vecs) { const c = cosFull(q, v); if (c > best) best = c; } }
  const naive = (hr() - t) / Q;

  // FractalIndex.searchFlow — precomputed norms, one pass
  const fi = new FractalIndex();
  const pad = (v) => { const o = new Float64Array(232); for (let i = 0; i < v.length && i < 232; i++) o[i] = v[i]; return o; };
  fi._ids = sel.slice(); fi._vecs = vecs.map(pad); fi._idIndex = new Map(sel.map((k, i) => [k, i])); fi._realDepths = new Array(N).fill(4); fi._rebuildNorms();
  t = hr();
  for (const q of queries) fi.searchFlow(Float64Array.from(q), { topK: 5 });
  const frac = (hr() - t) / Q;

  // holoSearch — COHERENT pages via similarity clustering (the canonical builder's
  // approach): K seeds, assign each pattern to its nearest seed so a page is a real
  // cluster. Then a query reliably hits the right page's centroid.
  const K = Math.max(8, Math.round(Math.sqrt(N)));
  const embMap = new Map(sel.map((k, i) => [k, vecs[i]]));
  const seedIdx = Array.from({ length: K }, (_, i) => Math.floor((i + 0.5) * N / K));
  const seeds = seedIdx.map((i) => vecs[i]);
  const buckets = Array.from({ length: K }, () => []);
  for (let i = 0; i < N; i++) { let bs = -2, bj = 0; for (let j = 0; j < K; j++) { const c = cosFull(vecs[i], seeds[j]); if (c > bs) { bs = c; bj = j; } } buckets[bj].push({ patternId: sel[i], embedding: vecs[i] }); }
  const pages = buckets.filter((b) => b.length).map((b, j) => createPage('pg' + j, b)).filter(Boolean);
  // precompute true best per query (untimed) for the recall check
  const trueBest = queries.map((q) => { let id = null, best = -2; for (let i = 0; i < vecs.length; i++) { const c = cosFull(q, vecs[i]); if (c > best) { best = c; id = sel[i]; } } return id; });
  const famOf = (k) => k.split(/[\/_]/).slice(0, 2).join('/');
  t = hr();
  const holoTop = queries.map((q) => holoSearch(q, pages, embMap, { topK: 8 }));
  const holo = (hr() - t) / Q;
  // holoSearch re-ranks within a page by interference boost, so measure "right family
  // at #1" (top result shares the true best's family) and "true best in top-8"
  const famHit = holoTop.filter((r, i) => r[0] && famOf(r[0].patternId) === famOf(trueBest[i])).length;
  const inTop = holoTop.filter((r, i) => r.some((x) => x.patternId === trueBest[i])).length;
  const recall = 'fam@1 ' + (famHit / Q * 100).toFixed(0) + '% · exact@8 ' + (inTop / Q * 100).toFixed(0) + '%';

  console.log('  ' + String(N).padEnd(9) + (naive.toFixed(2) + ' ms').padEnd(15) + (frac.toFixed(2) + ' ms').padEnd(28) + (holo.toFixed(2) + ' ms  (recall@1 ' + recall + '%)').padEnd(34) + pages.length + ' pages');
}
console.log('\n(reported as measured. naive = the brute-force I wrongly benchmarked before. searchFlow and holoSearch are');
console.log(' the substrate\'s own retrieval. holoSearch addresses pages first — its cost tracks pages+page-size, not full N.)');
