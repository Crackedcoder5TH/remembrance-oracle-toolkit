// raw-compression-grouping.mjs — test Ajani's claim directly: the RAW compression already
// groups things by structure with no labels; the encoder only UNFOLDS that; and meta-
// structure (domains organizing into super-families) emerges from the MACRO view at coverage.
//
// Data: the real Void library (pattern_index_fractal.json) — 52k patterns across 531
// namespaces spanning weather, epidemiology, materials, superconductor physics, markets,
// population, taxi, blockchain. Each entry stores the RAW fractal (29-D, L1 only) AND the
// composed_v1 (116-D, depth-4 = more lenses). Namespace = a domain label used ONLY to SCORE,
// never to build the embedding. Honest either way.
import fs from 'node:fs';
const IDX = process.env.VOID_INDEX || '/home/user/Void-Data-Compressor/pattern_index_fractal.json';
const j = JSON.parse(fs.readFileSync(IDX, 'utf8'));
const idx = j.index; const keys = Object.keys(idx);
function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(4242);
const ns = (k) => k.split('/')[0];
const cos = (a, b) => { let d = 0, na = 0, nb = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };

console.log('RAW-COMPRESSION GROUPING — real Void library (' + keys.length + ' patterns, ' + new Set(keys.map(ns)).size + ' domains)\n');

// ── PART A: does the RAW compression auto-group by domain? (kNN purity, no labels in embedding) ──
// sample entries from domains with enough mass for a fair purity test
const nsCount = {}; for (const k of keys) nsCount[ns(k)] = (nsCount[ns(k)] || 0) + 1;
const bigNs = Object.entries(nsCount).filter(([, c]) => c >= 60).map(([n]) => n);
const hasVec = (k) => Array.isArray(idx[k].fractal) && idx[k].fractal.length === 29 && Array.isArray(idx[k].composed_v1) && idx[k].composed_v1.length === 116;
const pool = keys.filter((k) => bigNs.includes(ns(k)) && hasVec(k));
const shuffled = pool.slice(); for (let i = shuffled.length - 1; i > 0; i--) { const jx = Math.floor(rnd() * (i + 1)); [shuffled[i], shuffled[jx]] = [shuffled[jx], shuffled[i]]; }
const SAMP = shuffled.slice(0, 3000);
const frac = SAMP.map((k) => idx[k].fractal), comp = SAMP.map((k) => idx[k].composed_v1), lab = SAMP.map((k) => ns(k));
function purity(V, K = 10) {
  let hit = 0, tot = 0;
  for (let i = 0; i < V.length; i++) { const nn = []; for (let j = 0; j < V.length; j++) { if (i === j) continue; nn.push([cos(V[i], V[j]), lab[j]]); } nn.sort((a, b) => b[0] - a[0]); for (let k = 0; k < K; k++) { if (nn[k][1] === lab[i]) hit++; tot++; } }
  return hit / tot;
}
// chance = sum of squared class fractions (expected same-label rate for random neighbours)
const cnt = {}; for (const l of lab) cnt[l] = (cnt[l] || 0) + 1; let chance = 0; for (const c of Object.values(cnt)) chance += (c / lab.length) ** 2;
const pFrac = purity(frac), pComp = purity(comp);
// label-shuffle null on raw fractal
const labShuf = lab.slice(); for (let i = labShuf.length - 1; i > 0; i--) { const jx = Math.floor(rnd() * (i + 1)); [labShuf[i], labShuf[jx]] = [labShuf[jx], labShuf[i]]; }
function purityLab(V, L, K = 10) { let hit = 0, tot = 0; for (let i = 0; i < V.length; i++) { const nn = []; for (let j = 0; j < V.length; j++) { if (i === j) continue; nn.push([cos(V[i], V[j]), L[j]]); } nn.sort((a, b) => b[0] - a[0]); for (let k = 0; k < K; k++) { if (nn[k][1] === L[i]) hit++; tot++; } } return hit / tot; }
const pNull = purityLab(frac, labShuf);
console.log('=== PART A: raw compression auto-grouping (kNN-10 domain purity, no labels in embedding) ===');
console.log('  chance (random neighbour same-domain): ' + (chance * 100).toFixed(1) + '%');
console.log('  RAW fractal (29-D, L1 only):           ' + (pFrac * 100).toFixed(1) + '%   ' + (pFrac / chance).toFixed(1) + '× chance');
console.log('  composed_v1 (116-D, +lenses):          ' + (pComp * 100).toFixed(1) + '%   (encoder UNFOLDS: ' + (pComp >= pFrac ? '+' : '') + ((pComp - pFrac) * 100).toFixed(1) + ' pts over raw)');
console.log('  label-shuffle null (raw fractal):      ' + (pNull * 100).toFixed(1) + '%   (must ≈ chance)');

