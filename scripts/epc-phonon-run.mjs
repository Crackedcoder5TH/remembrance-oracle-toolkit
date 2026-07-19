// epc-phonon-run.mjs — the first-principles lens. JARVIS EPC data (1058 materials,
// DFPT electron-phonon coupling): λ, ωlog, the Eliashberg spectral function α²F(ω),
// and Allen-Dynes Tc. Same materials, two lenses:
//   STRUCTURE (cfid descriptor) — what composition/structure could see (failed to
//     transfer Tc across families earlier), vs
//   PHONON (λ, ωlog, α²F) — the actual physical determinants of conventional Tc.
// Tests: Tc prediction, and FAMILY-HELD-OUT transfer by anchor element (the test
// composition scored ~0 on). The physics is universal (Tc=AllenDynes(λ,ωlog)), so
// if the substrate reads the physical lens it should transfer where structure did not.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('../src/core/whitening');
const { composedAtDepth } = require('../src/core/encoder-stack');
const SL = require('../src/core/substrate-ledger');

const DIR = process.env.SC_DATA_DIR || '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad';
const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const D = JSON.parse(fs.readFileSync(path.join(DIR, 'epc_extract.json'), 'utf8'));
const Tc = D.map((o) => o.tc);

// build lens feature matrices, standardized per column
function standardize(M) { const n = M.length, P = M[0].length; const mu = new Array(P).fill(0), sd = new Array(P).fill(0); for (const r of M) for (let d = 0; d < P; d++) mu[d] += r[d] / n; for (const r of M) for (let d = 0; d < P; d++) sd[d] += (r[d] - mu[d]) ** 2 / n; for (let d = 0; d < P; d++) sd[d] = Math.sqrt(sd[d]) || 1; return M.map((r) => r.map((v, d) => (v - mu[d]) / sd[d])); }
const clean = (v) => (Number.isFinite(v) ? v : 0);
const structLens = standardize(D.map((o) => o.cfid.map(clean)));                 // structure-only
const phononLens = standardize(D.map((o) => [clean(o.lamb), clean(o.wlog)]));     // λ, ωlog
const spectrumLens = standardize(D.map((o) => o.a2f.map(clean)));                 // α²F(ω) spectral function

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(9);
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }
const rmse = (p, t) => Math.sqrt(p.reduce((s, v, i) => s + (v - t[i]) ** 2, 0) / p.length);
const sub = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
function predict(rep, trI, teI, k = 10) { const Wm = W.fitWhitening(trI.map((i) => rep[i]), { epsilon: 1e-3 }); const rr = rep.map((v) => Array.from(W.applyWhitening(v, Wm))); const tr = trI.map((i) => ({ v: rr[i], tc: Tc[i] })); const pred = [], truth = []; for (const ti of teI) { const q = rr[ti]; const nr = tr.map((t) => [cos(q, t.v), t.tc]).sort((a, b) => b[0] - a[0]).slice(0, k); pred.push(nr.reduce((s, n) => s + n[1], 0) / k); truth.push(Tc[ti]); } return { r: corr(pred, truth), rmse: rmse(pred, truth) }; }
const allIdx = D.map((_, i) => i);

console.log('FIRST-PRINCIPLES LENS — JARVIS electron-phonon data (' + D.length + ' materials, DFPT λ/ωlog/α²F + Allen-Dynes Tc)\n');
// analytic check: is Tc really determined by λ,ωlog here? (Allen-Dynes formula)
const AD = D.map((o) => { const l = o.lamb, w = o.wlog, mu = 0.1; if (!(l > mu * (1 + 0.62 * l))) return 0; return (w / 1.2) * Math.exp(-1.04 * (1 + l) / (l - mu * (1 + 0.62 * l))); });
console.log('  sanity: analytic Allen-Dynes Tc(λ,ωlog) vs dataset Tc  corr ' + corr(AD, Tc).toFixed(3) + '  (confirms Tc is a function of the phonon physics)\n');

// (A) Tc PREDICTION, random held-out — each lens
const tr = sub(allIdx, 850), te = allIdx.filter((i) => !new Set(tr).has(i));
console.log('=== (A) Tc prediction (random held-out ' + te.length + ') — which lens reads it? ===');
console.log('  STRUCTURE lens (cfid)        corr ' + predict(structLens, tr, te).r.toFixed(3));
console.log('  PHONON lens (λ, ωlog)        corr ' + predict(phononLens, tr, te).r.toFixed(3));
console.log('  SPECTRUM lens (α²F(ω), 100-D) corr ' + predict(spectrumLens, tr, te).r.toFixed(3));

// (B) FAMILY-HELD-OUT by anchor element — the transfer test composition scored ~0 on
const groups = {}; D.forEach((o, i) => { (groups[o.el0] = groups[o.el0] || []).push(i); });
const bigFam = Object.keys(groups).filter((g) => groups[g].length >= 45).sort((a, b) => groups[b].length - groups[a].length).slice(0, 4);
console.log('\n=== (B) FAMILY-HELD-OUT Tc transfer by anchor element (zero Tc from the held-out family) ===');
console.log('  family(n)        STRUCTURE corr    PHONON corr    — does the physical lens transfer where structure cannot?');
const famRows = [];
for (const g of bigFam) { const test = groups[g]; const train = allIdx.filter((i) => D[i].el0 !== g); const rs = predict(structLens, sub(train, 700), test); const rp = predict(phononLens, sub(train, 700), test); famRows.push(rp.r); console.log('  ' + (g + '(' + test.length + ')').padEnd(16) + rs.r.toFixed(3).padStart(9) + rp.r.toFixed(3).padStart(16)); }

// (C) FEED the phonon patterns into the substrate (compressed)
if (!process.argv.includes('--no-harvest')) {
  const store = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8'));
  const index = store.index; let seq = SL.nextSequence(index); const now = new Date().toISOString(); let added = 0;
  const ser = (ys) => { const m = Math.max(...ys.map(Math.abs)) || 1; return ys.map((y) => (y / m).toFixed(5)).join(','); };
  for (let i = 0; i < D.length; i++) { const key = 'epc-phonon/' + (D[i].el0 || 'X') + '/' + i; if (index[key]) continue;
    const entry = { composed_v2: Array.from(composedAtDepth(ser(D[i].a2f.map(clean)), 8)), waveform: D[i].a2f, tc: D[i].tc, lamb: D[i].lamb, wlog: D[i].wlog, source: 'jarvis-epc' };
    SL.stamp(entry, { sequence: seq++, now, series: D[i].a2f.map(clean), cadence: 'event' }); index[key] = entry; added++; }
  fs.writeFileSync(path.join(VOID, 'pattern_index_fractal.json'), JSON.stringify(store));
  console.log('\nFED INTO SUBSTRATE: compressed ' + added + ' phonon (α²F) patterns into Void (namespace epc-phonon/), time-stamped.');
}
console.log('\n(reported as measured. structure vs phonon lens on the SAME materials; the family-held-out column is the test');
console.log(' composition/structure scored ~0 on. no pre-asserted limits — the lenses are compared on the numbers.)');
