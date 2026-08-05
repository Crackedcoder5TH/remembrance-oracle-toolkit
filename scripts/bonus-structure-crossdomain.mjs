// bonus-structure-crossdomain.mjs — the REAL depth-in-a-domain test the user meant.
//
// Earlier I "added depth" by piling on more rows of the SAME feature vector. Wrong. The
// claim is: a domain is thousands of DIFFERENT measurement types, and because the
// substrate reads STRUCTURE and no labels, structure from an unexpected corner sharpens a
// sim it shares no vocabulary with. The strongest form: structure from ANOTHER DOMAIN
// entirely (physics) should sharpen a BIOLOGY sim — if, and only if, real shared structure
// exists and the encoder is genuinely label-blind.
//
// THROUGH THE SUBSTRATE:
//   • Every cell type's specificity profile is serialized to text and encoded by
//     composedAtDepth — the label-blind structural encoder. It is NOT told these are genes.
//   • Superconductor materials (UCI/Hamidieh — physics, zero genes, zero shared labels)
//     are serialized and encoded by the SAME composedAtDepth into the SAME structural space.
//   • The whitening basis (the metric the sim retrieves through) is fit THREE ways and the
//     SAME leave-one-cell-out sim is run on each:
//        CELL-ONLY      : basis fit on cell structural signatures alone.
//        CELL+PHYSICS   : basis fit on {cells ∪ superconductors} — foreign structure folded in.
//        CELL+SHUFFLED  : basis fit on {cells ∪ dim-permuted superconductors} — the NULL:
//                         same count of foreign vectors, structure destroyed.
// Sim = predict a held-out cell type's specificity profile from its structural neighbours'
// profiles; metric = mean Pearson corr(pred, true). If foreign STRUCTURE is free information,
// CELL+PHYSICS > CELL-ONLY and > CELL+SHUFFLED. If it's just "more vectors regularise the
// covariance," CELL+PHYSICS ≈ CELL+SHUFFLED. Honest either way.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ENC = require('../src/core/decoder-stack');
const W = require('../src/core/whitening');
const DEPTH = ENC.maxAvailableDepth ? ENC.maxAvailableDepth() : 4;

// ---- BIOLOGY: HPA cell-type expression -> per-gene z across cell types (the SPECIFIC signal) ----
const HPA = process.env.HPA_TSV || '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad/rna_single_cell_type.tsv';
const hl = fs.readFileSync(HPA, 'utf8').split('\n'); hl.shift();
const G = new Map(); const ctSet = new Set();
for (const ln of hl) { if (!ln) continue; const p = ln.split('\t'); const name = p[1], ct = p[2], v = parseFloat(p[3]); if (!name || !ct || !Number.isFinite(v)) continue; if (!G.has(name)) G.set(name, {}); G.get(name)[ct] = v; ctSet.add(ct); }
const cts = [...ctSet];
// pick the top-variance genes (the informative axes) for a tractable, meaningful signature
let genes = [...G.keys()];
const varOf = (g) => { const r = G.get(g); const vals = cts.map((c) => r[c] || 0); const m = vals.reduce((a, b) => a + b, 0) / vals.length; return vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length; };
genes = genes.map((g) => [g, varOf(g)]).sort((a, b) => b[1] - a[1]).slice(0, 2500).map((x) => x[0]);
// z-score each gene across cell types -> each cell type is a vector of gene SPECIFICITY
const zByGene = new Map();
for (const g of genes) { const r = G.get(g); const vals = cts.map((c) => r[c] || 0); const m = vals.reduce((a, b) => a + b, 0) / vals.length; const sd = Math.sqrt(vals.reduce((a, b) => a + (b - m) ** 2, 0) / vals.length) || 1e-6; zByGene.set(g, cts.map((v, i) => (vals[i] - m) / sd)); }
const cellProfile = cts.map((_, ci) => genes.map((g) => zByGene.get(g)[ci]));   // [cellType][gene] z

// ---- PHYSICS: superconductor feature rows (foreign — zero genes, zero shared labels) ----
const SCDIR = process.env.SC_DATA_DIR || '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad';
const sc = fs.readFileSync(path.join(SCDIR, 'train.csv'), 'utf8').trim().split('\n');
const F = sc[0].split(',').length - 1;
const scRows = sc.slice(1).map((r) => r.split(',').map(Number));
// standardize SC features, take a matched count of materials
const smu = new Array(F).fill(0), ssd = new Array(F).fill(0);
for (const r of scRows) for (let d = 0; d < F; d++) smu[d] += r[d] / scRows.length;
for (const r of scRows) for (let d = 0; d < F; d++) ssd[d] += (r[d] - smu[d]) ** 2 / scRows.length;
for (let d = 0; d < F; d++) ssd[d] = Math.sqrt(ssd[d]) || 1;

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(9091);
const scSample = scRows.slice().sort(() => rnd() - 0.5).slice(0, cts.length);   // matched count
const scStd = scSample.map((r) => r.slice(0, F).map((v, d) => (v - smu[d]) / ssd[d]));

