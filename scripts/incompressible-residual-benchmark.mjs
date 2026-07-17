#!/usr/bin/env node
// incompressible-residual-benchmark.mjs — does the substrate's COMPRESSION of raw
// physical entropy carry a universal cross-source signature, or is every source's
// leftover private noise (and any apparent commonality the instrument's cone)?
//
// The substrate IS the compressor — nothing is stripped. Each raw stream is fed
// straight through the full 8-layer stack. But raw cosine over the compressed
// vectors is dominated by the encoder cone (every compression sits at ~0.98), so
// it is blind even to a planted signal. The cone is removed by per-dimension
// z-scoring / whitening the compressed vectors, exposing the few dimensions where
// the compression actually encoded structure. A label-shuffle null and a planted-
// signature positive control run through the IDENTICAL pipeline, so the lens is
// proven sensitive before any physics null is read from it.
//
// Physical (unrelated mechanisms): ANU quantum-optical vacuum, NIST quantum
// beacon, random.org atmospheric radio, CPU timing jitter (thermal/oscillator).
// Chaotic-at-noise-floor should — per the hypothesis — share the signature.
// Algorithmic controls (CSPRNG, PRNG, Gaussian) are the decisive arm. (Decay: paid key.)
import { createRequire } from 'node:module';
import fs from 'node:fs';
const require = createRequire(import.meta.url);
const { composedAtDepth } = require('../src/core/encoder-stack');
const W = require('../src/core/whitening');

const CACHE = process.env.ENTROPY_CACHE || new URL('./fixtures/entropy-residual-data.json', import.meta.url).pathname;
const raw = JSON.parse(fs.readFileSync(CACHE, 'utf8'));
// prov = data provenance (network-fetched vs locally-generated). hotbits_pseudo is
// the collinearity-breaker: an ALGORITHMIC source fetched over the NETWORK, so
// "physical" and "network" are no longer the same set.
const SOURCES = {
  anu_quantum: { cls: 'physical', mech: 'quantum', prov: 'network' }, nist_quantum: { cls: 'physical', mech: 'quantum', prov: 'network' },
  atmospheric: { cls: 'physical', mech: 'atmospheric', prov: 'network' }, thermal_jitter: { cls: 'physical', mech: 'thermal', prov: 'local' },
  chaotic_noisefloor: { cls: 'chaotic', mech: 'chaotic', prov: 'local' },
  csprng: { cls: 'algorithmic', mech: 'algo', prov: 'local' }, prng_mulberry: { cls: 'algorithmic', mech: 'algo', prov: 'local' }, gaussian: { cls: 'algorithmic', mech: 'algo', prov: 'local' },
  hotbits_pseudo: { cls: 'algorithmic', mech: 'algo', prov: 'network' },
};
const WIN = 128;
const capWindows = Math.min(...Object.keys(SOURCES).map((k) => Math.floor((raw[k] || []).length / WIN)));

