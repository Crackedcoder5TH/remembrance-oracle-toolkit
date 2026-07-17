#!/usr/bin/env node
// incompressible-residual-benchmark.mjs — does the INCOMPRESSIBLE RESIDUAL carry
// a universal cross-source signature, or is every source's leftover just its own
// private noise (and any apparent kinship the instrument's cone)?
//
// Hypothesis (earns a null the way L8 did): strip the compressible layer from
// genuinely independent physical entropy sources and the residuals recognize each
// other ACROSS UNRELATED PHYSICS — tighter than a label-shuffle can reproduce.
//
// Physical sources span three unrelated mechanisms: quantum-optical vacuum (ANU),
// quantum beacon (NIST), atmospheric radio noise (random.org), and thermal/
// oscillator jitter (CPU timing). Chaotic-at-noise-floor (logistic-map roundoff
// bits) is a source the hypothesis says should ALSO share the signature.
// Algorithmic controls (CSPRNG, PRNG, Gaussian) are the decisive arm: a physical
// layer must make physical residuals cluster APART from algorithmic ones, not
// merely "white ≡ white". (Radioactive decay needs a paid key — not included.)
//
// STRIP = the full compressible layer, not just linear: AR(8) Levinson-Durbin
// removes 2nd-order structure, THEN a delay-embedding k-NN predictor (the L8
// Takens mechanism) removes deterministic NONLINEAR structure. Same operator for
// every source, no per-source tuning. Signature = the higher-order structure a
// maximal compressor leaves (skew, kurtosis, permutation entropy, MPR complexity,
// spectral flatness, volatility autocorrelation), plus the substrate encoder.
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { composedAtDepth } = require('../src/core/encoder-stack');

const CACHE = process.env.ENTROPY_CACHE || new URL('./fixtures/entropy-residual-data.json', import.meta.url).pathname;
const raw = JSON.parse(fs.readFileSync(CACHE, 'utf8'));

// source → class + which physical mechanism (for the cross-distinct-physics test)
const SOURCES = {
  anu_quantum: { cls: 'physical', mech: 'quantum' },
  nist_quantum: { cls: 'physical', mech: 'quantum' },
  atmospheric: { cls: 'physical', mech: 'atmospheric' },
  thermal_jitter: { cls: 'physical', mech: 'thermal' },
  chaotic_noisefloor: { cls: 'chaotic', mech: 'chaotic' },
  csprng: { cls: 'algorithmic', mech: 'algo' },
  prng_mulberry: { cls: 'algorithmic', mech: 'algo' },
  gaussian: { cls: 'algorithmic', mech: 'algo' },
};
const WIN = 128;
const capWindows = Math.min(...Object.keys(SOURCES).map((k) => Math.floor((raw[k] || []).length / WIN)));

