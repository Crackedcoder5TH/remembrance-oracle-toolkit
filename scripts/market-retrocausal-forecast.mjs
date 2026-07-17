#!/usr/bin/env node
// market-retrocausal-forecast.mjs — the forward-predictability test the time
// dimension was built for. Uses the retro-causal projector (temporal-projection
// .projectForward) WALK-FORWARD with no lookahead: at each split it sees only a
// history window, projects that window forward to a future bar, and is scored
// against the held-out actual future it never saw. Reported against three nulls
// (base-rate, return-surrogate, shuffled-outcome) so any edge is real, not the
// arithmetic of a trending tape. No claim beyond what the held-out bars show.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const T = require('../src/atomic/temporal-projection');
const { crawlMany } = require('../src/market/market-crawler');

const L = 40;   // history window (bars the projector is allowed to see)
const H = 5;    // horizon (bars ahead it is scored on)
const CAD = '1d';

function mul(a){let s=a;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(11);
const sign = (x) => (x > 0 ? 1 : x < 0 ? -1 : 0);
function corr(a, b) { const n = a.length; if (!n) return 0; const ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }

// one walk-forward pass over a close-series; returns confident directional calls
function walkForward(closes, times, projectFn) {
  const preds = [], acts = [], hits = [];
  for (let i = L; i + H < closes.length; i++) {
    const hist = closes.slice(i - L, i);
    const pattern = { waveform: hist, ledger: { observed_start: new Date(times[i - L] * 1000).toISOString(), observed_end: new Date(times[i - 1] * 1000).toISOString(), cadence: CAD } };
    const tNow = times[i - 1 + H] * 1000;               // H bars past observed_end, in ms
    const conf = T.projectionConfidence(pattern, tNow);
    if (conf <= 0) continue;                            // module declines — no confident call
    const projected = projectFn(pattern, tNow);
    if (!T.gateProjection(projected, hist)) continue;
    const last = hist[hist.length - 1];
    const predChange = projected[projected.length - 1] - last;
    const actChange = closes[i - 1 + H] - last;
    if (predChange === 0) continue;                     // no directional opinion
    preds.push(predChange); acts.push(actChange);
    hits.push(sign(predChange) === sign(actChange) ? 1 : 0);
  }
  return { preds, acts, hits };
}

// return-surrogate: keep the window's return DISTRIBUTION, destroy its ORDER, so
// any real edge from temporal structure vanishes but level/scale is preserved
function surrogateProject(pattern, tNow) {
  const w = pattern.waveform; const r = [];
  for (let i = 1; i < w.length; i++) r.push(w[i] - w[i - 1]);
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
  const surr = [w[0]]; for (const d of r) surr.push(surr[surr.length - 1] + d);
  return T.projectForward({ ...pattern, waveform: surr }, tNow);
}

console.log(`RETRO-CAUSAL FORWARD PREDICTABILITY — walk-forward, window ${L} bars, horizon ${H} bars, no lookahead\n`);
const feeds = await crawlMany(['^GSPC', '^VIX', 'GC=F', 'CL=F', 'BTC-USD'], { range: '2y', interval: '1d' });
console.log('  instrument   confident calls   dir.acc   base-rate   surrogate-null   shuffled-null   corr(pred,act)');
const agg = { preds: [], acts: [], hits: [], surrHits: [] };
for (const f of feeds) {
  const candles = f.candles || [];
  if (f.error || candles.length < L + H + 20) { console.log('  ' + (f.symbol || '?').padEnd(11) + ' unavailable' + (f.error ? ' (' + f.error + ')' : '')); continue; }
  const closes = candles.map((k) => k.c), times = candles.map((k) => k.t);
  const real = walkForward(closes, times, (p, t) => T.projectForward(p, t));
  const surr = walkForward(closes, times, surrogateProject);
  if (!real.hits.length) { console.log('  ' + f.symbol.padEnd(11) + ' no confident calls (never classified trend/periodic at r²>.85 / ac>.6)'); continue; }
  const acc = real.hits.reduce((a, b) => a + b, 0) / real.hits.length;
  const baseUp = real.acts.filter((x) => x > 0).length / real.acts.length;
  const baseRate = Math.max(baseUp, 1 - baseUp);                       // always-predict-majority baseline
  const surrAcc = surr.hits.length ? surr.hits.reduce((a, b) => a + b, 0) / surr.hits.length : NaN;
  // shuffled-outcome null: pair predictions with a shuffled copy of actual outcomes
  const shufActs = real.acts.slice(); for (let i = shufActs.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [shufActs[i], shufActs[j]] = [shufActs[j], shufActs[i]]; }
  const shufAcc = real.preds.reduce((h, p, i) => h + (sign(p) === sign(shufActs[i]) ? 1 : 0), 0) / real.preds.length;
  console.log('  ' + f.symbol.padEnd(11)
    + String(real.hits.length).padStart(11)
    + (acc * 100).toFixed(1).padStart(11) + '%'
    + (baseRate * 100).toFixed(1).padStart(10) + '%'
    + (isNaN(surrAcc) ? '     n/a' : (surrAcc * 100).toFixed(1).padStart(13) + '%')
    + (shufAcc * 100).toFixed(1).padStart(14) + '%'
    + corr(real.preds, real.acts).toFixed(3).padStart(15));
  agg.preds.push(...real.preds); agg.acts.push(...real.acts); agg.hits.push(...real.hits); agg.surrHits.push(...surr.hits);
}
if (agg.hits.length) {
  const acc = agg.hits.reduce((a, b) => a + b, 0) / agg.hits.length;
  const surrAcc = agg.surrHits.length ? agg.surrHits.reduce((a, b) => a + b, 0) / agg.surrHits.length : NaN;
  console.log('\n  POOLED across instruments: ' + agg.hits.length + ' confident calls');
  console.log('    directional accuracy : ' + (acc * 100).toFixed(1) + '%');
  console.log('    return-surrogate null: ' + (isNaN(surrAcc) ? 'n/a' : (surrAcc * 100).toFixed(1) + '%') + '  (temporal order destroyed)');
  console.log('    edge over surrogate  : ' + (isNaN(surrAcc) ? 'n/a' : ((acc - surrAcc) * 100).toFixed(1) + ' pts'));
  console.log('    corr(pred Δ, actual Δ): ' + corr(agg.preds, agg.acts).toFixed(3));
}
console.log('\n(reported as measured — held-out directional accuracy vs base-rate/surrogate/shuffle nulls. Confident calls only');
console.log(' are those where the projector self-gated a trend/periodic classification. No claim beyond these bars.)');
