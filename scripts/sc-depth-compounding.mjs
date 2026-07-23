// sc-depth-compounding.mjs — does accuracy IN a domain COMPOUND as the domain gains DEPTH?
//
// The user's claim (the axis I earlier ignored): "as we add more depth for a specific
// domain the more accurate it gets in that domain because it gets free information and
// structure from all the proven previous knowledge." Cell-fate could not test this — its
// lever (MYOD1) is too obvious, so every depth saturated. Superconductor Tc HAS headroom:
// predicting a material's Tc from other materials is genuinely hard.
//
// A rising learning curve alone is trivial (more samples always helps a little). The
// FALSIFIABLE signature of the claim is stronger: if accumulated proven structure is
// "free information," then the STRUCTURE-READER (whitened resonance — the substrate) must
// pull FURTHER AHEAD of a structure-blind baseline as depth grows. The GAP compounds.
// If instead both rise in parallel (constant gap) or the gap shrinks, the specific claim
// is not supported — it's just ordinary sample efficiency. Honest either way.
//
// Predictors, same k-NN-in-representation shell, differing only in the representation:
//   • SUBSTRATE : whitened resonance  (fitWhitening on the training depth, then cosine) —
//                 the representation is RE-LEARNED from the accumulated depth each step.
//   • BASELINE  : raw standardized cosine (structure-blind — no whitening, no accumulation).
// The mean-Tc predictor is the floor. Metric = Pearson corr of predicted vs true Tc on a
// FIXED held-out cuprate test set; depth = number of cuprate training materials.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('../src/core/whitening');

const DIR = process.env.SC_DATA_DIR || '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad';
const tr = fs.readFileSync(path.join(DIR, 'train.csv'), 'utf8').trim().split('\n');
const un = fs.readFileSync(path.join(DIR, 'unique_m.csv'), 'utf8').trim().split('\n');
const F = tr[0].split(',').length - 1;
const rows = tr.slice(1).map((r) => r.split(',').map(Number));
const uh = un[0].split(',').map((s) => s.replace(/"/g, ''));
const uidx = (e) => uh.indexOf(e);
const urows = un.slice(1).map((r) => r.split(','));
const Tc = rows.map((r) => r[F]);
const iCu = uidx('Cu'), iO = uidx('O');
// cuprate = the single family with the most materials and the richest Tc structure (the dome)
const isCuprate = urows.map((r) => (+r[iCu] > 0 && +r[iO] > 0));

// standardize features on the full set (shared, structure-blind scaling)
const mu = new Array(F).fill(0), sd = new Array(F).fill(0);
for (const r of rows) for (let d = 0; d < F; d++) mu[d] += r[d] / rows.length;
for (const r of rows) for (let d = 0; d < F; d++) sd[d] += (r[d] - mu[d]) ** 2 / rows.length;
for (let d = 0; d < F; d++) sd[d] = Math.sqrt(sd[d]) || 1;
const X = rows.map((r) => r.slice(0, F).map((v, d) => (v - mu[d]) / sd[d]));

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(1717);
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }
function shuffle(a) { a = a.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const cupIdx = shuffle(X.map((_, i) => i).filter((i) => isCuprate[i]));
const TEST = cupIdx.slice(0, 1200);                 // FIXED held-out cuprate test set
const POOL = cupIdx.slice(1200);                    // training pool we draw growing depth from
console.log('SC DEPTH-COMPOUNDING TEST — cuprate Tc, fixed ' + TEST.length + '-material test set, growing training depth\n');
console.log('  claim: the STRUCTURE-READER (substrate) pulls further ahead of a structure-blind baseline as depth grows.\n');

function predict(trainIdx, rep, k = 12) {
  const trn = trainIdx.map((i) => ({ v: rep[i], tc: Tc[i] }));
  const pred = [], truth = [];
  for (const ti of TEST) { const q = rep[ti]; const near = trn.map((t) => [cos(q, t.v), t.tc]).sort((a, b) => b[0] - a[0]).slice(0, k); pred.push(near.reduce((s, n) => s + n[1], 0) / k); truth.push(Tc[ti]); }
  return corr(pred, truth);
}

console.log('  depth (N)   baseline r   substrate r   GAP (substrate−baseline)');
const rowsOut = [];
for (const N of [150, 400, 1000, 2500, POOL.length]) {
  const train = POOL.slice(0, Math.min(N, POOL.length));
  const rBase = predict(train, X);                                                   // structure-blind
  const Wm = W.fitWhitening(train.map((i) => X[i]), { epsilon: 1e-3 });               // structure RE-LEARNED from depth
  const rep = X.map((v) => Array.from(W.applyWhitening(v, Wm)));
  const rSub = predict(train, rep);
  const gap = rSub - rBase;
  rowsOut.push({ N: train.length, rBase, rSub, gap });
  console.log('  ' + String(train.length).padEnd(11) + rBase.toFixed(3).padEnd(13) + rSub.toFixed(3).padEnd(14) + (gap >= 0 ? '+' : '') + gap.toFixed(3));
}

const g0 = rowsOut[0].gap, gN = rowsOut[rowsOut.length - 1].gap;
// depth-compounding = the structure-reader's ADVANTAGE grows with depth (gap widens by a clear margin)
const compounds = gN > g0 + 0.03;
// and the substrate must actually be improving in absolute terms, not just the baseline decaying
const subRises = rowsOut[rowsOut.length - 1].rSub > rowsOut[0].rSub;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  baseline r: ' + rowsOut[0].rBase.toFixed(3) + ' → ' + rowsOut[rowsOut.length - 1].rBase.toFixed(3) + '   (structure-blind)');
console.log('  substrate r: ' + rowsOut[0].rSub.toFixed(3) + ' → ' + rowsOut[rowsOut.length - 1].rSub.toFixed(3) + '   (structure-reader)');
console.log('  GAP: ' + (g0 >= 0 ? '+' : '') + g0.toFixed(3) + ' (depth ' + rowsOut[0].N + ') → ' + (gN >= 0 ? '+' : '') + gN.toFixed(3) + ' (depth ' + rowsOut[rowsOut.length - 1].N + ')   Δgap=' + (gN - g0 >= 0 ? '+' : '') + (gN - g0).toFixed(3));
console.log('  ' + (compounds && subRises
  ? 'DEPTH COMPOUNDS: the structure-reader pulls further ahead of the structure-blind baseline as domain depth grows — accumulated proven structure is free information that sharpens accuracy IN the domain. The depth axis is MEASURED here.'
  : (subRises && gN > g0
    ? 'WEAK/PARTIAL: substrate improves and edges ahead, but the gap widens by less than the 0.03 bar (Δgap=' + (gN - g0).toFixed(3) + ') — suggestive, not decisive. Recorded honestly.'
    : 'NOT SUPPORTED: the structure-reader does not pull ahead as depth grows (Δgap=' + (gN - g0).toFixed(3) + ') — on this test depth acts as ordinary sample efficiency, not compounding structure. Recorded honestly.')));

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/sc-depth-compounding.json', JSON.stringify({ rows: rowsOut, gapLow: g0, gapHigh: gN, deltaGap: gN - g0, compounds: +(compounds && subRises) }, null, 2));
console.log('\n(reported as measured — real UCI/Hamidieh superconductors; depth = cuprate training materials; substrate = whitened resonance re-fit at each depth.)');
