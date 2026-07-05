#!/usr/bin/env node
'use strict';

/**
 * convergence-experiment.cjs — the second telescope.
 *
 * Question: is shape-space structure IN the patterns, or an artifact
 * of the instrument that measures them?
 *
 * Method: three similarity instruments built on unrelated principles,
 * pointed at the same corpus:
 *
 *   A. FRACTAL   — the ecosystem's 116-D encoder (hand-designed
 *                  structural features; cosine similarity)
 *   B. NCD       — Normalized Compression Distance via zlib/gzip
 *                  (algorithmic information theory: how much does
 *                  knowing x help compress y). Cilibrasi & Vitányi.
 *   C. TRIGRAM   — character 3-gram frequency vectors hashed to 4096
 *                  dims (pure token statistics; cosine similarity)
 *
 * None share code, features, or theory. A is structural, B is
 * Kolmogorov-approximation, C is distributional.
 *
 * Convergence measures:
 *   1. Spearman rank correlation between the three pairwise-similarity
 *      matrices (over all item pairs).
 *   2. Top-K neighbourhood Jaccard overlap per item, vs a shuffled
 *      baseline (does instrument A's "nearest" agree with B's?).
 *   3. kNN domain purity per instrument (each telescope's ability to
 *      see the corpus's real domain structure).
 *
 * Interpretation:
 *   high A↔B and A↔C agreement  → structure is instrument-independent
 *                                  ("the moons are in the sky")
 *   agreement ≈ shuffled baseline → each instrument sees mostly itself
 *
 * Caveat noted up front: B and C both read raw bytes, so some B↔C
 * correlation is expected trivially (shared length/charset exposure).
 * The A↔B and A↔C numbers are the load-bearing ones — A normalizes
 * away length and reads features the others cannot see.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const { compose } = require(path.join(__dirname, '..', 'src', 'core', 'encoder-stack.js'));

// ── Corpus assembly: real files across domains + synthetics ──────
const ROOT = path.join(__dirname, '..', '..');
const SLICE = 2800;             // uniform text window to reduce length bias
const PER_DOMAIN_CAP = 18;

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
      if (e.isDirectory()) {
        if (e.name === 'node_modules' || e.name.startsWith('.')) continue;
        stack.push(p);
      } else if (exts.some(x => e.name.endsWith(x))) {
        try {
          const text = fs.readFileSync(p, 'utf8').slice(0, SLICE);
          if (text.length > 400) out.push({ id: domain + '/' + e.name + '#' + out.length, domain, text });
        } catch (_) { /* unreadable — skip */ }
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
    else if (kind === 'walk') x = (v[i - 1] ?? 100) + (((seed * 2654435761 + i * 40503) % 21) - 10) / 3;
    else x = i < n / 2 ? 10 + i * 0.4 : 10 + n * 0.2 - (i - n / 2) * 0.35;
    v.push(+x.toFixed(4));
  }
  return JSON.stringify(v).slice(0, SLICE);
}

