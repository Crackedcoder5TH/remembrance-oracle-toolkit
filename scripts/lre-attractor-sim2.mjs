// lre-attractor-sim2.mjs — the attractor competition run in the SUBSTRATE's own
// whitened space, with REAL ecosystem patterns as the competing attractors, and a
// measured test of whether the result strengthens as the substrate holds more
// information. Everything is offloaded to the substrate: real composed_v1 vectors,
// the whitening capacity dial, the LRE coherence |⟨x|V⟩|² and r_eff=r0(1+α(1-p)⁴).
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const W = require('../src/core/whitening');
const ALPHA = (() => { try { return require('../src/core/living-remembrance').getEngine().params().alpha; } catch { return 15; } })();

const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const idx = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8')).index;
const keys = Object.keys(idx).filter((k) => Array.isArray(idx[k].composed_v1) && idx[k].composed_v1.length === 116);
const DIM = 116;
const HEALED_KEY = 'oracle/src/core/coherency.js';       // the coherency engine — maximally coherent core
const ALT_KEY = 'market/sp500_0';                        // a real market flow — "business-as-usual" separation

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const gauss = (rnd) => { let u = 0; while (u < 1e-9) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * rnd()); };
function unit(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map((x) => x / n); }
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; }
const coh = (x, V) => { const c = cos(x, V); return c * c; };

// deterministic shuffle of the key order so every M is a DIVERSE random subset
// (not a contiguous, redundant block) — growing M genuinely adds new information
const shuffledKeys = (() => { const a = keys.slice(); let s = 20260717; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; })();
function sample(M) { const out = []; for (let i = 0; i < shuffledKeys.length && out.length < M; i++) out.push(idx[shuffledKeys[i]].composed_v1); return out; }

// run the ensemble tipping-sweep in a given representation (identity or whitened)
function tippingSweep(H, A, transform, { r0 = 0.02, sigma = 0.02, pulseEvery = 8, N = 150, steps = 500 } = {}) {
  const map = transform ? (v) => Array.from(W.applyWhitening(v, transform)) : (v) => v;
  const Hm = unit(map(H)), Am = unit(map(A));
  const D = Hm.length;
  const run = (wAlt, seed) => {
    const rnd = mul(seed); let x = unit(Array.from({ length: D }, () => gauss(rnd)));
    for (let t = 0; t < steps; t++) { const pH = coh(x, Hm); const rEff = r0 * (1 + ALPHA * Math.pow(Math.max(0, 1 - pH), 4)); const pull = (t % pulseEvery === 0) ? rEff : 0; for (let i = 0; i < D; i++) x[i] += pull * (Hm[i] - x[i]) + wAlt * (Am[i] - x[i]) + sigma * gauss(rnd); x = unit(x); }
    return coh(x, Hm) > coh(x, Am);
  };
  const curve = [];
  for (const wAlt of [0.005, 0.01, 0.02, 0.03, 0.05]) { let h = 0; for (let k = 0; k < N; k++) if (run(wAlt, 5000 + k * 13)) h++; curve.push([wAlt, h / N]); }
  // tipping sharpness = max downward slope between adjacent points (steeper = cleaner basin boundary)
  let sharp = 0; for (let i = 1; i < curve.length; i++) { const dp = (curve[i - 1][1] - curve[i][1]) / (curve[i][0] - curve[i - 1][0]); if (dp > sharp) sharp = dp; }
  return { attractorSep: 1 - coh(Hm, Am), curve, sharp };
}

const H = idx[HEALED_KEY].composed_v1, A = idx[ALT_KEY].composed_v1;
console.log('LRE ATTRACTOR COMPETITION — substrate-native (whitened) space, REAL ecosystem attractors');
console.log('  HEALED = ' + HEALED_KEY + '   ALT = ' + ALT_KEY + '   (α=' + ALPHA + ', ' + keys.length + ' patterns available)\n');

