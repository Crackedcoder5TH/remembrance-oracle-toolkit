'use strict';
// Backflow test: dynamic layer weighting vs static equal-weight concat.
// Composition rule: weighted sum of PER-LAYER cosines (the flow() view).
// Weights fit on half the corpus (train), judged on the untouched half.
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const oracle = '/home/user/remembrance-oracle-toolkit';
const { composedAtDepth } = require(oracle + '/src/core/encoder-stack.js');

const ROOT = '/home/user';
const SLICE = 2800, CAP = 18;
function grabFiles(dir, exts, cap, domain) {
  const out = []; const stack = [dir];
  while (stack.length && out.length < cap) {
    const cur = stack.pop();
    let entries = []; try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (out.length >= cap) break;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; stack.push(p); }
      else if (exts.some(x => e.name.endsWith(x))) {
        try { const t = fs.readFileSync(p, 'utf8').slice(0, SLICE);
          if (t.length > 400) out.push({ id: domain + '/' + e.name, domain, text: t });
        } catch (_) {}
      }
    }
  }
  return out;
}
function synthSeries(kind, seed, n = 220) {
  const v = [];
  for (let i = 0; i < n; i++) {
    let x;
    if (kind === 'osc') x = 50 + 20 * Math.sin(i / (2 + seed % 5)) + 5 * Math.sin(i / 1.7);
    else if (kind === 'acc') x = Math.pow(1.02 + (seed % 5) * 0.01, i);
    else x = (v[i - 1] ?? 100) + (((seed * 2654435761 + i * 40503) % 21) - 10) / 3;
    v.push(+x.toFixed(4));
  }
  return JSON.stringify(v).slice(0, SLICE);
}
const corpus = [];
corpus.push(...grabFiles(path.join(ROOT,'remembrance-oracle-toolkit','src'), ['.js'], CAP, 'js-code'));
corpus.push(...grabFiles(path.join(ROOT,'claw-code'), ['.rs'], CAP, 'rust-code'));
corpus.push(...grabFiles(path.join(ROOT,'claw-code'), ['.py'], CAP, 'py-code'));
corpus.push(...grabFiles(path.join(ROOT,'REMEMBRANCE-Interface','src'), ['.tsx','.ts'], CAP, 'ts-code'));
corpus.push(...grabFiles(path.join(ROOT,'Void-Data-Compressor'), ['.md'], CAP, 'prose-md'));
corpus.push(...grabFiles(path.join(ROOT,'remembrance-oracle-toolkit'), ['.json'], 12, 'json-data'));
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-osc/${s}`, domain:'ts-osc', text: synthSeries('osc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-acc/${s}`, domain:'ts-acc', text: synthSeries('acc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id:`ts-walk/${s}`, domain:'ts-walk', text: synthSeries('walk', s) });
const N = corpus.length;
console.log(`corpus ${N} items`);

// Per-layer vectors: slice the depth-5 composition into its 5 blocks.
const full = corpus.map(c => composedAtDepth(c.text, 5));
const L = 29;
function layerCos(l) {
  const start = l * L;
  const norms = full.map(v => { let s = 0; for (let k = start; k < start + L; k++) s += v[k] * v[k]; return Math.sqrt(s); });
  return (i, j) => {
    if (norms[i] === 0 || norms[j] === 0) return 0;
    let d = 0;
    for (let k = start; k < start + L; k++) d += full[i][k] * full[j][k];
    return d / (norms[i] * norms[j]);
  };
}
const layerFns = [0,1,2,3,4].map(layerCos);
// Precompute per-layer cosine for ALL pairs once.
const pairCos = [];   // pairCos[l][pairIdx]
for (let l = 0; l < 5; l++) pairCos.push(new Float64Array(N*N));
for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) if (i !== j)
  for (let l = 0; l < 5; l++) pairCos[l][i*N+j] = layerFns[l](i, j);

// Train/test split, stratified by alternation.
const train = [], test = [];
corpus.forEach((c, idx) => (idx % 2 === 0 ? train : test).push(idx));

const K = 10;
function purityOn(indices, weights) {
  let s = 0;
  for (const i of indices) {
    const scored = [];
    for (const j of indices) {
      if (j === i) continue;
      let sim = 0;
      for (let l = 0; l < 5; l++) sim += weights[l] * pairCos[l][i*N+j];
      scored.push([j, sim]);
    }
    scored.sort((a, b) => b[1] - a[1]);
    let same = 0;
    for (const [j] of scored.slice(0, K)) if (corpus[j].domain === corpus[i].domain) same++;
    s += same / K;
  }
  return s / indices.length;
}

// Baselines
const EQ = [1,1,1,1,0];        // equal-weight L1-L4 (≈ current stack behaviour, per-layer-cos view)
const EQ5 = [1,1,1,1,1];
console.log(`\nbaseline equal-weight L1-4:  train ${purityOn(train, EQ).toFixed(3)}   test ${purityOn(test, EQ).toFixed(3)}`);
console.log(`baseline equal-weight L1-5:  train ${purityOn(train, EQ5).toFixed(3)}   test ${purityOn(test, EQ5).toFixed(3)}`);

// Grid search on TRAIN only.
const GRID = [0, 0.5, 1, 2];
let best = { w: EQ5, p: 0 };
for (const w1 of GRID) for (const w2 of GRID) for (const w3 of GRID) for (const w4 of GRID) for (const w5 of GRID) {
  if (w1 + w2 + w3 + w4 + w5 === 0) continue;
  const p = purityOn(train, [w1, w2, w3, w4, w5]);
  if (p > best.p) best = { w: [w1, w2, w3, w4, w5], p };
}
console.log(`\nbest weights on TRAIN: [${best.w.join(', ')}]  (L1..L5)   train purity ${best.p.toFixed(3)}`);
console.log(`held-out TEST purity with those weights: ${purityOn(test, best.w).toFixed(3)}`);

// NCD reference on the test half, for context.
const gz = t => zlib.gzipSync(Buffer.from(t,'utf8'),{level:9}).length;
const cs = corpus.map(c => gz(c.text));
let sN = 0;
for (const i of test) {
  const scored = [];
  for (const j of test) { if (j === i) continue;
    scored.push([j, 1 - (gz(corpus[i].text + corpus[j].text) - Math.min(cs[i],cs[j])) / Math.max(cs[i],cs[j])]); }
  scored.sort((a,b)=>b[1]-a[1]);
  let same = 0; for (const [j] of scored.slice(0,K)) if (corpus[j].domain === corpus[i].domain) same++;
  sN += same / K;
}
console.log(`NCD reference on TEST half:  ${(sN/test.length).toFixed(3)}`);