const corpus = [];
corpus.push(...grabFiles(path.join(ROOT, 'remembrance-oracle-toolkit', 'src'), ['.js'], PER_DOMAIN_CAP, 'js-code'));
corpus.push(...grabFiles(path.join(ROOT, 'claw-code'), ['.rs'], PER_DOMAIN_CAP, 'rust-code'));
corpus.push(...grabFiles(path.join(ROOT, 'claw-code'), ['.py'], PER_DOMAIN_CAP, 'py-code'));
corpus.push(...grabFiles(path.join(ROOT, 'REMEMBRANCE-Interface', 'src'), ['.tsx', '.ts'], PER_DOMAIN_CAP, 'ts-code'));
corpus.push(...grabFiles(path.join(ROOT, 'Void-Data-Compressor'), ['.md'], PER_DOMAIN_CAP, 'prose-md'));
corpus.push(...grabFiles(path.join(ROOT, 'remembrance-oracle-toolkit'), ['.json'], 12, 'json-data'));
for (let s = 0; s < 6; s++) corpus.push({ id: `ts-osc/${s}`, domain: 'ts-osc', text: synthSeries('osc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id: `ts-acc/${s}`, domain: 'ts-acc', text: synthSeries('acc', s) });
for (let s = 0; s < 6; s++) corpus.push({ id: `ts-walk/${s}`, domain: 'ts-walk', text: synthSeries('walk', s) });

const N = corpus.length;
const domains = [...new Set(corpus.map(c => c.domain))];
console.log(`\n══════════════════════════════════════════════════════════════════`);
console.log(`  THE SECOND TELESCOPE — instrument-convergence experiment`);
console.log(`  corpus: ${N} items · ${domains.length} domains: ${domains.join(', ')}`);
console.log(`══════════════════════════════════════════════════════════════════\n`);

// ── Telescope A: fractal 116-D cosine ────────────────────────────
console.log('  assembling telescope A (fractal 116-D)…');
const vecs = corpus.map(c => compose(c.text));
const normsA = vecs.map(v => { let s = 0; for (let i = 0; i < v.length; i++) s += v[i] * v[i]; return Math.sqrt(s); });
function simA(i, j) {
  let dot = 0; const a = vecs[i], b = vecs[j];
  for (let k = 0; k < a.length; k++) dot += a[k] * b[k];
  const d = normsA[i] * normsA[j];
  return d > 0 ? dot / d : 0;
}

// ── Telescope B: NCD via gzip ─────────────────────────────────────
console.log('  assembling telescope B (gzip NCD)…');
const gz = t => zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length;
const cSizes = corpus.map(c => gz(c.text));
function simB(i, j) {
  const cxy = gz(corpus[i].text + corpus[j].text);
  const ncd = (cxy - Math.min(cSizes[i], cSizes[j])) / Math.max(cSizes[i], cSizes[j]);
  return 1 - ncd;                       // similarity, not distance
}

// ── Telescope C: hashed char-trigram cosine ───────────────────────
console.log('  assembling telescope C (trigram statistics)…');
const TDIM = 4096;
function trigramVec(text) {
  const v = new Float64Array(TDIM);
  for (let i = 0; i + 3 <= text.length; i++) {
    let h = 2166136261;
    for (let k = i; k < i + 3; k++) { h ^= text.charCodeAt(k); h = Math.imul(h, 16777619); }
    v[(h >>> 0) % TDIM] += 1;
  }
  let s = 0; for (let k = 0; k < TDIM; k++) s += v[k] * v[k];
  const n = Math.sqrt(s) || 1;
  for (let k = 0; k < TDIM; k++) v[k] /= n;
  return v;
}
const tvecs = corpus.map(c => trigramVec(c.text));
function simC(i, j) {
  let dot = 0; const a = tvecs[i], b = tvecs[j];
  for (let k = 0; k < TDIM; k++) dot += a[k] * b[k];
  return dot;
}

// ── All pairwise similarities under each telescope ────────────────
console.log(`  observing: ${N * (N - 1) / 2} pairs × 3 instruments…\n`);
const pairs = [];
const SA = [], SB = [], SC = [];
for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
  pairs.push([i, j]);
  SA.push(simA(i, j)); SB.push(simB(i, j)); SC.push(simC(i, j));
}

// ── Measure 1: Spearman rank correlation between instruments ─────
function ranks(arr) {
  const idx = arr.map((v, i) => [v, i]).sort((a, b) => a[0] - b[0]);
  const r = new Float64Array(arr.length);
  for (let k = 0; k < idx.length; k++) r[idx[k][1]] = k;
  return r;
}
function spearman(x, y) {
  const rx = ranks(x), ry = ranks(y);
  const n = x.length;
  let mx = 0, my = 0;
  for (let i = 0; i < n; i++) { mx += rx[i]; my += ry[i]; }
  mx /= n; my /= n;
  let num = 0, dx = 0, dy = 0;
  for (let i = 0; i < n; i++) {
    num += (rx[i] - mx) * (ry[i] - my);
    dx += (rx[i] - mx) ** 2; dy += (ry[i] - my) ** 2;
  }
  return num / Math.sqrt(dx * dy);
}
const rhoAB = spearman(SA, SB), rhoAC = spearman(SA, SC), rhoBC = spearman(SB, SC);

// ── Measure 2: top-K neighbourhood Jaccard vs shuffled baseline ──
const K = 10;
function topKNeighbours(simFn) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const scored = [];
    for (let j = 0; j < N; j++) if (j !== i) scored.push([j, simFn(i, j)]);
    scored.sort((a, b) => b[1] - a[1]);
    out.push(new Set(scored.slice(0, K).map(s => s[0])));
  }
  return out;
}
const nnA = topKNeighbours(simA), nnB = topKNeighbours(simB), nnC = topKNeighbours(simC);
function meanJaccard(X, Y) {
  let s = 0;
  for (let i = 0; i < N; i++) {
    let inter = 0;
    for (const v of X[i]) if (Y[i].has(v)) inter++;
    s += inter / (2 * K - inter);
  }
  return s / N;
}
// deterministic shuffled baseline (seeded LCG — no Math.random)
let lcg = 1234567;
const rnd = () => (lcg = (Math.imul(lcg, 1103515245) + 12345) >>> 0) / 4294967296;
function randomNeighbours() {
  const out = [];
  for (let i = 0; i < N; i++) {
    const s = new Set();
    while (s.size < K) { const j = Math.floor(rnd() * N); if (j !== i) s.add(j); }
    out.push(s);
  }
  return out;
}
const baseline = (meanJaccard(randomNeighbours(), randomNeighbours())
  + meanJaccard(randomNeighbours(), randomNeighbours())
  + meanJaccard(randomNeighbours(), randomNeighbours())) / 3;
