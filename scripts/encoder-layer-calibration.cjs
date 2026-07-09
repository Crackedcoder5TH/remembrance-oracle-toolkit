'use strict';

/**
 * encoder-layer-calibration.cjs — calibrate a candidate encoder layer
 * against the zlib telescope.
 *
 * The method (the four-telescope discipline): a new layer earns its place
 * ONLY if it moves the fractal telescope into closer agreement with the
 * gzip-NCD telescope — the compression ground truth that sees domain
 * structure the structural stack misses. We never assert a layer helps;
 * we measure whether the encoder converges toward compression.
 *
 * The candidate layer here is PATTERN PROJECTION onto a compression
 * basis: each pattern is projected onto a fixed set of landmark patterns
 * by NCD (1 - normalized-compression-distance), producing a vector whose
 * every coordinate is "how does this compress against landmark k". That
 * imports gzip's discriminating axis directly into the fractal signature
 * — pattern projection, calibrated by the very telescope it borrows from.
 *
 * Baseline  = Spearman(composed_depth5, gzipNCD) + kNN domain purity.
 * Candidate = same, for composed_depth5 ⊕ projection-layer.
 * The layer is ACCEPTED iff both move up.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const { composedAtDepth } = require('../src/core/encoder-stack');

const ROOT = '/home/user';
const SLICE = 6000;
const PER_DOMAIN_CAP = 14;

function grabFiles(dir, exts, cap, domain) {
  const out = [];
  const stack = [dir];
  while (stack.length && out.length < cap) {
    const cur = stack.pop();
    let entries = [];
    try { entries = fs.readdirSync(cur, { withFileTypes: true }); } catch (_) { continue; }
    for (const e of entries) {
      if (out.length >= cap) break;
      const p = path.join(cur, e.name);
      if (e.isDirectory()) { if (e.name === 'node_modules' || e.name.startsWith('.')) continue; stack.push(p); }
      else if (exts.some((x) => e.name.endsWith(x))) {
        try {
          const text = fs.readFileSync(p, 'utf8').slice(0, SLICE);
          if (text.length > 400) out.push({ id: domain + '/' + e.name, domain, text });
        } catch (_) { /* skip */ }
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

// ── Corpus: labelled by domain, so kNN purity is meaningful ──────────
const corpus = [];
corpus.push(...grabFiles(path.join(ROOT, 'remembrance-oracle-toolkit', 'src'), ['.js'], PER_DOMAIN_CAP, 'js-code'));
corpus.push(...grabFiles(path.join(ROOT, 'REMEMBRANCE-BLOCKCHAIN', 'programs'), ['.rs'], PER_DOMAIN_CAP, 'rust-code'));
corpus.push(...grabFiles(path.join(ROOT, 'Void-Data-Compressor'), ['.py'], PER_DOMAIN_CAP, 'py-code'));
corpus.push(...grabFiles(path.join(ROOT, 'Void-Data-Compressor'), ['.md'], PER_DOMAIN_CAP, 'prose-md'));
corpus.push(...grabFiles(path.join(ROOT, 'remembrance-oracle-toolkit', 'docs'), ['.md'], PER_DOMAIN_CAP, 'prose-docs'));
for (let s = 0; s < 8; s++) corpus.push({ id: `ts-osc/${s}`, domain: 'ts-osc', text: synthSeries('osc', s) });
for (let s = 0; s < 8; s++) corpus.push({ id: `ts-walk/${s}`, domain: 'ts-walk', text: synthSeries('walk', s) });

const N = corpus.length;
const domains = [...new Set(corpus.map((c) => c.domain))];
console.log(`\ncorpus: ${N} items · ${domains.length} domains: ${domains.join(', ')}`);

// ── Telescope B: gzip NCD (the ground-truth calibrator) ─────────────
const gz = (t) => zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length;
const cSizes = corpus.map((c) => gz(c.text));
function simB(i, j) {
  const cxy = gz(corpus[i].text + corpus[j].text);
  const ncd = (cxy - Math.min(cSizes[i], cSizes[j])) / Math.max(cSizes[i], cSizes[j]);
  return 1 - ncd;
}

