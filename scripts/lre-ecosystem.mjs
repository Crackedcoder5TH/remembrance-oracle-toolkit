// lre-ecosystem.mjs — ecosystem regime shift as an LRE attractor-competition sim.
//
// A bistable ecosystem (healthy vs collapsed — e.g. clear vs turbid lake, vegetated vs
// desert) under a slowly rising stress driver. The established early-warning-signal
// science (Scheffer et al.) gives crisp KNOWN fingerprints as a system nears a tipping
// point: CRITICAL SLOWING DOWN (recovery from perturbation slows), RISING VARIANCE, and
// RISING LAG-1 AUTOCORRELATION — plus HYSTERESIS (restoring the driver does not restore
// the state). This runs the LRE competition with a stress ramp that flattens the healthy
// basin, and checks it reproduces those fingerprints. Honest either way.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ALPHA = (() => { try { return require('../src/core/living-remembrance').getEngine().params().alpha; } catch { return 15; } })();

const D = 48, R0 = 0.04;
function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(424242);
const gauss = (g) => { let u = 0; while (u < 1e-9) u = g(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(6.2831853 * g()); };
function unit(v) { let n = 0; for (const x of v) n += x * x; n = Math.sqrt(n) || 1; return v.map((x) => x / n); }
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; }
const coh = (x, V) => { const c = cos(x, V); return c * c; };
const gg = () => gauss(rnd);
const HEALTHY = unit(Array.from({ length: D }, gg)); const A2 = unit(Array.from({ length: D }, gg));
const COLLAPSED = unit(A2.map((v, i) => v - 0.4 * cos(A2, HEALTHY) * HEALTHY[i]));
console.log('LRE ECOSYSTEM REGIME-SHIFT SIM (α=' + ALPHA + ') · healthy↔collapsed overlap ⟨H|C⟩²=' + coh(HEALTHY, COLLAPSED).toFixed(3) + '\n');

// one step: the healthy basin depth FADES with stress s (degradation); noise σ.
function step(x, s, sigma, g) { const pH = coh(x, HEALTHY), pC = coh(x, COLLAPSED);
  const inHealthy = pH >= pC; const fate = inHealthy ? HEALTHY : COLLAPSED, pFate = Math.max(pH, pC);
  const depth = inHealthy ? Math.max(0, 1 - s) : 1;                 // healthy basin flattens as stress rises
  const rEff = depth * R0 * (1 + ALPHA * Math.pow(Math.max(0, 1 - pFate), 4));
  const nx = x.slice(); for (let i = 0; i < D; i++) nx[i] += rEff * (fate[i] - x[i]) + sigma * gauss(g); return unit(nx);
}
// hold stress fixed, collect a window of the state's health, measure the early-warning stats
function windowStats(s, sigma, x0, steps = 400) {
  let x = x0.slice(); const h = [];
  for (let t = 0; t < steps; t++) { x = step(x, s, sigma, rnd); h.push(coh(x, HEALTHY)); }
  const m = h.reduce((a, b) => a + b, 0) / h.length;
  const variance = h.reduce((a, b) => a + (b - m) ** 2, 0) / h.length;
  let n = 0, d = 0; for (let i = 1; i < h.length; i++) { n += (h[i] - m) * (h[i - 1] - m); } for (const v of h) d += (v - m) ** 2;
  const ar1 = d > 1e-12 ? n / d : 0;
  return { x, meanHealth: m, variance, ar1 };
}
// critical slowing down: displace the state toward COLLAPSE, then count noiseless steps
// to return to the healthy basin. As the healthy basin flattens near the tip, recovery
// SLOWS — the flagship early-warning signal.
function recoveryTime(s) { let x = unit(HEALTHY.map((v, i) => 0.7 * v + 0.3 * COLLAPSED[i]));   // real displacement toward collapse
  for (let t = 1; t <= 600; t++) { x = step(x, s, 0, rnd); if (coh(x, HEALTHY) >= 0.95) return t; }   // recovered to near-healthy
  return 600; }

console.log('=== early-warning signals as stress rises toward the tip (σ=0.02) ===');
console.log('  stress   mean health   variance      lag-1 autocorr   recovery time');
let x = HEALTHY.slice(); let tip = null, prevVar = 0, prevAR = 0;
const SIG = 0.02;
for (const s of [0.0, 0.3, 0.5, 0.7, 0.85, 0.95]) {
  const w = windowStats(s, SIG, x); x = w.x;
  const rt = recoveryTime(s);
  if (tip === null && w.meanHealth < 0.5) tip = s;
  console.log('  ' + s.toFixed(2).padStart(6) + '   ' + w.meanHealth.toFixed(3).padStart(9) + '   ' + w.variance.toExponential(2).padStart(11) + '   ' + w.ar1.toFixed(3).padStart(11) + '   ' + String(rt).padStart(10) + (s > 0 && w.variance > prevVar ? '  ↑var' : '') + (w.ar1 > prevAR ? ' ↑AR1' : ''));
  prevVar = w.variance; prevAR = w.ar1;
}
console.log('  → regime shift (health collapses) near stress ≈ ' + (tip ?? '>0.95'));

// HYSTERESIS: after collapse, wind stress back DOWN — does health return at the same stress?
console.log('\n=== hysteresis (wind stress back down after collapse) ===');
let xc = x.slice(); let restored = null;
for (const s of [0.9, 0.7, 0.5, 0.3, 0.1, 0.0]) { const w = windowStats(s, SIG, xc); xc = w.x; if (restored === null && w.meanHealth > 0.5) restored = s; }
console.log('  collapsed state recovers only when stress drops to ≈ ' + (restored ?? '≤0.0') + '  (vs collapse at ' + (tip ?? '?') + ')');
console.log('  → ' + (restored === null || (tip !== null && restored < tip - 0.15) ? 'HYSTERESIS: recovery needs far lower stress than collapse — the classic irreversibility of a regime shift.' : 'little hysteresis — reversible.'));

console.log('\n(reported as measured — LRE competition on a bistable ecosystem with a stress ramp. A landscape MODEL;');
console.log(' the test is whether it reproduces the KNOWN early-warning fingerprints: slowing down, ↑variance, ↑AR1, hysteresis.)');

const fs = require('node:fs'); fs.mkdirSync('.remembrance', { recursive: true });
const v0 = windowStats(0.0, SIG, HEALTHY), v1 = windowStats(0.85, SIG, HEALTHY.slice());
fs.writeFileSync('.remembrance/lre-ecosystem.json', JSON.stringify({ tip, restored, varRises: +(v1.variance > v0.variance), ar1Rises: +(v1.ar1 > v0.ar1), hysteresis: +(restored === null || (tip && restored < tip - 0.15)) }, null, 2));
