'use strict';

/**
 * cross-domain-labelfree.cjs — cross-domain resonance with NO labels.
 *
 * Labels are interpretation; interpretation dilutes the signal. So no
 * human label touches the measurement here. Real structure is defined
 * the only honest way: what MULTIPLE INDEPENDENT INSTRUMENTS see the same
 * way. The instruments are different structural lenses read straight from
 * the encoder's own layers — L1 (structural), L3 (numerical dynamics),
 * L4 (spectral) — each a distinct view of the same series. Where they
 * agree on a pattern's neighbours, the structure is instrument-
 * independent: real, not an artifact of any one lens or any one label.
 *
 * Two measurements, both label-free:
 *   1. INTER-LENS AGREEMENT — do the independent structural lenses
 *      converge on the same neighbours? (mean top-k Jaccard). High = the
 *      substrate has real structure that no single lens invented.
 *   2. CROSS-DOMAIN RESONANCE — the strongest pairs that (a) span
 *      different surface domains and (b) are kin under EVERY lens. Domain
 *      is shown ONLY to make the finding human-readable; it has zero
 *      weight in ranking. These are discovered universalities.
 */

const fs = require('fs');
const path = require('path');

const VOID = process.env.VOID_DIR || path.join(__dirname, '..', '..', 'Void-Data-Compressor');
const fractal = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8')).index;

// Sample real crawled data series broadly (spread across the whole index
// so many surface domains are present), no filtering by any label.
const ids = Object.keys(fractal).filter((id) => Array.isArray(fractal[id].composed_v1) && fractal[id].composed_v1.length === 116);
const SAMPLE = 600;
const step = Math.max(1, Math.floor(ids.length / SAMPLE));
const corpus = [];
for (let i = 0; i < ids.length && corpus.length < SAMPLE; i += step) corpus.push({ id: ids[i], v: fractal[ids[i]].composed_v1 });
const M = corpus.length;
const surfaceDomain = (id) => id.split('/')[0].replace(/[_-].*$/, '').toLowerCase();
console.log(`\nlabel-free corpus: ${M} real series · ${new Set(corpus.map((c) => surfaceDomain(c.id))).size} surface domains (used only as annotation)`);

// ── Independent structural lenses from the encoder's own layers ─────
// composed_v1 = L1[0:29] + L2[29:58] + L3[58:87] + L4[87:116].
const LENSES = { 'L1-structural': [0, 29], 'L3-numerical': [58, 87], 'L4-spectral': [87, 116] };
const rawNorm = (v) => Math.sqrt(v.reduce((a, x) => a + x * x, 0));
const l2n = (v) => { const s = rawNorm(v) || 1; return v.map((x) => x / s); };
const slice = (v, [a, b]) => l2n(v.slice(a, b));
// A lens only "sees" an item when its slice carries real energy. Empty
// channels (e.g. a code snippet has no numerical/spectral content) would
// otherwise normalize to a near-constant tiny direction and read as
// universal kin — a dead-channel artifact, not resonance. This is
// instrument hygiene, not labeling: the lens must actually observe.
const ENERGY_FLOOR = 1e-6;
const lensVecs = {};
const lensLive = {}; // per-lens: does the item carry real energy in this slice?
for (const [name, rng] of Object.entries(LENSES)) {
  lensVecs[name] = corpus.map((c) => slice(c.v, rng));
  lensLive[name] = corpus.map((c) => rawNorm(c.v.slice(rng[0], rng[1])) > ENERGY_FLOOR);
}
const liveIdx = [];
for (let i = 0; i < M; i++) if (Object.keys(LENSES).every((n) => lensLive[n][i])) liveIdx.push(i);
console.log(`live under all ${Object.keys(LENSES).length} lenses: ${liveIdx.length}/${M}`);
const cos = (a, b) => { let d = 0; for (let i = 0; i < a.length; i++) d += a[i] * b[i]; return d; };

// top-K neighbour set per series, per lens — candidates are LIVE series only
const K = 6;
function neighbours(vecs) {
  const nbrMap = new Map();
  for (const i of liveIdx) {
    const nn = []; for (const j of liveIdx) if (j !== i) nn.push([cos(vecs[i], vecs[j]), j]);
    nbrMap.set(i, new Set([...nn].sort((a, b) => b[0] - a[0]).slice(0, K).map((x) => x[1])));
  }
  return nbrMap;
}
const nbr = {}; for (const name of Object.keys(LENSES)) nbr[name] = neighbours(lensVecs[name]);