function mul(a){let s=a;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length;
function acf(x, lag) { const m = mean(x); let n = 0, d = 0; for (let i = 0; i < x.length; i++) { d += (x[i] - m) ** 2; if (i >= lag) n += (x[i] - m) * (x[i - lag] - m); } return d > 1e-12 ? n / d : 0; }

// --- linear strip: AR(p) via Levinson-Durbin, return innovations + removed frac ---
function arResidual(x, p = 8) {
  const m = mean(x); const c = x.map((v) => v - m); const n = c.length || 1;
  const r = []; for (let k = 0; k <= p; k++) { let s = 0; for (let i = 0; i < c.length - k; i++) s += c[i] * c[i + k]; r.push(s / n); }
  if (r[0] < 1e-12) return { res: c.slice(p), removed: 0 };
  let a = new Array(p + 1).fill(0); a[0] = 1; let E = r[0];
  for (let i = 1; i <= p; i++) { if (E < 1e-12) break; let acc = 0; for (let j = 1; j < i; j++) acc += a[j] * r[i - j]; let k = -(r[i] + acc) / E; if (!Number.isFinite(k)) k = 0; const na = a.slice(); for (let j = 1; j < i; j++) na[j] = a[j] + k * a[i - j]; na[i] = k; a = na; E *= (1 - k * k); }
  const res = []; for (let t = p; t < c.length; t++) { let pred = 0; for (let j = 1; j <= p; j++) pred -= a[j] * c[t - j]; res.push(c[t] - pred); }
  return { res, removed: Math.max(0, Math.min(1, 1 - E / r[0])) };
}

// --- nonlinear strip: delay-embedding k-NN predictor (the L8 Takens mechanism).
// predict r[t] from the m samples preceding it, using the k most similar past
// contexts' outcomes. removes deterministic nonlinear dependence a linear model
// misses. For genuine noise there is no learnable context → residual ≈ input.
function nnResidual(r, m = 4, k = 4) {
  const out = []; let v0 = 0, v1 = 0; const mu = mean(r);
  for (let t = m; t < r.length; t++) {
    const ctx = r.slice(t - m, t);
    const cand = [];
    for (let j = m; j < r.length; j++) { if (j === t) continue; let d = 0; for (let q = 0; q < m; q++) d += (r[j - m + q] - ctx[q]) ** 2; cand.push([d, r[j]]); }
    cand.sort((a, b) => a[0] - b[0]);
    let pred = 0; const kk = Math.min(k, cand.length); for (let i = 0; i < kk; i++) pred += cand[i][1]; pred /= kk || 1;
    const e = r[t] - pred; out.push(e);
  }
  // fraction of the AR-residual variance the nonlinear predictor further removed
  for (const v of r.slice(m)) v0 += (v - mu) ** 2; const em = mean(out); for (const v of out) v1 += (v - em) ** 2;
  return { res: out, removed: v0 > 1e-12 ? Math.max(0, 1 - v1 / v0) : 0 };
}

// --- permutation entropy (Bandt-Pompe) + MPR statistical complexity, order m ---
const FACT = [1, 1, 2, 6, 24, 120];
function ordinalDist(x, m = 4) { const counts = new Map(); let tot = 0; for (let i = 0; i + m <= x.length; i++) { const idx = [...Array(m).keys()].sort((a, b) => x[i + a] - x[i + b]).join(','); counts.set(idx, (counts.get(idx) || 0) + 1); tot++; } if (!tot) return new Array(FACT[m]).fill(0); const P = new Array(FACT[m]).fill(0); let s = 0; for (const v of counts.values()) P[s++] = v / tot; return P; }
function shannon(P) { let h = 0; for (const p of P) if (p > 0) h += -p * Math.log(p); return h; }
function permEntropy(x, m = 4) { return shannon(ordinalDist(x, m)) / Math.log(FACT[m]); }
function mprComplexity(x, m = 4) { const P = ordinalDist(x, m); const n = P.length; const U = 1 / n; const H = shannon(P) / Math.log(n); const Pu = P.map((p) => (p + U) / 2); const js = shannon(Pu) - shannon(P) / 2 - shannon(new Array(n).fill(U)) / 2; const Q0 = -2 / (((n + 1) / n) * Math.log(n + 1) - 2 * Math.log(2 * n) + Math.log(n)); return Q0 * js * H; }
function spectralFlatness(x) { const N = x.length; const re = new Array(N).fill(0), im = new Array(N).fill(0); for (let k = 0; k < N; k++) for (let n = 0; n < N; n++) { const t = -2 * Math.PI * k * n / N; re[k] += x[n] * Math.cos(t); im[k] += x[n] * Math.sin(t); } const ps = []; for (let k = 1; k < N / 2; k++) ps.push(Math.max(1e-12, re[k] * re[k] + im[k] * im[k])); return Math.exp(mean(ps.map(Math.log))) / mean(ps); }

// --- build residual signatures across all sources, balanced ---
const items = []; const stripStats = {};
for (const [src, meta] of Object.entries(SOURCES)) {
  const stream = raw[src] || []; stripStats[src] = { lin: [], nl: [] };
  for (let w = 0; w < capWindows; w++) {
    const win = stream.slice(w * WIN, (w + 1) * WIN); if (win.length < WIN) break;
    const lin = arResidual(win, 8);
    const nl = nnResidual(lin.res, 4, 4);
    stripStats[src].lin.push(lin.removed); stripStats[src].nl.push(nl.removed);
    const res = nl.res;
    const sd = Math.sqrt(mean(res.map((v) => v * v)) - mean(res) ** 2) || 1;
    const z = res.map((v) => (v - mean(res)) / sd);
    const sig = [mean(z.map((v) => v ** 3)), mean(z.map((v) => v ** 4)) - 3, permEntropy(z, 4), mprComplexity(z, 4), spectralFlatness(z), acf(z.map(Math.abs), 1), acf(z.map((v) => v * v), 1), acf(z.map((v) => v * v), 2), acf(z, 1)];
    items.push({ src, cls: meta.cls, mech: meta.mech, sig, resSer: z });
  }
}
const N = items.length;
console.log('INCOMPRESSIBLE RESIDUAL — universal signature or private noise? (tightened)');
console.log(`  ${Object.keys(SOURCES).length} sources × ${capWindows} windows (${WIN} samples) = ${N} residuals · strip = AR(8) + delay-embed kNN`);
console.log('  physical mechanisms: quantum(ANU,NIST) · atmospheric · thermal(CPU jitter)   [decay: needs paid key, absent]\n');

function zmat(rows) { const D = rows[0].length, n = rows.length; const mu = new Array(D).fill(0), sd = new Array(D).fill(0); for (const r of rows) for (let d = 0; d < D; d++) mu[d] += r[d] / n; for (const r of rows) for (let d = 0; d < D; d++) sd[d] += (r[d] - mu[d]) ** 2 / n; for (let d = 0; d < D; d++) sd[d] = Math.sqrt(sd[d]) || 1; return rows.map((r) => r.map((v, d) => (v - mu[d]) / sd[d])); }
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function shuffle(arr, seed) { let s = seed; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function purity(vecs, labels, k = 7) { let hit = 0, tot = 0; for (let i = 0; i < vecs.length; i++) { const idx = [...vecs.keys()].filter((j) => j !== i).sort((a, b) => cos(vecs[i], vecs[b]) - cos(vecs[i], vecs[a])).slice(0, k); const v = {}; for (const j of idx) v[labels[j]] = (v[labels[j]] || 0) + 1; if (Object.keys(v).sort((a, b) => v[b] - v[a])[0] === labels[i]) hit++; tot++; } return hit / tot; }

const zSig = zmat(items.map((x) => x.sig));

// how much did the strip remove per source? (shows residuals are genuinely incompressible)
console.log('=== strip thoroughness (mean variance fraction removed) ===');
for (const src of Object.keys(SOURCES)) console.log('  ' + src.padEnd(18) + 'linear ' + (mean(stripStats[src].lin) * 100).toFixed(1) + '%   +nonlinear ' + (mean(stripStats[src].nl) * 100).toFixed(1) + '%');

// (Q1) source separability
const srcLabels = items.map((x) => x.src); const srcShuf = shuffle(srcLabels, 5);
console.log('\n=== (Q1) source separability — 8-class kNN purity (chance ' + (100 / 8).toFixed(0) + '%) ===');
console.log('  real ' + (purity(zSig, srcLabels) * 100).toFixed(1) + '%   shuffle-null ' + (purity(zSig, srcShuf) * 100).toFixed(1) + '%');

// (Q2, DECISIVE) physical vs algorithmic, MATCHED uniform distribution (drop gaussian + chaotic)
const UNIFORM_ALG = new Set(['csprng', 'prng_mulberry']);
const um = items.map((x, i) => ({ i, cls: x.cls, src: x.src })).filter((x) => x.cls === 'physical' || UNIFORM_ALG.has(x.src));
const umVecs = um.map((x) => zSig[x.i]); const umLab = um.map((x) => x.cls); const umShuf = shuffle(umLab, 13);
console.log('\n=== (Q2, DECISIVE) physical vs algorithmic, matched uniform distribution (chance 50%) ===');
console.log('  real ' + (purity(umVecs, umLab) * 100).toFixed(1) + '%   shuffle-null ' + (purity(umVecs, umShuf) * 100).toFixed(1) + '%   → separation ' + ((purity(umVecs, umLab) - purity(umVecs, umShuf)) * 100).toFixed(1) + ' pts');

// cross-DISTINCT-physics kinship: mean cosine between residuals of UNRELATED physical
// mechanisms (quantum vs atmospheric vs thermal), vs physical↔algorithmic, shuffle-nulled
const byMech = (m) => items.map((x, i) => ({ ...x, i })).filter((x) => x.mech === m);
const Q = byMech('quantum'), A = byMech('atmospheric'), Th = byMech('thermal'), Al = items.map((x, i) => ({ ...x, i })).filter((x) => x.cls === 'algorithmic');
function meanCos(X, Y) { let s = 0, n = 0; for (const a of X) for (const b of Y) { if (a.i === b.i) continue; s += cos(zSig[a.i], zSig[b.i]); n++; } return n ? s / n : 0; }
// shuffle null: recompute the same cross-mechanism statistic after shuffling mechanism identity
const mechLabels = items.map((x) => x.mech); const mechShuf = shuffle(mechLabels, 21);
const idxByMechShuf = (m) => items.map((x, i) => ({ i })).filter((_, i) => mechShuf[i] === m);
console.log('\n=== cross-DISTINCT-physics kinship (z-scored cosine of residual signatures) ===');
console.log('  quantum ↔ atmospheric : ' + meanCos(Q, A).toFixed(3));
console.log('  quantum ↔ thermal     : ' + meanCos(Q, Th).toFixed(3) + '   ← truly unrelated physics');
console.log('  atmospheric ↔ thermal : ' + meanCos(A, Th).toFixed(3));
console.log('  physical ↔ algorithmic: ' + meanCos([...Q, ...A, ...Th], Al).toFixed(3));
const qs = idxByMechShuf('quantum'), ths = idxByMechShuf('thermal');
console.log('  shuffle-null (quantum↔thermal, mechanism identity destroyed): ' + meanCos(qs, ths).toFixed(3));

// where does chaotic-at-noise-floor land — does it JOIN physical (hypothesis) or separate?
const Ch = byMech('chaotic');
console.log('\n=== chaotic-at-noise-floor placement (hypothesis: should be kin to physical) ===');
console.log('  chaotic ↔ physical    : ' + meanCos(Ch, [...Q, ...A, ...Th]).toFixed(3) + '   chaotic ↔ algorithmic : ' + meanCos(Ch, Al).toFixed(3));

// per-source signature means
console.log('\n=== residual signature means (skew, kurt, permEnt, MPRcomplexity, specFlat) ===');
for (const src of Object.keys(SOURCES)) { const rows = items.filter((x) => x.src === src).map((x) => x.sig); const mu = rows[0].map((_, d) => mean(rows.map((r) => r[d]))); console.log('  ' + src.padEnd(18) + '[' + [mu[0], mu[1], mu[2], mu[3], mu[4]].map((v) => v.toFixed(3)).join(', ') + ']'); }

// instrument lens: encode residuals through the substrate stack, same Q1/Q2
const ser = (ys) => { const m = Math.max(...ys.map(Math.abs)) || 1; return ys.map((y) => (y / m).toFixed(5)).join(','); };
const encVecs = items.map((x) => Array.from(composedAtDepth(ser(x.resSer), 8)));
const paEnc = um.map((x) => encVecs[x.i]);
console.log('\n=== (instrument lens) substrate encoder space (depth 8) ===');
console.log('  Q1 source  real ' + (purity(encVecs, srcLabels) * 100).toFixed(1) + '%  shuffle ' + (purity(encVecs, srcShuf) * 100).toFixed(1) + '%');
console.log('  Q2 phys/alg real ' + (purity(paEnc, umLab) * 100).toFixed(1) + '%  shuffle ' + (purity(paEnc, umShuf) * 100).toFixed(1) + '%');

// === POSITIVE CONTROL — can this pipeline detect a SHARED higher-order signature
// at this n/window, or is it blind? Two INDEPENDENT white streams are given the
// SAME weak volatility-clustering (ARCH) structure — which the mean-strip (AR+NN)
// leaves in, since it removes mean dependence, not variance dependence. If the
// planted pair is kin ABOVE its shuffle while an unstructured white control is
// not, the instrument CAN see shared structure — so a null on physics is real.
function archStream(seed) { const rnd = mul(seed); const g = () => { let u = 0, v = 0; while (u < 1e-9) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }; const o = []; let prev = 0; for (let i = 0; i < capWindows * WIN; i++) { const s2 = 0.3 + 0.65 * Math.min(4, prev * prev); const x = 3 * Math.sqrt(s2) * g(); prev = x / 3; o.push(x); } return o; }
function whiteStream(seed) { const rnd = mul(seed); const g = () => { let u = 0, v = 0; while (u < 1e-9) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }; return Array.from({ length: capWindows * WIN }, g); }
function sigOf(stream) { const rows = []; for (let w = 0; w < capWindows; w++) { const win = stream.slice(w * WIN, (w + 1) * WIN); const nl = nnResidual(arResidual(win, 8).res, 4, 4).res; const sd = Math.sqrt(mean(nl.map((v) => v * v)) - mean(nl) ** 2) || 1; const z = nl.map((v) => (v - mean(nl)) / sd); rows.push([mean(z.map((v) => v ** 3)), mean(z.map((v) => v ** 4)) - 3, permEntropy(z, 4), mprComplexity(z, 4), spectralFlatness(z), acf(z.map(Math.abs), 1), acf(z.map((v) => v * v), 1), acf(z.map((v) => v * v), 2), acf(z, 1)]); } return rows; }
const pcA = sigOf(archStream(1001)), pcB = sigOf(archStream(2002)), pcW = sigOf(whiteStream(3003));
const pcAll = zmat([...pcA, ...pcB, ...pcW]); const nA = pcA.length, nB = pcB.length;
const gA = pcAll.slice(0, nA), gB = pcAll.slice(nA, nA + nB), gW = pcAll.slice(nA + nB);
function meanCosRaw(X, Y, guard) { let s = 0, n = 0; for (let i = 0; i < X.length; i++) for (let j = 0; j < Y.length; j++) { if (guard && X === Y && i === j) continue; s += cos(X[i], Y[j]); n++; } return n ? s / n : 0; }
console.log('\n=== POSITIVE CONTROL (sensitivity): two white streams sharing a planted ARCH signature ===');
console.log('  planted-A ↔ planted-B (shared structure) : ' + meanCosRaw(gA, gB, false).toFixed(3));
console.log('  planted-A ↔ white (no shared structure)  : ' + meanCosRaw(gA, gW, false).toFixed(3));
console.log('  → the pipeline ' + (meanCosRaw(gA, gB, false) - meanCosRaw(gA, gW, false) > 0.15 ? 'DETECTS' : 'does NOT detect') + ' a planted shared signature at this n — so the physics null above is ' + (meanCosRaw(gA, gB, false) - meanCosRaw(gA, gW, false) > 0.15 ? 'a real negative, not blindness' : 'inconclusive'));

console.log('\n(DECISIVE reading: real kinship of UNRELATED physics (quantum↔thermal) ABOVE its mechanism-shuffle null,');
console.log(' AND physical clustering apart from algorithmic (Q2 real ≫ shuffle) = a physical layer in the residual.');
console.log(' If quantum↔thermal ≈ its shuffle and Q2 ≈ chance, the residual is private/universal-white — no layer.)');
