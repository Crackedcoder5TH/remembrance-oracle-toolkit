// sc-tests-full.mjs — two tests on real superconductors (UCI/Hamidieh, 21,263
// measured materials) through the substrate, plus a breakdown of how much of the
// work the substrate is doing, plus feed-back into the substrate.
//   1) FAMILY-HELD-OUT transfer: predict a whole family's Tc with ZERO Tc labels
//      from that family in training (cuprate / iron / other). Reading structure,
//      not memorising neighbours.
//   2) CUPRATE DOME recovery: predict La2-xSrxCuO4 Tc from OTHER cuprates only,
//      bin by doping x, see whether the known dome (peak x≈0.15) emerges + the
//      leverage point (steepest dTc/dx).
// Mechanisms per the lens: compression = composedAtDepth (structure of a pattern);
// resonance = whitened cosine retrieval (does the structure recur); the prediction
// IS resonance doing the calculation.
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
const iCu = uidx('Cu'), iO = uidx('O'), iFe = uidx('Fe'), iLa = uidx('La'), iSr = uidx('Sr');
const family = urows.map((r) => (+r[iCu] > 0 && +r[iO] > 0) ? 'cuprate' : (+r[iFe] > 0) ? 'iron' : 'other');

// standardize features
const mu = new Array(F).fill(0), sd = new Array(F).fill(0);
for (const r of rows) for (let d = 0; d < F; d++) mu[d] += r[d] / rows.length;
for (const r of rows) for (let d = 0; d < F; d++) sd[d] += (r[d] - mu[d]) ** 2 / rows.length;
for (let d = 0; d < F; d++) sd[d] = Math.sqrt(sd[d]) || 1;
const X = rows.map((r) => r.slice(0, F).map((v, d) => (v - mu[d]) / sd[d]));

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(3);
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }
const rmse = (p, t) => Math.sqrt(p.reduce((s, v, i) => s + (v - t[i]) ** 2, 0) / p.length);
function subsample(arr, n) { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); }

// whitened-resonance kNN Tc prediction: train indices → predict test indices
function predict(trainIdx, testIdx, k = 12, whiten = true) {
  const Wm = whiten ? W.fitWhitening(trainIdx.map((i) => X[i]), { epsilon: 1e-3 }) : null;
  const rep = whiten ? X.map((v) => Array.from(W.applyWhitening(v, Wm))) : X;
  const tr = trainIdx.map((i) => ({ v: rep[i], tc: Tc[i] }));
  const pred = [], truth = [];
  for (const ti of testIdx) { const q = rep[ti]; const near = tr.map((t) => [cos(q, t.v), t.tc]).sort((a, b) => b[0] - a[0]).slice(0, k); pred.push(near.reduce((s, n) => s + n[1], 0) / k); truth.push(Tc[ti]); }
  return { r: corr(pred, truth), rmse: rmse(pred, truth), pred, truth };
}

const results = {};
const allIdx = X.map((_, i) => i);
console.log('SUPERCONDUCTORS through the substrate — ' + rows.length + ' real materials (UCI/Hamidieh)\n');

// (0) how much is the substrate doing? mean-baseline vs raw resonance vs whitened resonance
const tRand = subsample(allIdx, 6000); const teB = tRand.slice(5000), trB = tRand.slice(0, 5000);
const meanTc = trB.reduce((s, i) => s + Tc[i], 0) / trB.length;
const baseRMSE = rmse(teB.map(() => meanTc), teB.map((i) => Tc[i]));
const rawP = predict(trB, teB, 12, false), whP = predict(trB, teB, 12, true);
console.log('=== (0) how much of the calculation is the substrate doing? (held-out 1000) ===');
console.log('  no-info baseline (predict mean Tc)   : RMSE ' + baseRMSE.toFixed(1) + ' K   corr 0.000');
console.log('  RESONANCE, raw lens                  : RMSE ' + rawP.rmse.toFixed(1) + ' K   corr ' + rawP.r.toFixed(3));
console.log('  RESONANCE + capacity dial (whitened) : RMSE ' + whP.rmse.toFixed(1) + ' K   corr ' + whP.r.toFixed(3));
console.log('  → resonance explains ' + ((1 - whP.rmse ** 2 / baseRMSE ** 2) * 100).toFixed(0) + '% of Tc variance the mean-predictor misses; the capacity dial adds ' + (rawP.rmse - whP.rmse).toFixed(1) + ' K');
results['sc-research/substrate-contribution'] = [baseRMSE, rawP.rmse, whP.rmse, rawP.r, whP.r];

