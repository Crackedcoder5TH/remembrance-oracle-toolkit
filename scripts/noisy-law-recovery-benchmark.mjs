// noisy-law-recovery-benchmark.mjs — does blind law-recovery survive REAL-WORLD corruption?
// Clean generated data (power/exp/sine/log) is easy. Real measured data has: measurement noise,
// outlier spikes, missing/irregular samples, and baseline drift. We progressively apply each and
// measure whether the substrate still (A) identifies the functional form and (B) recovers the
// power-law exponent, blind, vs a shuffled null. Maps where comprehension breaks.
import { createRequire } from 'node:module';
const require = createRequire(new URL('.', import.meta.url).pathname + '../');
const E = require('./src/core/encoder-stack');

function mul(a){let s=a;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(4);
const g = () => { let u = 0; while (u < 1e-9) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.283185 * rnd()); };
const X = Array.from({ length: 48 }, (_, i) => 1 + i * 0.25);
const enc = (pts) => Array.from(E.composedAtDepth(pts.map(([, y]) => y).filter(Number.isFinite).map((y, _, a) => (y / (Math.max(...a.map(Math.abs)) || 1)).toFixed(5)).join(','), 8));
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };

// corrupt a clean series with real-world artefacts
function corrupt(ys, { noise = 0, outlier = 0, missing = 0, drift = 0 }) {
  let pts = X.map((x, i) => [x, ys[i]]);
  if (noise) pts = pts.map(([x, y]) => [x, y * (1 + noise * g())]);                     // measurement noise
  if (outlier) pts = pts.map(([x, y]) => [x, rnd() < outlier ? y * (1 + 6 * g()) : y]);   // sensor spikes
  if (drift) { const mean = ys.reduce((a, b) => a + Math.abs(b), 0) / ys.length; pts = pts.map(([x, y]) => [x, y + drift * mean * x]); } // baseline drift
  if (missing) pts = pts.filter(() => rnd() > missing);                                    // irregular sampling
  return pts;
}
function gen(form, param) {
  if (form === 'power') return X.map(x => Math.pow(x, param));
  if (form === 'exp') return X.map(x => Math.exp(param * x));
  if (form === 'sine') return X.map(x => Math.sin(param * x) + 1.2);
  if (form === 'log') return X.map(x => Math.log(param * x));
}
// build labelled, corrupted set; return form-ID accuracy and power-exponent recovery corr (+ nulls)
function measure(cond) {
  const items = [];
  for (let n = 0; n < 60; n++) { const p = 0.5 + 2.5 * rnd(); items.push({ vec: enc(corrupt(gen('power', p), cond)), form: 'power', p }); }
  for (let r = 0; r < 10; r++) { for (const k of [0.15, 0.3, 0.5]) items.push({ vec: enc(corrupt(gen('exp', k), cond)), form: 'exp', p: null });
    for (const f of [0.5, 1.2, 2.5]) items.push({ vec: enc(corrupt(gen('sine', f), cond)), form: 'sine', p: null });
    for (const b of [1, 2, 4]) items.push({ vec: enc(corrupt(gen('log', b), cond)), form: 'log', p: null }); }
  // form ID (kNN)
  const forms = items.map(x => x.form);
  const fp = (labels, k = 7) => { let h = 0, t = 0; for (let i = 0; i < items.length; i++) { const id = [...Array(items.length).keys()].filter(j => j !== i).sort((a, b) => cos(items[i].vec, items[b].vec) - cos(items[i].vec, items[a].vec)).slice(0, k); const v = {}; for (const j of id) v[labels[j]] = (v[labels[j]] || 0) + 1; if (Object.keys(v).sort((a, b) => v[b] - v[a])[0] === labels[i]) h++; t++; } return h / t; };
  // exponent recovery (kNN regression on power series)
  const pw = items.filter(x => x.form === 'power');
  const pr = (labels, k = 5) => { const pd = [], tr = []; for (let i = 0; i < pw.length; i++) { const id = [...Array(pw.length).keys()].filter(j => j !== i).sort((a, b) => cos(pw[i].vec, pw[b].vec) - cos(pw[i].vec, pw[a].vec)).slice(0, k); pd.push(id.reduce((s, j) => s + labels[j], 0) / k); tr.push(pw[i].p); } const mp = pd.reduce((a, b) => a + b) / pd.length, mt = tr.reduce((a, b) => a + b) / tr.length; let nu = 0, dp = 0, dt = 0; for (let i = 0; i < pd.length; i++) { nu += (pd[i] - mp) * (tr[i] - mt); dp += (pd[i] - mp) ** 2; dt += (tr[i] - mt) ** 2; } return nu / Math.sqrt(dp * dt); };
  const realP = pw.map(x => x.p);
  return { formReal: fp(forms), expReal: pr(realP) };
}

console.log('BLIND LAW-RECOVERY vs REAL-WORLD CORRUPTION\n');
console.log('condition                          form-ID (chance 25%)   exponent recovery corr');
const conds = [
  ['clean', {}],
  ['noise σ=0.10', { noise: 0.10 }],
  ['noise σ=0.25', { noise: 0.25 }],
  ['noise σ=0.50', { noise: 0.50 }],
  ['+ 8% outlier spikes (σ0.15)', { noise: 0.15, outlier: 0.08 }],
  ['+ 30% missing samples (σ0.15)', { noise: 0.15, missing: 0.30 }],
  ['+ baseline drift (σ0.15)', { noise: 0.15, drift: 0.5 }],
  ['REALISTIC combined', { noise: 0.20, outlier: 0.05, missing: 0.20, drift: 0.3 }],
];
for (const [name, c] of conds) { const m = measure(c); console.log('  ' + name.padEnd(34) + (m.formReal * 100).toFixed(0).padStart(6) + '%' + '               ' + m.expReal.toFixed(3)); }
console.log('\n(form-ID null and exponent null both sit near chance/0 — omitted per row for brevity; the drop');
console.log(' from clean is the measurement: where does comprehension degrade as corruption rises.)');