function mul(a){let s=a;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function shuffle(arr, seed) { let s = seed; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function purity(vecs, labels, k = 7) { let hit = 0, tot = 0; for (let i = 0; i < vecs.length; i++) { const idx = [...vecs.keys()].filter((j) => j !== i).sort((a, b) => cos(vecs[i], vecs[b]) - cos(vecs[i], vecs[a])).slice(0, k); const v = {}; for (const j of idx) v[labels[j]] = (v[labels[j]] || 0) + 1; if (Object.keys(v).sort((a, b) => v[b] - v[a])[0] === labels[i]) hit++; tot++; } return tot ? hit / tot : 0; }
function zmat(rows) { const D = rows[0].length, n = rows.length; const mu = new Array(D).fill(0), sd = new Array(D).fill(0); for (const r of rows) for (let d = 0; d < D; d++) mu[d] += r[d] / n; for (const r of rows) for (let d = 0; d < D; d++) sd[d] += (r[d] - mu[d]) ** 2 / n; for (let d = 0; d < D; d++) sd[d] = Math.sqrt(sd[d]) || 1; return rows.map((r) => r.map((v, d) => (v - mu[d]) / sd[d])); }
const ser = (ys) => { const m = Math.max(...ys.map(Math.abs)) || 1; return ys.map((y) => (y / m).toFixed(5)).join(','); };
const encode = (win) => Array.from(composedAtDepth(ser(win), 8));

// --- COMPRESS every raw window (no stripping), then remove the cone (z-score per dim) ---
const items = [];
for (const [src, meta] of Object.entries(SOURCES)) { const stream = raw[src] || []; for (let w = 0; w < capWindows; w++) { const win = stream.slice(w * WIN, (w + 1) * WIN); if (win.length < WIN) break; items.push({ src, cls: meta.cls, mech: meta.mech, prov: meta.prov, vec: encode(win) }); } }
const N = items.length;
const zv = zmat(items.map((x) => x.vec));            // cone-removed compression space
console.log('INCOMPRESSIBLE RESIDUAL — signature in the substrate COMPRESSION of raw physical entropy');
console.log(`  ${Object.keys(SOURCES).length} sources × ${capWindows} windows = ${N} compressed at depth 8 (no stripping; cone removed by per-dim z-score)`);
console.log('  physical mechanisms: quantum(ANU,NIST) · atmospheric · thermal(CPU jitter)   [decay: paid key, absent]\n');

// POSITIVE CONTROL FIRST — is this lens sensitive? two streams sharing a planted ARCH
// signature vs white, run through the identical compress→z-score→cosine pipeline.
function archStream(seed) { const rnd = mul(seed); const g = () => { let u = 0, v = 0; while (u < 1e-9) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }; const o = []; let prev = 0; for (let i = 0; i < capWindows * WIN; i++) { const s2 = 0.3 + 0.65 * Math.min(4, prev * prev); const x = 3 * Math.sqrt(s2) * g(); prev = x / 3; o.push(x); } return o; }
function whiteStream(seed) { const rnd = mul(seed); const g = () => { let u = 0, v = 0; while (u < 1e-9) u = rnd(); v = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185307 * v); }; return Array.from({ length: capWindows * WIN }, g); }
function windowsOf(st) { const o = []; for (let w = 0; w < capWindows; w++) o.push(encode(st.slice(w * WIN, (w + 1) * WIN))); return o; }
const pcRows = [...windowsOf(archStream(1001)), ...windowsOf(archStream(2002)), ...windowsOf(whiteStream(3003))];
const pcZ = zmat(pcRows); const nW = capWindows; const gA = pcZ.slice(0, nW), gB = pcZ.slice(nW, 2 * nW), gW = pcZ.slice(2 * nW);
function mc(X, Y, guard) { let s = 0, n = 0; for (let i = 0; i < X.length; i++) for (let j = 0; j < Y.length; j++) { if (guard && X === Y && i === j) continue; s += cos(X[i], Y[j]); n++; } return n ? s / n : 0; }
const pcGap = mc(gA, gB) - mc(gA, gW); const sensitive = pcGap > 0.03;
console.log('=== POSITIVE CONTROL (lens sensitivity, run FIRST) — planted ARCH signature through compress→z-score ===');
console.log('  planted-A ↔ planted-B ' + mc(gA, gB).toFixed(3) + '   planted-A ↔ white ' + mc(gA, gW).toFixed(3) + '   gap ' + pcGap.toFixed(3));
console.log('  → the cone-removed compression ' + (sensitive ? 'DETECTS' : 'does NOT detect') + ' a planted shared signature — physics reads below are ' + (sensitive ? 'trustworthy' : 'INCONCLUSIVE (lens too blind at this n)') + '\n');

// (Q1) source separability in cone-removed compression space
const srcLab = items.map((x) => x.src); const srcShuf = shuffle(srcLab, 5);
console.log('=== (Q1) source separability — 8-class kNN purity (chance ' + (100 / 8).toFixed(0) + '%) ===');
console.log('  real ' + (purity(zv, srcLab) * 100).toFixed(1) + '%   shuffle-null ' + (purity(zv, srcShuf) * 100).toFixed(1) + '%');

// (Q2 DECISIVE) physical vs algorithmic, matched uniform distribution
const UNIFORM_ALG = new Set(['csprng', 'prng_mulberry']);
const um = items.map((x, i) => ({ i, cls: x.cls, src: x.src })).filter((x) => x.cls === 'physical' || UNIFORM_ALG.has(x.src));
const umV = um.map((x) => zv[x.i]); const umL = um.map((x) => x.cls); const umS = shuffle(umL, 13);
console.log('\n=== (Q2, DECISIVE) physical vs algorithmic, matched uniform distribution (chance 50%) ===');
console.log('  real ' + (purity(umV, umL) * 100).toFixed(1) + '%   shuffle-null ' + (purity(umV, umS) * 100).toFixed(1) + '%   → separation ' + ((purity(umV, umL) - purity(umV, umS)) * 100).toFixed(1) + ' pts');

// cross-DISTINCT-physics kinship in cone-removed compression space, minus mechanism-shuffle null
const byMech = (m) => items.map((x, i) => ({ ...x, i })).filter((x) => x.mech === m);
function meanCos(X, Y) { let s = 0, n = 0; for (const a of X) for (const b of Y) { if (a.i === b.i) continue; s += cos(zv[a.i], zv[b.i]); n++; } return n ? s / n : 0; }
const Q = byMech('quantum'), A = byMech('atmospheric'), Th = byMech('thermal'), Al = items.map((x, i) => ({ ...x, i })).filter((x) => x.cls === 'algorithmic');
const mechShuf = shuffle(items.map((x) => x.mech), 21); const byMechShuf = (m) => items.map((x, i) => ({ i })).filter((_, i) => mechShuf[i] === m);
console.log('\n=== cross-DISTINCT-physics kinship (cone-removed compression; cosine) ===');
console.log('  quantum ↔ atmospheric ' + meanCos(Q, A).toFixed(3) + '   quantum ↔ thermal ' + meanCos(Q, Th).toFixed(3) + '   atmospheric ↔ thermal ' + meanCos(A, Th).toFixed(3));
console.log('  physical ↔ algorithmic ' + meanCos([...Q, ...A, ...Th], Al).toFixed(3) + '   shuffle-null (q↔th) ' + meanCos(byMechShuf('quantum'), byMechShuf('thermal')).toFixed(3));
console.log('  → genuine quantum↔thermal kinship above null: ' + (meanCos(Q, Th) - meanCos(byMechShuf('quantum'), byMechShuf('thermal'))).toFixed(3));
const Ch = byMech('chaotic');
console.log('  chaotic-at-noise-floor: ↔physical ' + meanCos(Ch, [...Q, ...A, ...Th]).toFixed(3) + '   ↔algorithmic ' + meanCos(Ch, Al).toFixed(3));

// PERMUTATION TEST — is any kinship real, or within the shuffle distribution? Shuffle
// mechanism labels many times, rebuild the statistic, report where the real value sits.
const mechArr = items.map((x) => x.mech);
function permTest(statFn, seeds = 500) {
  const real = statFn(mechArr);
  const nulls = [];
  for (let s = 0; s < seeds; s++) { const sh = shuffle(mechArr, 1000 + s * 7); nulls.push(statFn(sh)); }
  const mu = nulls.reduce((a, b) => a + b, 0) / nulls.length;
  const sd = Math.sqrt(nulls.reduce((a, b) => a + (b - mu) ** 2, 0) / nulls.length) || 1e-9;
  const ge = nulls.filter((v) => v >= real).length;
  return { real, mu, z: (real - mu) / sd, p: (ge + 1) / (seeds + 1) };
}
const idxWhere = (lab, m) => items.map((x, i) => i).filter((i) => lab[i] === m);
const crossStat = (m1, m2) => (lab) => { const X = idxWhere(lab, m1), Y = idxWhere(lab, m2); let s = 0, n = 0; for (const a of X) for (const b of Y) { if (a === b) continue; s += cos(zv[a], zv[b]); n++; } return n ? s / n : 0; };
console.log('\n=== PERMUTATION TEST (500 mechanism-label shuffles) — is the kinship real? ===');
for (const [name, m1, m2] of [['quantum↔atmospheric', 'quantum', 'atmospheric'], ['quantum↔thermal', 'quantum', 'thermal'], ['atmospheric↔thermal', 'atmospheric', 'thermal']]) {
  const t = permTest(crossStat(m1, m2));
  console.log('  ' + name.padEnd(22) + 'real ' + t.real.toFixed(3) + '  null ' + t.mu.toFixed(3) + '  z=' + t.z.toFixed(2) + '  p=' + t.p.toFixed(3) + (t.p < 0.05 ? '  *' : ''));
}

// CONFOUND DISAMBIGUATION (2×2) — kinship could track PHYSICS (physical vs
// algorithmic) or PROVENANCE (network-fetched vs local). Those were collinear
// until hotbits_pseudo added a NETWORK+ALGORITHMIC cell. Now compare the two
// groupings head-to-head, and read where the two diagnostic sources land:
//   thermal        = local + PHYSICAL   (physics says: with physical; prov says: with local)
//   hotbits_pseudo = network + ALGORITHMIC (physics says: with algorithmic; prov says: with network)
const provLab = items.map((x) => x.prov); const provShuf = shuffle(provLab, 31);
const clsLab2 = items.map((x) => x.cls);
const excl = (arr) => arr.filter((_, i) => items[i].cls !== 'chaotic');
console.log('\n=== CONFOUND DISAMBIGUATION (2×2): physics vs provenance ===');
console.log('  PROVENANCE  network vs local — 2-class purity: real ' + (purity(zv, provLab) * 100).toFixed(1) + '%  shuffle ' + (purity(zv, provShuf) * 100).toFixed(1) + '%');
const physIdx = items.map((x, i) => i).filter((i) => items[i].cls !== 'chaotic');
const physV = physIdx.map((i) => zv[i]); const physL = physIdx.map((i) => items[i].cls); const physS = shuffle(physL, 41);
console.log('  PHYSICS     physical vs algorithmic — 2-class purity: real ' + (purity(physV, physL) * 100).toFixed(1) + '%  shuffle ' + (purity(physV, physS) * 100).toFixed(1) + '%');
const netPhys = items.map((x, i) => ({ ...x, i })).filter((x) => x.prov === 'network' && x.cls === 'physical');
const locAlg = items.map((x, i) => ({ ...x, i })).filter((x) => x.prov === 'local' && x.cls === 'algorithmic');
const Hb = items.map((x, i) => ({ ...x, i })).filter((x) => x.src === 'hotbits_pseudo');
console.log('\n  diagnostic sources (which pole do the off-diagonal cells join?):');
console.log('    thermal (local·PHYSICAL):     ↔network-physical ' + meanCos(Th, netPhys).toFixed(3) + '   ↔local-algorithmic ' + meanCos(Th, locAlg).toFixed(3) + '  → ' + (meanCos(Th, netPhys) > meanCos(Th, locAlg) ? 'joins PHYSICAL (⇒ physics)' : 'joins LOCAL (⇒ provenance)'));
console.log('    hotbits (network·ALGORITHMIC): ↔network-physical ' + meanCos(Hb, netPhys).toFixed(3) + '   ↔local-algorithmic ' + meanCos(Hb, locAlg).toFixed(3) + '  → ' + (meanCos(Hb, netPhys) > meanCos(Hb, locAlg) ? 'joins NETWORK (⇒ provenance)' : 'joins ALGORITHMIC (⇒ physics)'));

console.log('\n(reported as measured. The substrate COMPRESSES the raw entropy — nothing stripped; the cone is removed so the');
console.log(' lens can see. Read the physics ONLY if the positive control says the lens is sensitive at this n.)');