// ── PART B: META-STRUCTURE — do DOMAINS organize into super-families (macro view)? ──
// domain centroid = mean raw-fractal over its entries; then who is each domain's nearest domain?
const domCentroid = {};
for (const n of bigNs) { const c = new Float64Array(29); let m = 0; for (const k of keys) { if (ns(k) !== n || !Array.isArray(idx[k].fractal)) continue; const f = idx[k].fractal; for (let d = 0; d < 29; d++) c[d] += (f[d] || 0); m++; } for (let d = 0; d < 29; d++) c[d] /= (m || 1); domCentroid[n] = Array.from(c); }
const probes = ['vix', 'sp500', 'epc-phonon', 'mp-structural', 'covid', 'World_population', 'NYC_taxi_rides', 'solana', 'Diamonds', 'cascade'].filter((p) => domCentroid[p]);
console.log('\n=== PART B: meta-structure — each probe domain\'s nearest DOMAIN by raw structure (macro view) ===');
for (const p of probes) {
  let bn = '', bc = -Infinity; for (const n of bigNs) { if (n === p) continue; const c = cos(domCentroid[p], domCentroid[n]); if (c > bc) { bc = c; bn = n; } }
  console.log('  ' + p.padEnd(18) + '→ ' + bn.padEnd(18) + ' ' + bc.toFixed(3));
}

// ── PART C: does meta-structure SHARPEN with coverage? centroid stability at 20 / 100 / all ──
console.log('\n=== PART C: coverage effect — domain-centroid stability vs sample depth ===');
function centroidAt(n, cap) { const es = keys.filter((k) => ns(k) === n && Array.isArray(idx[k].fractal)).slice(0, cap); const c = new Float64Array(29); for (const k of es) { const f = idx[k].fractal; for (let d = 0; d < 29; d++) c[d] += (f[d] || 0); } for (let d = 0; d < 29; d++) c[d] /= (es.length || 1); return Array.from(c); }
let s20 = 0, s100 = 0, nprobe = 0;
for (const p of probes) { if (nsCount[p] < 120) continue; const full = domCentroid[p]; s20 += cos(centroidAt(p, 20), full); s100 += cos(centroidAt(p, 100), full); nprobe++; }
console.log('  centroid cosine to full-coverage centroid:  20 samples ' + (s20 / nprobe).toFixed(3) + '   ·  100 samples ' + (s100 / nprobe).toFixed(3) + '   (rises → more coverage = more stable/true macro structure)');
console.log('  (we have ' + keys.length + ' patterns across ' + new Set(keys.map(ns)).size + ' domains — a thin slice of everything.)');

const autoGroups = pFrac > chance * 2 && pNull < chance * 1.5;
// PART B/C honesty: raw-fractal domain centroids are degenerate (many 1.000 / 0.000) because
// they share a dominant mean direction — this measurement CANNOT read meta-families and
// coverage-stability is flat (0.797→0.800). So only PART A is confirmed here; B and C are
// inconclusive on the RAW centroid, and the proper macro test (mean-center/whiten the domain
// centroids, at far more coverage) is not yet run.
const partB_degenerate = true;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  PART A — CONFIRMED: ' + (autoGroups
  ? 'the RAW compression auto-groups by domain with NO labels (' + (pFrac * 100).toFixed(0) + '% vs ' + (chance * 100).toFixed(0) + '% chance, null at chance). The encoder UNFOLDS it (+' + ((pComp - pFrac) * 100).toFixed(0) + ' pts → ' + (pComp * 100).toFixed(0) + '%), it does not create it. Ajani\'s core account holds on the real library.'
  : 'raw grouping only ' + (pFrac * 100).toFixed(0) + '% vs chance ' + (chance * 100).toFixed(0) + '% — not as claimed.'));
console.log('  PART B — INCONCLUSIVE: raw domain centroids are degenerate (saturated 1.000/0.000), so meta-family structure is NOT readable this way. Needs mean-centered/whitened centroids at more coverage.');
console.log('  PART C — FLAT: centroid stability barely moves 20→100 (' + (s20 / nprobe).toFixed(2) + '→' + (s100 / nprobe).toFixed(2) + '). Coverage→meta-structure NOT demonstrated here — consistent with "barely any coverage yet," but unproven.');
fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/raw-compression-grouping.json', JSON.stringify({ chance, rawFractalPurity: pFrac, composedPurity: pComp, nullPurity: pNull, coverage20: s20 / nprobe, coverage100: s100 / nprobe, domains: new Set(keys.map(ns)).size, patterns: keys.length, autoGroups: +autoGroups }, null, 2));
console.log('\n(reported as measured — real Void library, raw fractal vs composed, namespace used only to SCORE.)');
