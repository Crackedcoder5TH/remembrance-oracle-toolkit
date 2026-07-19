// mp-structural-run.mjs — feed Materials Project DFT structural data (via the open
// 3DSC dataset: SuperCon Tc matched to MP crystal structures) into the Void
// substrate, then run the family-held-out Tc test on STRUCTURE (the fair
// first-principles-ish test composition couldn't reach) and the LRE attractor sim
// on real structural patterns. No pre-asserted limits — the data rules.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const W = require('../src/core/whitening');
const { composedAtDepth } = require('../src/core/encoder-stack');
const SL = require('../src/core/substrate-ledger');

const DIR = process.env.SC_DATA_DIR || '/tmp/claude-0/-home-user/f2e464dd-ac55-5fe6-83d2-bba60ba4ad4c/scratchpad';
const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
function parseCSV(txt){const rows=[];let f=[],cur="",q=false;const Q=String.fromCharCode(34);for(let i=0;i<txt.length;i++){const c=txt[i];if(q){if(c===Q){if(txt[i+1]===Q){cur+=Q;i++;}else q=false;}else cur+=c;}else{if(c===Q)q=true;else if(c===",") {f.push(cur);cur="";}else if(c==="\n"){f.push(cur);rows.push(f);f=[];cur="";}else if(c!=="\r")cur+=c;}}if(cur||f.length){f.push(cur);rows.push(f);}return rows;}
const txt = fs.readFileSync(path.join(DIR, '3dsc.csv'), 'utf8');
const rows = parseCSV(txt.slice(txt.indexOf('\n') + 1));
const H = rows[0]; const ci = (n) => H.indexOf(n);
const C = { tc: ci('tc'), fam: ci('sc_class'), form: ci('norm_formula_sc'),
  feats: ['lata_2', 'latb_2', 'latc_2', 'band_gap_2', 'density_2', 'e_above_hull_2', 'efermi_2', 'energy_per_atom_2', 'formation_energy_per_atom_2', 'nsites_2', 'total_magnetization_2', 'num_elements_sc'].map(ci),
  cryst: ci('crystal_system_2') };
const CRYST = ['cubic', 'tetragonal', 'orthorhombic', 'hexagonal', 'trigonal', 'monoclinic', 'triclinic'];
const FAMILY = (s) => /Cuprate/.test(s) ? 'cuprate' : /Ferrite/.test(s) ? 'iron' : /Oxide/.test(s) ? 'oxide' : /Heavy_fermion/.test(s) ? 'heavy_fermion' : 'other';

// build the structural feature matrix (impute missing with column mean)
const raw = [];
for (let i = 1; i < rows.length; i++) { const r = rows[i]; const tc = +r[C.tc]; if (!(tc > 0)) continue;
  const num = C.feats.map((k) => { const v = parseFloat(r[k]); return Number.isFinite(v) ? v : NaN; });
  const onehot = CRYST.map((c) => (r[C.cryst] === c ? 1 : 0));
  raw.push({ tc, fam: FAMILY(r[C.fam]), form: r[C.form], vec: num.concat(onehot) }); }
const P = raw[0].vec.length;
const mu = new Array(P).fill(0), cnt = new Array(P).fill(0);
for (const o of raw) for (let d = 0; d < P; d++) if (Number.isFinite(o.vec[d])) { mu[d] += o.vec[d]; cnt[d]++; }
for (let d = 0; d < P; d++) mu[d] /= (cnt[d] || 1);
for (const o of raw) for (let d = 0; d < P; d++) if (!Number.isFinite(o.vec[d])) o.vec[d] = mu[d];
const sd = new Array(P).fill(0);
for (const o of raw) for (let d = 0; d < P; d++) sd[d] += (o.vec[d] - mu[d]) ** 2 / raw.length;
for (let d = 0; d < P; d++) sd[d] = Math.sqrt(sd[d]) || 1;
const X = raw.map((o) => o.vec.map((v, d) => (v - mu[d]) / sd[d]));
const Tc = raw.map((o) => o.tc), Fam = raw.map((o) => o.fam);
console.log('MATERIALS PROJECT STRUCTURAL DATA (3DSC) — ' + raw.length + ' superconductors with DFT structure + Tc');
console.log('  features: lattice a/b/c, band_gap, density, e_above_hull, efermi, energy/atom, formation_E, nsites, magnetization, num_el, crystal_system');
const famCount = {}; for (const f of Fam) famCount[f] = (famCount[f] || 0) + 1;
console.log('  families: ' + Object.entries(famCount).map(([k, v]) => k + ':' + v).join('  ') + '\n');

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(5);
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
function corr(a, b) { const n = a.length, ma = a.reduce((x, y) => x + y, 0) / n, mb = b.reduce((x, y) => x + y, 0) / n; let nu = 0, da = 0, db = 0; for (let i = 0; i < n; i++) { nu += (a[i] - ma) * (b[i] - mb); da += (a[i] - ma) ** 2; db += (b[i] - mb) ** 2; } return (da && db) ? nu / Math.sqrt(da * db) : 0; }
const rmse = (p, t) => Math.sqrt(p.reduce((s, v, i) => s + (v - t[i]) ** 2, 0) / p.length);
const sub = (arr, n) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a.slice(0, n); };
function predict(trI, teI, k = 12) { const Wm = W.fitWhitening(trI.map((i) => X[i]), { epsilon: 1e-3 }); const rep = X.map((v) => Array.from(W.applyWhitening(v, Wm))); const tr = trI.map((i) => ({ v: rep[i], tc: Tc[i] })); const pred = [], truth = []; for (const ti of teI) { const q = rep[ti]; const nr = tr.map((t) => [cos(q, t.v), t.tc]).sort((a, b) => b[0] - a[0]).slice(0, k); pred.push(nr.reduce((s, n) => s + n[1], 0) / k); truth.push(Tc[ti]); } return { r: corr(pred, truth), rmse: rmse(pred, truth) }; }
const allIdx = X.map((_, i) => i);