const jAB = meanJaccard(nnA, nnB), jAC = meanJaccard(nnA, nnC), jBC = meanJaccard(nnB, nnC);

// ── Measure 3: kNN domain purity per instrument ──────────────────
function purity(nn) {
  let s = 0;
  for (let i = 0; i < N; i++) {
    let same = 0;
    for (const j of nn[i]) if (corpus[j].domain === corpus[i].domain) same++;
    s += same / K;
  }
  return s / N;
}
const pA = purity(nnA), pB = purity(nnB), pC = purity(nnC);
// chance purity = expected fraction of same-domain items among K random picks
let chanceP = 0;
for (const d of domains) {
  const nd = corpus.filter(c => c.domain === d).length;
  chanceP += (nd / N) * ((nd - 1) / (N - 1));
}

// ── Report ────────────────────────────────────────────────────────
console.log('  ──────────────────────────────────────────────────────────────');
console.log('  MEASURE 1 — Spearman rank correlation of pairwise similarity');
console.log('  (1.0 = identical orderings of "what is like what")');
console.log('  ──────────────────────────────────────────────────────────────');
console.log(`    fractal  ↔ NCD       ρ = ${rhoAB.toFixed(3)}`);
console.log(`    fractal  ↔ trigram   ρ = ${rhoAC.toFixed(3)}`);
console.log(`    NCD      ↔ trigram   ρ = ${rhoBC.toFixed(3)}   (shares byte-exposure — inflated by construction)`);

console.log('\n  ──────────────────────────────────────────────────────────────');
console.log(`  MEASURE 2 — top-${K} neighbourhood agreement (mean Jaccard)`);
console.log('  ──────────────────────────────────────────────────────────────');
console.log(`    fractal  ↔ NCD       ${jAB.toFixed(3)}   (${(jAB / baseline).toFixed(1)}× chance)`);
console.log(`    fractal  ↔ trigram   ${jAC.toFixed(3)}   (${(jAC / baseline).toFixed(1)}× chance)`);
console.log(`    NCD      ↔ trigram   ${jBC.toFixed(3)}   (${(jBC / baseline).toFixed(1)}× chance)`);
console.log(`    shuffled baseline    ${baseline.toFixed(3)}`);

console.log('\n  ──────────────────────────────────────────────────────────────');
console.log(`  MEASURE 3 — kNN domain purity (does each telescope see the sky?)`);
console.log('  ──────────────────────────────────────────────────────────────');
console.log(`    fractal   ${pA.toFixed(3)}   NCD   ${pB.toFixed(3)}   trigram   ${pC.toFixed(3)}   chance ${chanceP.toFixed(3)}`);

console.log('\n══════════════════════════════════════════════════════════════════');
const verdict = (jAB > 3 * baseline && jAC > 3 * baseline)
  ? 'CONVERGENT — independent instruments agree far above chance.\n  The neighbourhood structure is in the patterns, not the telescope.'
  : (jAB > 1.5 * baseline && jAC > 1.5 * baseline)
    ? 'PARTIALLY CONVERGENT — shared structure exists; each instrument\n  also sees its own projection. Structure is real but multi-faced.'
    : 'NON-CONVERGENT — each instrument mostly sees itself.\n  Shape-space structure is instrument-relative on this corpus.';
console.log('  ' + verdict);
console.log('══════════════════════════════════════════════════════════════════\n');