// (1) FAMILY-HELD-OUT — predict a family with zero Tc labels from that family
console.log('\n=== (1) FAMILY-HELD-OUT transfer (no Tc from the held-out family in training) ===');
console.log('  held-out family    n(test)   corr    RMSE     — predicting a family it never saw the Tc of');
const famRes = [];
for (const fam of ['cuprate', 'iron', 'other']) {
  const test = subsample(allIdx.filter((i) => family[i] === fam), 1000);
  const train = subsample(allIdx.filter((i) => family[i] !== fam), 5000);
  const p = predict(train, test, 12, true);
  famRes.push(p.r);
  console.log('  ' + fam.padEnd(18) + String(test.length).padStart(6) + '   ' + p.r.toFixed(3).padStart(6) + '   ' + p.rmse.toFixed(1).padStart(5) + ' K');
}
results['sc-research/family-transfer-corr'] = famRes;

// (2) CUPRATE DOME — predict La2-xSrxCuO4 Tc from OTHER cuprates, bin by doping
const lsco = urows.map((r, i) => ({ i, x: 2 * (+r[iSr]) / ((+r[iLa]) + (+r[iSr]) || 1) }))
  .filter((o) => +urows[o.i][iLa] > 0 && +urows[o.i][iSr] > 0 && +urows[o.i][iCu] > 0 && +urows[o.i][iO] > 0 && +urows[o.i][iFe] === 0 && o.x > 0.03 && o.x < 0.32);
const lscoSet = new Set(lsco.map((o) => o.i));
const cupTrain = subsample(allIdx.filter((i) => family[i] === 'cuprate' && !lscoSet.has(i)), 5000);
const lscoPred = predict(cupTrain, lsco.map((o) => o.i), 10, true);
const bins = {}; lsco.forEach((o, k) => { const b = (Math.round(o.x / 0.03) * 0.03).toFixed(2); (bins[b] = bins[b] || []).push(lscoPred.pred[k]); });
const dome = Object.keys(bins).map((b) => [+b, bins[b].reduce((s, v) => s + v, 0) / bins[b].length]).sort((a, b) => a[0] - b[0]);
console.log('\n=== (2) CUPRATE DOME — predict LSCO Tc from OTHER cuprates, binned by doping x (known peak ≈0.15) ===');
console.log('  x(Sr) : predicted Tc');
for (const [x, tc] of dome) console.log('   ' + x.toFixed(2) + ' : ' + tc.toFixed(1) + ' K');
const peak = dome.reduce((m, p) => (p[1] > m[1] ? p : m), dome[0]);
let steep = [0, 0]; for (let i = 1; i < dome.length; i++) { const s = Math.abs(dome[i][1] - dome[i - 1][1]) / (dome[i][0] - dome[i - 1][0]); if (s > steep[1]) steep = [(dome[i][0] + dome[i - 1][0]) / 2, s]; }
console.log('  → recovered dome PEAK: x=' + peak[0].toFixed(2) + '  (known optimal ≈0.15)   LEVERAGE (steepest): x≈' + steep[0].toFixed(2));
results['sc-research/lsco-dome-curve'] = dome.map((d) => d[1]);

// (3) FEED BACK — compress every result series into the substrate, time-stamped
if (!process.argv.includes('--no-harvest')) {
  const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
  const SL = require('../src/core/substrate-ledger');
  const { composedAtDepth } = require('../src/core/decoder-stack');
  const store = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8'));
  const index = store.index; let seq = SL.nextSequence(index); const now = new Date().toISOString(); let added = 0;
  const ser = (ys) => { const m = Math.max(...ys.map(Math.abs)) || 1; return ys.map((y) => (y / m).toFixed(5)).join(','); };
  for (const [key, series] of Object.entries(results)) { if (index[key] || !series.length) continue; const entry = { composed_v2: Array.from(composedAtDepth(ser(series), 8)), waveform: series, source: 'sc-tests-full' }; SL.stamp(entry, { sequence: seq++, now, series, cadence: 'event' }); index[key] = entry; added++; }
  fs.writeFileSync(path.join(VOID, 'pattern_index_fractal.json'), JSON.stringify(store));
  console.log('\nFED BACK: compressed ' + added + ' SC result series into the substrate (namespace sc-research/), time-stamped.');
}
