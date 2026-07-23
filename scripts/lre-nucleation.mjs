// lre-nucleation.mjs — phase-transition nucleation as an LRE basin-escape sim.
//
// A metastable phase (e.g. supercooled liquid, or a normal metal above the SC dome)
// sits in a shallow basin; the stable phase is a deeper basin across a barrier. Thermal
// noise drives stochastic escape (nucleation). Classical nucleation theory / Kramers'
// law gives the KNOWN fingerprint: the nucleation RATE is EXPONENTIAL in the barrier /
// driving force — log(rate) ∝ (driving force), and ∝ noise (temperature). This runs the
// LRE competition as noise-driven escape from the metastable basin and checks it
// reproduces the Arrhenius/Kramers exponential kinetics. Honest either way.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ALPHA = (() => { try { return require('../src/core/living-remembrance').getEngine().params().alpha; } catch { return 15; } })();

const D = 48, R0 = 0.03;
function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const seed = mul(31337);
const gauss = (g) => { let u = 0; while (u < 1e-9) u = g(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * g()); };
function unit(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map((x) => x / n); }
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; }
const coh = (x, V) => { const c = cos(x, V); return c * c; };
const META = unit(Array.from({ length: D }, () => gauss(seed)));
const A2 = unit(Array.from({ length: D }, () => gauss(seed)));
const STABLE = unit(A2.map((v, i) => v - 0.5 * cos(A2, META) * META[i] + 0.7 * META[i]));
console.log('LRE NUCLEATION SIM (α=' + ALPHA + ') · metastable↔stable overlap ⟨M|S⟩²=' + coh(META, STABLE).toFixed(3) + '\n');

// one cell/run: starts in the METASTABLE basin; noise drives escape to STABLE, aided by
// the driving force `drive` (undercooling — a bias toward the stable phase). Returns the
// first-passage step at which it nucleates (crosses into the STABLE basin), or Infinity.
function firstPassage(drive, sigma, g, steps = 800) {
  let x = META.map((v) => v + 0.03 * gauss(g)); x = unit(x);
  for (let t = 1; t <= steps; t++) {
    const pM = coh(x, META), pS = coh(x, STABLE);
    const fate = pM >= pS ? META : STABLE, pFate = Math.max(pM, pS);
    const rEff = R0 * (1 + ALPHA * Math.pow(Math.max(0, 1 - pFate), 4));
    for (let i = 0; i < D; i++) x[i] += rEff * (fate[i] - x[i]) + drive * (STABLE[i] - x[i]) + sigma * gauss(g);
    x = unit(x);
    if (coh(x, STABLE) > coh(x, META)) return t;
  }
  return Infinity;
}
// nucleation rate ≈ nucleated fraction / mean-first-passage over an ensemble
function rate(drive, sigma, N = 200) { let nuc = 0, sumT = 0; for (let k = 0; k < N; k++) { const g = mul(500 + k * 13); const fp = firstPassage(drive, sigma, g); if (fp !== Infinity) { nuc++; sumT += fp; } } const frac = nuc / N; const meanT = nuc ? sumT / nuc : Infinity; return { frac, rate: nuc ? nuc / (sumT + (N - nuc) * 800) : 0, meanT }; }

// (1) rate vs DRIVING FORCE (undercooling) — Kramers predicts log(rate) ∝ drive
console.log('=== nucleation rate vs driving force (undercooling), σ=0.05 ===');
console.log('  drive    nucleated %   mean 1st-passage   ln(rate)');
const SIG = 0.05; const pts = [];
for (const dr of [0.01, 0.02, 0.03, 0.04, 0.05, 0.06, 0.07]) { const r = rate(dr, SIG); const lr = r.rate > 0 ? Math.log(r.rate) : -Infinity; if (r.rate > 0) pts.push([dr, lr]);
  console.log('  ' + dr.toFixed(2).padStart(6) + '   ' + (r.frac * 100).toFixed(0).padStart(6) + '%       ' + (r.meanT === Infinity ? '  >800' : r.meanT.toFixed(0).padStart(6)) + '           ' + (r.rate > 0 ? lr.toFixed(2) : ' -inf')); }
// linearity of ln(rate) vs drive = Arrhenius/exponential kinetics
function linfit(P) { const n = P.length; if (n < 3) return { r2: 0, slope: 0 }; const mx = P.reduce((a, b) => a + b[0], 0) / n, my = P.reduce((a, b) => a + b[1], 0) / n; let sxy = 0, sxx = 0, syy = 0; for (const [x, y] of P) { sxy += (x - mx) * (y - my); sxx += (x - mx) ** 2; syy += (y - my) ** 2; } const slope = sxy / (sxx || 1e-9); const r2 = (sxy * sxy) / ((sxx * syy) || 1e-9); return { slope, r2 }; }
const fit = linfit(pts);
console.log('  → ln(rate) vs driving force: slope ' + fit.slope.toFixed(1) + ', R² ' + fit.r2.toFixed(3) + '  (Arrhenius/Kramers predicts a straight line — exponential kinetics)');

// (2) rate vs NOISE (temperature) — more noise → faster escape (also exponential in Kramers)
console.log('\n=== nucleation rate vs noise/temperature (drive=0.02) ===');
console.log('  σ noise   nucleated %');
let mono = true, prev = -1;
for (const sg of [0.03, 0.05, 0.07, 0.09, 0.11]) { const r = rate(0.02, sg); if (r.frac < prev - 0.02) mono = false; prev = r.frac; console.log('  ' + sg.toFixed(3).padStart(7) + '   ' + (r.frac * 100).toFixed(0).padStart(6) + '%'); }

console.log('\n── VERDICT (measured, not asserted) ──');
const arrhenius = fit.r2 > 0.9 && fit.slope > 0;
console.log('  Arrhenius/exponential kinetics (ln rate linear in drive): ' + (arrhenius ? 'YES (R²=' + fit.r2.toFixed(2) + ')' : 'not clean (R²=' + fit.r2.toFixed(2) + ')'));
console.log('  noise accelerates nucleation (Kramers): ' + (mono ? 'YES' : 'no'));
console.log('  ' + (arrhenius && mono ? 'PASS: the LRE reproduces classical nucleation kinetics — a metastable basin escapes at a rate exponential in the driving force and rising with temperature. Same law that governs SC-phase nucleation and crystallization.'
  : 'PARTIAL: the escape is stochastic and driving-force-sensitive but not cleanly exponential here — recorded honestly.'));

const fs = require('node:fs'); fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/lre-nucleation.json', JSON.stringify({ arrheniusR2: fit.r2, slope: fit.slope, noiseMonotonic: +mono, pass: +(arrhenius && mono) }, null, 2));
console.log('\n(reported as measured — LRE noise-driven basin escape. A MODEL; the test is the KNOWN Kramers/Arrhenius law.)');