// ── Landmarks: a fixed, domain-diverse basis for the projection layer ─
// Deterministic pick: the first item of each domain (spread across the
// structure space), capped, so the projection basis is reproducible.
const landmarks = [];
const seenDom = new Set();
for (const c of corpus) { if (!seenDom.has(c.domain)) { seenDom.add(c.domain); landmarks.push(c); } }
const lmSizes = landmarks.map((l) => gz(l.text));
function projectNCD(text) {
  const cx = gz(text);
  const v = new Float64Array(landmarks.length);
  for (let k = 0; k < landmarks.length; k++) {
    const cxy = gz(text + landmarks[k].text);
    const ncd = (cxy - Math.min(cx, lmSizes[k])) / Math.max(cx, lmSizes[k]);
    v[k] = 1 - ncd;
  }
  // L2-normalise — a projection direction, comparable by cosine.
  let s = 0; for (let k = 0; k < v.length; k++) s += v[k] * v[k];
  s = Math.sqrt(s) || 1;
  for (let k = 0; k < v.length; k++) v[k] /= s;
  return v;
}

// ── Vectors: depth-5 stack, and depth-5 ⊕ NCD-projection ────────────
function l2(v) { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; s = Math.sqrt(s) || 1; return v.map((x) => x / s); }
const A5 = corpus.map((c) => l2(Array.from(composedAtDepth(c.text, 5))));
const PROJ = corpus.map((c) => Array.from(projectNCD(c.text)));
// concat with equal block weight (both normalised); depth-6 candidate
const A6 = corpus.map((_, i) => [...A5[i], ...PROJ[i]]);

function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na < 1e-12 || nb < 1e-12) ? 0 : d / (Math.sqrt(na) * Math.sqrt(nb)); }

// ── Measure 1: Spearman rank correlation with the gzip telescope ────
function spearman(x, y) {
  const rank = (arr) => { const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]); const r = new Array(arr.length); for (let k = 0; k < idx.length; k++) r[idx[k][1]] = k; return r; };
  const rx = rank(x), ry = rank(y); const n = x.length;
  let d2 = 0; for (let i = 0; i < n; i++) d2 += (rx[i] - ry[i]) ** 2;
  return 1 - (6 * d2) / (n * (n * n - 1));
}
const pairsB = [], pairs5 = [], pairs6 = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
  pairsB.push(simB(i, j)); pairs5.push(cos(A5[i], A5[j])); pairs6.push(cos(A6[i], A6[j]));
}
const rho5 = spearman(pairs5, pairsB);
const rho6 = spearman(pairs6, pairsB);

// ── Measure 2: kNN domain purity (each telescope's own discrimination) ─
function purity(simFn) {
  const K = 5; let hit = 0, tot = 0;
  for (let i = 0; i < N; i++) {
    const nn = [];
    for (let j = 0; j < N; j++) if (j !== i) nn.push([simFn(i, j), j]);
    nn.sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < K; k++) { if (corpus[nn[k][1]].domain === corpus[i].domain) hit++; tot++; }
  }
  return hit / tot;
}
const pB = purity(simB);
const p5 = purity((i, j) => cos(A5[i], A5[j]));
const p6 = purity((i, j) => cos(A6[i], A6[j]));
const chance = domains.reduce((s, d) => { const f = corpus.filter((c) => c.domain === d).length / N; return s + f * f; }, 0);

console.log('\n── calibration against the gzip-NCD telescope ──');
console.log('  landmarks (projection basis):', landmarks.length, '(' + landmarks.map((l) => l.domain).join(', ') + ')');
console.log(`  Spearman(depth5,  gzip): ${rho5.toFixed(4)}`);
console.log(`  Spearman(depth6,  gzip): ${rho6.toFixed(4)}   Δ ${(rho6 - rho5 >= 0 ? '+' : '') + (rho6 - rho5).toFixed(4)}`);
console.log(`  kNN purity  gzip:  ${pB.toFixed(4)}   (chance ${chance.toFixed(4)})`);
console.log(`  kNN purity  depth5: ${p5.toFixed(4)}`);
console.log(`  kNN purity  depth6: ${p6.toFixed(4)}   Δ ${(p6 - p5 >= 0 ? '+' : '') + (p6 - p5).toFixed(4)}`);

const earned = rho6 > rho5 && p6 >= p5;
console.log(`\n  VERDICT: L6 (NCD-projection) ${earned ? 'EARNS its place — converges toward compression' : 'REJECTED — does not increase agreement with the gzip telescope'}`);