// ── 1. INTER-LENS AGREEMENT (label-free) ────────────────────────────
const lensNames = Object.keys(LENSES);
const L = liveIdx.length;
let agSum = 0, agN = 0;
const pairAgree = {};
for (let a = 0; a < lensNames.length; a++) for (let b = a + 1; b < lensNames.length; b++) {
  let j = 0; for (const i of liveIdx) { const A = nbr[lensNames[a]].get(i), B = nbr[lensNames[b]].get(i); let inter = 0; for (const x of A) if (B.has(x)) inter++; j += inter / (A.size + B.size - inter); }
  const jac = j / L; pairAgree[lensNames[a] + ' ↔ ' + lensNames[b]] = jac; agSum += jac; agN++;
}
// chance Jaccard for two random K-of-L sets ≈ K/(2L-K)
const chanceJac = K / (2 * L - K);
console.log('\n── inter-lens agreement (do independent structural lenses see the same neighbours?) ──');
for (const [k, v] of Object.entries(pairAgree)) console.log('  ' + k.padEnd(34) + ' Jaccard ' + v.toFixed(3));
console.log('  mean agreement: ' + (agSum / agN).toFixed(3) + '   (chance ' + chanceJac.toFixed(4) + ' → ' + ((agSum / agN) / chanceJac).toFixed(0) + '× above chance)');

// ── 2. CROSS-DOMAIN RESONANCE (discovered, label-free ranking) ──────
// A pair is a robust cross-domain universality iff it spans surface
// domains AND is kin under EVERY lens. Rank by the MINIMUM cross-lens
// similarity (the weakest lens must still call them kin).
// Background similarity: each item's MEAN cross-lens-min similarity to the
// whole corpus. A "default" item (similar to everything) and a same-kind
// item (similar to all its kind) both have HIGH background — so raw
// similarity over-rewards them. LIFT = pair similarity − ½(bg_i + bg_j)
// isolates pairs that resonate with EACH OTHER beyond their typical
// similarity to everything. Pure geometry, zero label weight.
const minCrossLens = (i, j) => { let m = Infinity; for (const name of lensNames) { const s = cos(lensVecs[name][i], lensVecs[name][j]); if (s < m) m = s; } return m; };
const bg = new Map();
for (const i of liveIdx) { let s = 0, n = 0; for (const j of liveIdx) if (j !== i) { s += minCrossLens(i, j); n++; } bg.set(i, n ? s / n : 0); }
const pairs = [];
for (let ii = 0; ii < liveIdx.length; ii++) {
  for (let jj = ii + 1; jj < liveIdx.length; jj++) {
    const i = liveIdx[ii], j = liveIdx[jj];
    if (surfaceDomain(corpus[i].id) === surfaceDomain(corpus[j].id)) continue; // cross-domain only
    const minS = minCrossLens(i, j);
    if (minS <= 0.9) continue; // must be kin under EVERY lens
    const lift = minS - 0.5 * (bg.get(i) + bg.get(j));
    pairs.push({ i, j, minS, lift });
  }
}
// Distinctiveness screen (label-free): drop pairs where EITHER item is a
// "default fingerprint" — similar to almost everything (bg > DEF). That is
// what puts debounce/agent-auth at min-sim 1.000: they carry so little
// distinctive structure they resonate with all. Pure geometry.
const DEF = 0.80;
const kept = pairs.filter((p) => bg.get(p.i) <= DEF && bg.get(p.j) <= DEF);
kept.sort((a, b) => b.minS - a.minS);
console.log('\n── cross-domain resonances: kin under EVERY lens, distinctive (no labels used) ──');
console.log('  (' + pairs.length + ' pairs kin under all 3 lenses > 0.90; ' + kept.length + ' remain after dropping default-fingerprint items)');
console.log('  minSim  bg_i  bg_j  pair (surface domains shown only as annotation)');
for (const p of kept.slice(0, 15)) {
  console.log('  ' + p.minS.toFixed(3) + '  ' + bg.get(p.i).toFixed(2) + '  ' + bg.get(p.j).toFixed(2) + '  ' + corpus[p.i].id.slice(0, 28).padEnd(30) + ' ≈ ' + corpus[p.j].id.slice(0, 28));
}
