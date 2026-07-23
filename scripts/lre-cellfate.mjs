// lre-cellfate.mjs — cell-fate reprogramming as an LRE attractor-competition sim.
//
// A cell type is an attractor in expression space (Waddington landscape). Reprogramming
// = tip a cell from a SOURCE fate to a TARGET fate with a minimal intervention (the
// transcription factors), against the cell's own fate-maintaining coherence and
// biological noise. This runs the LRE competition — source-fate self-maintenance via
// r_eff = r0(1+α(1-coh)⁴), a reprogramming push toward the target, and noise — over an
// ensemble of cells, and checks it reproduces the KNOWN fingerprints of real
// reprogramming (Yamanaka-class): bistability, a tipping threshold, stochastic low
// efficiency near threshold, a dose-response, and hysteresis (memory).
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ALPHA = (() => { try { return require('../src/core/living-remembrance').getEngine().params().alpha; } catch { return 15; } })();

const D = 64, R0 = 0.03;
function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(20260726);
const gauss = () => { let u = 0; while (u < 1e-9) u = rnd(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * rnd()); };
function unit(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map((x) => x / n); }
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; }
const coh = (x, V) => { const c = cos(x, V); return c * c; };

// two cell-fate attractors — distinct expression states (source = e.g. fibroblast, target = iPSC)
const SOURCE = unit(Array.from({ length: D }, gauss));
const ALT = unit(Array.from({ length: D }, gauss));
// mildly decorrelate so they are two distinct fates (a real landscape, not orthogonal noise)
const TARGET = unit(ALT.map((v, i) => v - 0.35 * cos(ALT, SOURCE) * SOURCE[i]));
console.log('LRE CELL-FATE REPROGRAMMING SIM (α=' + ALPHA + ') · source↔target fate overlap ⟨S|T⟩²=' + coh(SOURCE, TARGET).toFixed(3) + '\n');

// one cell: starts in SOURCE fate, gets reprogramming push toward TARGET + noise.
// returns true if it lands in the TARGET basin. relax=true drops the push for the last
// half (to test whether the new fate is stable once factors are withdrawn = hysteresis).
function runCell(force, sigma, seedGauss, steps = 500, relax = false) {
  let x = SOURCE.map((v) => v + 0.05 * seedGauss());        // a cell near the source fate
  x = unit(x);
  for (let t = 0; t < steps; t++) {
    // BISTABLE landscape: the cell maintains coherence to whichever fate it is IN —
    // both fates are self-stabilizing attractors, so once it crosses the saddle the
    // new fate holds it (that is what makes reprogramming a real, memory-carrying tip).
    const pS = coh(x, SOURCE), pT = coh(x, TARGET);
    const fate = pS >= pT ? SOURCE : TARGET, pFate = Math.max(pS, pT);
    const rEff = R0 * (1 + ALPHA * Math.pow(Math.max(0, 1 - pFate), 4));  // self-maintenance of the current fate
    const push = (relax && t > steps / 2) ? 0 : force;                    // withdraw factors mid-run if relax
    for (let i = 0; i < D; i++) x[i] += rEff * (fate[i] - x[i]) + push * (TARGET[i] - x[i]) + sigma * seedGauss();
    x = unit(x);
  }
  return coh(x, TARGET) > coh(x, SOURCE);
}
function efficiency(force, sigma, N = 300, relax = false) { let r = 0; for (let k = 0; k < N; k++) { const g = mul(1000 + k * 17); const gg = () => { let u = 0; while (u < 1e-9) u = g(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * g()); }; if (runCell(force, sigma, gg, 500, relax)) r++; } return r / N; }

// (1) DOSE-RESPONSE: reprogramming efficiency vs factor dose (force), at biological noise
console.log('=== reprogramming efficiency vs factor dose (σ=0.03 biological noise, 300 cells) ===');
console.log('  factor dose   reprogrammed %   regime');
const SIGMA = 0.045;
let threshold = null, prev = 0;
for (const f of [0.0, 0.03, 0.045, 0.05, 0.055, 0.06, 0.07, 0.09]) {
  const e = efficiency(f, SIGMA);
  const regime = e < 0.05 ? 'source fate stable (no reprogramming)' : e < 0.5 ? 'STOCHASTIC partial (low-efficiency, like real Yamanaka)' : e < 0.95 ? 'majority reprogram' : 'near-complete';
  if (threshold === null && prev < 0.5 && e >= 0.5) threshold = f;
  console.log('  ' + f.toFixed(3).padStart(9) + '     ' + (e * 100).toFixed(0).padStart(6) + '%        ' + regime);
  prev = e;
}
console.log('  → tipping threshold (leverage point) near dose ≈ ' + (threshold ?? '>0.09') + '  (minimum intervention to reprogram the majority)');

// (2) HYSTERESIS: reprogram at high dose, then WITHDRAW factors — does the new fate hold?
const held = efficiency(0.13, SIGMA, 300, true);
console.log('\n=== hysteresis (withdraw factors after reprogramming) ===');
console.log('  reprogrammed at dose 0.13, factors removed halfway: ' + (held * 100).toFixed(0) + '% stay in TARGET fate');
console.log('  → ' + (held > 0.5 ? 'the new fate is STABLE without ongoing factors (memory) — like a truly reprogrammed cell.' : 'reverts without factors — unstable reprogramming.'));

// (3) known-fingerprint check
console.log('\n── does it reproduce real reprogramming phenomenology? ──');
const e0 = efficiency(0.0, SIGMA), eMid = efficiency(0.05, SIGMA), eHi = efficiency(0.09, SIGMA);
const bistable = e0 < 0.05, doseResp = eHi > eMid && eMid > e0, stochastic = eMid > 0.02 && eMid < 0.6, hyst = held > 0.5;
console.log('  bistable (source stable at dose 0):        ' + (bistable ? 'YES' : 'no') + '  (' + (e0 * 100).toFixed(0) + '%)');
console.log('  dose-response (efficiency rises w/ dose):   ' + (doseResp ? 'YES' : 'no'));
console.log('  stochastic low-efficiency near threshold:  ' + (stochastic ? 'YES' : 'no') + '  (mid-dose ' + (eMid * 100).toFixed(0) + '%)');
console.log('  hysteresis / memory (fate holds):          ' + (hyst ? 'YES' : 'no'));
console.log('\n(reported as measured — the LRE competition on a two-fate landscape. It is a MODEL, not scRNA-seq;');
console.log(' the test is whether it reproduces the KNOWN qualitative fingerprints of real cell reprogramming.)');

const fsx = require('node:fs');
fsx.mkdirSync('.remembrance', { recursive: true });
fsx.writeFileSync('.remembrance/lre-cellfate.json', JSON.stringify({ leverageDose: threshold, e0, eMid, eHi, held, bistable: +bistable, doseResponse: +doseResp, stochastic: +stochastic, hysteresis: +hyst }, null, 2));