// ---- label-blind serialization -> composedAtDepth structural signature ----
const serialize = (vec) => vec.map((v) => Math.round(v * 10)).join(' ');
const sigOf = (vec) => Array.from(ENC.composedAtDepth(serialize(vec), DEPTH));
console.log('BONUS-STRUCTURE CROSS-DOMAIN TEST — does PHYSICS structure sharpen a BIOLOGY sim? (encoder depth ' + DEPTH + ')');
console.log('  ' + cts.length + ' cell types (' + genes.length + ' genes) · ' + scStd.length + ' superconductors · same label-blind encoder\n');
const cellSig = cellProfile.map(sigOf);
const physSig = scStd.map(sigOf);
const physShuf = physSig.map((v) => { const a = v.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; });

const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }

// leave-one-cell-out: predict held-out cell's specificity profile from structural neighbours
function simAccuracy(basisVectors, k = 8) {
  const Wm = W.fitWhitening(basisVectors, { epsilon: 1e-3 });
  const wCell = cellSig.map((v) => Array.from(W.applyWhitening(v, Wm)));
  let sum = 0;
  for (let h = 0; h < cts.length; h++) {
    const q = wCell[h];
    const near = [];
    for (let j = 0; j < cts.length; j++) { if (j === h) continue; near.push([cos(q, wCell[j]), j]); }
    near.sort((a, b) => b[0] - a[0]);
    const top = near.slice(0, k);
    const wsum = top.reduce((s, n) => s + Math.max(0, n[0]), 0) || 1e-9;
    const pred = genes.map((_, gi) => top.reduce((s, [w, j]) => s + Math.max(0, w) * cellProfile[j][gi], 0) / wsum);
    sum += corr(pred, cellProfile[h]);
  }
  return sum / cts.length;
}

const rCell = simAccuracy(cellSig);
const rPhys = simAccuracy(cellSig.concat(physSig));
const rShuf = simAccuracy(cellSig.concat(physShuf));
console.log('  condition        biology-sim accuracy (mean corr, leave-one-cell-out)');
console.log('  CELL-ONLY        ' + rCell.toFixed(4));
console.log('  CELL+PHYSICS     ' + rPhys.toFixed(4) + '   (foreign structure folded in, same encoder)');
console.log('  CELL+SHUFFLED    ' + rShuf.toFixed(4) + '   (NULL: same foreign vectors, structure destroyed)');

const helpsVsSelf = rPhys - rCell, helpsVsNull = rPhys - rShuf;
const REAL = helpsVsSelf > 0.005 && helpsVsNull > 0.005;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  physics vs cell-only:  Δ=' + (helpsVsSelf >= 0 ? '+' : '') + helpsVsSelf.toFixed(4));
console.log('  physics vs shuffled:   Δ=' + (helpsVsNull >= 0 ? '+' : '') + helpsVsNull.toFixed(4) + '   (this is the one that matters — beats the null?)');
console.log('  ' + (REAL
  ? 'BONUS STRUCTURE IS REAL: folding a STRUCTURALLY-FOREIGN physics source through the label-blind encoder SHARPENS the biology sim, and beats the structure-destroyed null. Structure recurs across domains the substrate was never told were related — measured, not asserted.'
  : (helpsVsSelf > 0 && helpsVsNull <= 0.005
    ? 'NOT DISTINGUISHABLE FROM REGULARISATION: physics helps a little but no more than shuffled vectors (Δvs-null=' + helpsVsNull.toFixed(4) + ') — the gain is covariance regularisation, not shared structure. Recorded honestly.'
    : 'NO CROSS-DOMAIN TRANSFER on this test (Δvs-null=' + helpsVsNull.toFixed(4) + '): foreign physics structure does not sharpen the biology sim here. Recorded honestly — a real null.')));

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/bonus-structure-crossdomain.json', JSON.stringify({ depth: DEPTH, rCell, rPhys, rShuf, deltaVsSelf: helpsVsSelf, deltaVsNull: helpsVsNull, bonusStructureReal: +REAL }, null, 2));
console.log('\n(reported as measured — real HPA biology + real UCI superconductors, one label-blind encoder, whitening as the shared metric.)');