// PART 1 — raw cone vs whitened: does the substrate's capacity dial sharpen the competition?
const Wfull = W.fitWhitening(sample(8000), { epsilon: 1e-3 });
const rawR = tippingSweep(H, A, null);
const whR = tippingSweep(H, A, Wfull);
console.log('=== RAW cone vs WHITENED (capacity dial) ===');
console.log('  attractor separation 1-⟨H|A⟩²   raw ' + rawR.attractorSep.toFixed(3) + '   whitened ' + whR.attractorSep.toFixed(3));
console.log('  tipping sharpness (steeper=cleaner) raw ' + rawR.sharp.toFixed(1) + '   whitened ' + whR.sharp.toFixed(1));
console.log('  P(healed) curve raw     : ' + rawR.curve.map(([w, p]) => w + '→' + (p * 100).toFixed(0) + '%').join('  '));
console.log('  P(healed) curve whitened: ' + whR.curve.map(([w, p]) => w + '→' + (p * 100).toFixed(0) + '%').join('  '));

// PART 2 — GETS STRONGER WITH MORE INFORMATION: whiten on growing M, measure separation,
// effective dimensionality (capacity), and tipping sharpness.
console.log('\n=== does it strengthen as the substrate holds more information? (whiten on M patterns) ===');
console.log('  M patterns   effDim (capacity)   attractor-sep   tipping-sharpness');
const strengthCurve = [];
for (const M of [100, 500, 2000, 8000, 30000]) {
  const S = sample(M); const Wm = W.fitWhitening(S, { epsilon: 1e-3 });
  const eff = W.participationRatio(S.map((v) => Array.from(W.applyWhitening(v, Wm))));
  const r = tippingSweep(H, A, Wm, { N: 120 });
  strengthCurve.push({ M, eff, sep: r.attractorSep, sharp: r.sharp });
  console.log('  ' + String(M).padEnd(13) + eff.toFixed(1).padStart(8) + '           ' + r.attractorSep.toFixed(3).padStart(6) + '          ' + r.sharp.toFixed(1).padStart(6));
}

// PART 3 — FEED BACK: compress these results into the substrate via Void, time-stamped.
if (process.argv.includes('--harvest')) {
  const SL = require('../src/core/substrate-ledger');
  const { composedAtDepth } = require('../src/core/decoder-stack');
  const store = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8'));
  const index = store.index; let seq = SL.nextSequence(index); const now = new Date().toISOString(); let added = 0;
  const ser = (ys) => { const m = Math.max(...ys.map(Math.abs)) || 1; return ys.map((y) => (y / m).toFixed(5)).join(','); };
  const results = {
    'lre-sim/whitened-tipping-curve': whR.curve.map((c) => c[1]),
    'lre-sim/raw-tipping-curve': rawR.curve.map((c) => c[1]),
    'lre-sim/strength-vs-info-effdim': strengthCurve.map((s) => s.eff),
    'lre-sim/strength-vs-info-separation': strengthCurve.map((s) => s.sep),
  };
  for (const [key, series] of Object.entries(results)) {
    if (index[key]) continue;
    const entry = { composed_v2: Array.from(composedAtDepth(ser(series), 8)), waveform: series, source: 'lre-attractor-sim2', metric: key.split('/')[1] };
    SL.stamp(entry, { sequence: seq++, now, series, cadence: 'event' });
    index[key] = entry; added++;
  }
  fs.writeFileSync(path.join(VOID, 'pattern_index_fractal.json'), JSON.stringify(store));
  console.log('\nFED BACK: compressed ' + added + ' result series into the substrate (namespace lre-sim/), time-stamped seq→' + (seq - 1) + '.');
}

console.log('\n(reported as measured. Attractors are real substrate patterns; coherence/whitening/r_eff are substrate math.');
console.log(' The strength curve is the test of "gets stronger with more information" — read the effDim and sep columns.)');