// FAMILY-HELD-OUT on STRUCTURE — the fair first-principles test
console.log('=== FAMILY-HELD-OUT Tc transfer on STRUCTURE (zero Tc from held-out family) ===');
console.log('  composition earlier: cuprate transfer corr 0.192. does DFT structure change it?');
const famResults = {};
for (const fam of ['cuprate', 'iron', 'oxide', 'other']) {
  const test = allIdx.filter((i) => Fam[i] === fam); const train = allIdx.filter((i) => Fam[i] !== fam);
  if (test.length < 30) continue;
  const p = predict(sub(train, 3000), sub(test, Math.min(800, test.length)));
  famResults[fam] = p.r;
  console.log('  ' + fam.padEnd(14) + 'n=' + String(test.length).padStart(4) + '   corr ' + p.r.toFixed(3) + '   RMSE ' + p.rmse.toFixed(1) + ' K');
}

// LRE ATTRACTOR SIM on real structural patterns: high-Tc vs low-Tc structural centroids
console.log('\n=== LRE attractor sim on REAL structural patterns (high-Tc vs low-Tc basins) ===');
const Wm = W.fitWhitening(sub(allIdx, 3000).map((i) => X[i]), { epsilon: 1e-3 });
const Xw = X.map((v) => Array.from(W.applyWhitening(v, Wm)));
const hi = allIdx.filter((i) => Tc[i] >= 60), lo = allIdx.filter((i) => Tc[i] <= 5);
const centroid = (S) => { const D = Xw[0].length; const c = new Array(D).fill(0); for (const i of S) for (let d = 0; d < D; d++) c[d] += Xw[i][d] / S.length; let n = 0; for (const v of c) n += v * v; n = Math.sqrt(n) || 1; return c.map((v) => v / n); };
const HI = centroid(hi), LO = centroid(lo), ALPHA = 15;
console.log('  HIGH-Tc structural attractor (Tc≥60K, n=' + hi.length + ') vs LOW-Tc (Tc≤5K, n=' + lo.length + ')  separation 1-⟨H|L⟩²=' + (1 - cos(HI, LO) ** 2).toFixed(3));
const gauss = () => { let u = 0; while (u < 1e-9) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * rnd()); };
function basin(wLo, sigma, r0 = 0.02, N = 150) { let hiWins = 0; const D = HI.length; for (let k = 0; k < N; k++) { let x = HI.map(() => gauss()); let n = 0; for (const v of x) n += v * v; n = Math.sqrt(n) || 1; x = x.map((v) => v / n); for (let t = 0; t < 400; t++) { const pH = cos(x, HI) ** 2; const rEff = r0 * (1 + ALPHA * Math.pow(Math.max(0, 1 - pH), 4)); const pull = (t % 8 === 0) ? rEff : 0; for (let d = 0; d < D; d++) x[d] += pull * (HI[d] - x[d]) + wLo * (LO[d] - x[d]) + sigma * gauss(); let nn = 0; for (const v of x) nn += v * v; nn = Math.sqrt(nn) || 1; for (let d = 0; d < D; d++) x[d] /= nn; } if (cos(x, HI) ** 2 > cos(x, LO) ** 2) hiWins++; } return hiWins / N; }
console.log('  P(land in HIGH-Tc basin) vs competing LOW-Tc pull (weak r0=0.02, σ=0.02):');
let prev = null, tip = null;
for (const wLo of [0.005, 0.01, 0.02, 0.03, 0.05]) { const p = basin(wLo, 0.02); if (prev !== null && prev >= 0.5 && p < 0.5) tip = wLo; console.log('    wLo=' + String(wLo).padEnd(6) + ' P(high-Tc)=' + (p * 100).toFixed(0) + '%'); prev = p; }
console.log('    → leverage point (basin flips) near wLo≈' + (tip || '>0.05'));

// FEED THE STRUCTURAL DATA INTO THE VOID SUBSTRATE (compressed patterns)
if (!process.argv.includes('--no-harvest')) {
  const store = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8'));
  const index = store.index; let seq = SL.nextSequence(index); const now = new Date().toISOString(); let added = 0;
  const ser = (ys) => { const m = Math.max(...ys.map(Math.abs)) || 1; return ys.map((y) => (y / m).toFixed(5)).join(','); };
  for (let i = 0; i < raw.length; i++) { const key = 'mp-structural/' + raw[i].fam + '/' + (raw[i].form || i).replace(/[^A-Za-z0-9.]/g, '') + '_' + i; if (index[key]) continue;
    const entry = { composed_v2: Array.from(composedAtDepth(ser(X[i]), 8)), waveform: raw[i].vec, tc: raw[i].tc, family: raw[i].fam, source: '3dsc-mp' };
    SL.stamp(entry, { sequence: seq++, now, series: raw[i].vec, cadence: 'event' }); index[key] = entry; added++; }
  fs.writeFileSync(path.join(VOID, 'pattern_index_fractal.json'), JSON.stringify(store));
  console.log('\nFED INTO SUBSTRATE: compressed ' + added + ' MP structural superconductors into Void (namespace mp-structural/), time-stamped.');
}
