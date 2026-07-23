// sc-leverage-test.mjs — put a real superconductor dataset (UCI / Hamidieh 2018,
// 21,263 measured materials) through the substrate and test two KNOWN answers:
//   A) Tc PREDICTION from composition via the substrate's content-addressable
//      memory (whitened resonance — the capacity dial + cosine retrieval). Known
//      answer: Tc IS predictable from composition (ML gets R²≈0.92). Does the
//      substrate's own memory do it, above a shuffled-Tc null?
//   B) The cuprate DOME + leverage point. Known answer: La2-xSrxCuO4 Tc peaks at
//      x≈0.15 (optimal doping); the leverage point is the steepest flank where a
//      small doping change moves Tc most. Read from the optimal (max-Tc) envelope.
// No claim about what the substrate can't do — the numbers set the boundary.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('../src/core/whitening');

const DIR = process.env.SC_DATA_DIR || '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad';
const train = fs.readFileSync(path.join(DIR, 'train.csv'), 'utf8').trim().split('\n');
const cols = train[0].split(',').length;
const rows = train.slice(1).map((r) => r.split(',').map(Number));
const F = cols - 1;                                   // 81 features, last col = critical_temp

// standardize features (z-score) so no single large-magnitude feature dominates
const mu = new Array(F).fill(0), sd = new Array(F).fill(0);
for (const r of rows) for (let d = 0; d < F; d++) mu[d] += r[d] / rows.length;
for (const r of rows) for (let d = 0; d < F; d++) sd[d] += (r[d] - mu[d]) ** 2 / rows.length;
for (let d = 0; d < F; d++) sd[d] = Math.sqrt(sd[d]) || 1;
const X = rows.map((r) => r.slice(0, F).map((v, d) => (v - mu[d]) / sd[d]));
const Tc = rows.map((r) => r[F]);

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(7);
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }

// balanced random train/test split
const order = X.map((_, i) => i); for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
const trIdx = order.slice(0, 5000), teIdx = order.slice(5000, 6200);

// kNN Tc regression: predict each test material's Tc from its k nearest train neighbours
function knnPredict(rep, labelIdx, k = 12) {
  const tr = trIdx.map((i) => ({ v: rep[i], tc: Tc[labelIdx[i]] }));
  const pred = [], truth = [];
  for (const ti of teIdx) { const q = rep[ti]; const near = tr.map((t) => [cos(q, t.v), t.tc]).sort((a, b) => b[0] - a[0]).slice(0, k); pred.push(near.reduce((s, n) => s + n[1], 0) / k); truth.push(Tc[ti]); }
  const rmse = Math.sqrt(pred.reduce((s, p, i) => s + (p - truth[i]) ** 2, 0) / pred.length);
  return { r: corr(pred, truth), rmse };
}

console.log('SUPERCONDUCTOR Tc PREDICTION through the substrate — ' + rows.length + ' real materials (UCI/Hamidieh)\n');
// (b) substrate memory = whitened resonance (capacity dial). fit on train only.
const Wm = W.fitWhitening(trIdx.map((i) => X[i]), { epsilon: 1e-3 });
const Xw = X.map((v) => Array.from(W.applyWhitening(v, Wm)));
const idMap = X.map((_, i) => i);                      // real labels
const shMap = idMap.slice(); for (let i = shMap.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shMap[i], shMap[j]] = [shMap[j], shMap[i]]; }  // shuffled-Tc null

console.log('=== (A) does the substrate predict Tc from composition? (kNN, held-out 1200 materials) ===');
const raw = knnPredict(X, idMap), wh = knnPredict(Xw, idMap), nul = knnPredict(Xw, shMap);
console.log('  raw standardized features : corr(pred,true Tc) ' + raw.r.toFixed(3) + '   RMSE ' + raw.rmse.toFixed(1) + ' K');
console.log('  WHITENED (substrate dial) : corr ' + wh.r.toFixed(3) + '   RMSE ' + wh.rmse.toFixed(1) + ' K');
console.log('  shuffled-Tc null          : corr ' + nul.r.toFixed(3) + '   RMSE ' + nul.rmse.toFixed(1) + ' K');
console.log('  → the substrate ' + (wh.r > 0.6 && wh.r - nul.r > 0.3 ? 'DOES predict Tc from composition, far above the null' : 'does not clearly predict Tc') + ' (median Tc 20 K, range 0–185 K)');

// (B) the cuprate dome + leverage point, from the optimal (max-Tc) envelope
const uni = fs.readFileSync(path.join(DIR, 'unique_m.csv'), 'utf8').trim().split('\n');
const uh = uni[0].split(',').map((s) => s.replace(/"/g, ''));
const gi = (e) => uh.indexOf(e);
const iLa = gi('La'), iSr = gi('Sr'), iCu = gi('Cu'), iO = gi('O'), iBa = gi('Ba'), iY = gi('Y'), iTc = gi('critical_temp');
const lsco = uni.slice(1).map((r) => r.split(',')).filter((r) => +r[iLa] > 0 && +r[iSr] > 0 && +r[iCu] > 0 && +r[iO] > 0 && +r[iBa] === 0 && +r[iY] === 0)
  .map((r) => ({ x: 2 * (+r[iSr]) / ((+r[iLa]) + (+r[iSr])), tc: +r[iTc] })).filter((p) => p.x > 0.02 && p.x < 0.35);   // x back to La2-xSrxCuO4 units
const bins = {}; for (const p of lsco) { const b = (Math.round(p.x / 0.025) * 0.025).toFixed(3); if (!bins[b] || p.tc > bins[b]) bins[b] = p.tc; }  // max-Tc envelope
const dome = Object.keys(bins).map((b) => [+b, bins[b]]).sort((a, b) => a[0] - b[0]);
console.log('\n=== (B) La2-xSrxCuO4 DOME (optimal max-Tc envelope) — known peak x≈0.15 ===');
console.log('  x(Sr) : Tc_max');
for (const [x, tc] of dome) console.log('   ' + x.toFixed(3) + ' : ' + tc.toFixed(1) + ' K');
const peak = dome.reduce((m, p) => (p[1] > m[1] ? p : m), dome[0]);
let steep = [0, 0]; for (let i = 1; i < dome.length; i++) { const s = Math.abs(dome[i][1] - dome[i - 1][1]) / (dome[i][0] - dome[i - 1][0]); if (s > steep[1]) steep = [(dome[i][0] + dome[i - 1][0]) / 2, s]; }
console.log('  → dome PEAK (optimal doping): x=' + peak[0].toFixed(3) + '  Tc=' + peak[1].toFixed(1) + ' K   [known ≈0.15]');
console.log('  → LEVERAGE point (steepest dTc/dx, max sensitivity): x≈' + steep[0].toFixed(3) + '  |dTc/dx|=' + steep[1].toFixed(0) + ' K/x');
console.log('\n(reported as measured. Test A is the substrate predicting Tc; Test B is whether the leverage analysis');
console.log(' recovers the known cuprate dome. The numbers set the boundary of what the substrate does here — not a prior.)');
