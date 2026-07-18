// lre-simulator-probe.mjs — run the LRE AUTONOMOUSLY, seeded only by its own
// Information number, and look at what it generates. The live field is never
// touched: this replicates the LRE's exact update equation in a sandbox, seeded
// from the real coherenceIntegral.
//
// Two readings, as they present:
//  A) FAITHFUL — the LRE's real update (drive weight w∈[0,1], a pure relaxation).
//  B) OPEN-GAIN — the same update with the drive gain g swept, to see whether the
//     field's own nonlinearity r_eff=r0(1+α(1-C)⁴) spans a dynamical repertoire
//     (fixed point → period-doubling → chaos) as the gain — set by the Information
//     number — rises. The Information number is the SEED that parameterizes the
//     generator (like a logistic r), not a store of the trajectory.
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { getEngine } = require('../src/core/living-remembrance');
const fc = require('../src/core/field-coupling');

const p = getEngine().params();
const R0 = p.r0, ALPHA = p.alpha, DELTA0 = p.delta0, EPS = p.epsilon;
const live = fc.peekField() || { coherence: 0.65, coherenceIntegral: 0 };
const INFO = live.coherenceIntegral || 0;
console.log(`LRE params r0=${R0} α=${ALPHA} δ0=${DELTA0} · live Information number ∫=${INFO.toFixed(1)} (coherence ${live.coherence.toFixed(3)})\n`);

// the field's own drive at coherence C (the exact terms from contribute())
const drive = (C) => (R0 * (1 + ALPHA * Math.pow(Math.max(0, 1 - C), 4))) * 0.1 + (DELTA0 * Math.max(0, 1 - C)) * 0.15;
// one autonomous step: p = C (self-reference), gain g on the relaxation, clamp per contract
const step = (C, g) => Math.max(0, Math.min(0.999, C + g * drive(C)));

// permutation entropy (order 3) to score a trajectory's disorder
function permEnt(x, m = 3) { const f = [1, 1, 2, 6][m], cnt = new Map(); let t = 0; for (let i = 0; i + m <= x.length; i++) { const k = [...Array(m).keys()].sort((a, b) => x[i + a] - x[i + b]).join(''); cnt.set(k, (cnt.get(k) || 0) + 1); t++; } if (!t) return 0; let h = 0; for (const v of cnt.values()) { const pr = v / t; h -= pr * Math.log(pr); } return h / Math.log(f); }
// count distinct attractor values (period) after transient
function attractor(C0, g, iters = 2000, tail = 400) { let C = C0; const orbit = []; for (let i = 0; i < iters; i++) { C = step(C, g); if (i >= iters - tail) orbit.push(C); } const uniq = new Set(orbit.map((v) => v.toFixed(4))); return { orbit, period: uniq.size, pe: permEnt(orbit) }; }

// A) FAITHFUL — w is resonance ∈ [0,1]; a couple of representative weights
console.log('=== A) FAITHFUL autonomous LRE (drive weight w∈[0,1]) — what does its own update do? ===');
for (const w of [0.2, 0.5, 1.0]) { const a = attractor(live.coherence, w); console.log(`  w=${w.toFixed(1)}  →  settles to ${a.orbit[a.orbit.length - 1].toFixed(4)}  · distinct tail states ${a.period}  · permEntropy ${a.pe.toFixed(3)}`); }

// B) OPEN-GAIN sweep — does the field's nonlinearity give a route to chaos?
console.log('\n=== B) OPEN-GAIN: sweep the drive gain g (the Information number sets where the field sits) ===');
console.log('  g        attractor period    permEntropy   regime');
let firstChaos = null;
for (const g of [1, 2, 3, 5, 8, 12, 18, 26, 40]) {
  const a = attractor(0.05, g);
  const regime = a.period <= 1 ? 'fixed point' : a.period <= 8 ? `period-${a.period}` : a.pe > 0.8 ? 'CHAOS' : 'high-period';
  if (regime === 'CHAOS' && firstChaos === null) firstChaos = g;
  console.log('  ' + String(g).padEnd(9) + String(a.period).padEnd(19) + a.pe.toFixed(3).padEnd(14) + regime);
}

// where does the LIVE Information number put the field on the gain axis?
// map ∫ (unbounded, ~5e4) onto the swept gain band by log-compression
const gLive = 1 + 12 * Math.log10(1 + INFO) / Math.log10(1 + 1e5);
const aLive = attractor(0.05, gLive);
console.log('\n=== where the LIVE field sits (Information number → gain) ===');
console.log(`  ∫=${INFO.toFixed(0)} → g≈${gLive.toFixed(2)}  · attractor period ${aLive.period} · permEntropy ${aLive.pe.toFixed(3)} → ${aLive.pe > 0.8 ? 'chaotic regime' : aLive.period <= 1 ? 'fixed point' : 'periodic'}`);

console.log('\n(reported as measured. The Information number is the SEED that parameterizes the LRE generator, not a store of');
console.log(' the trajectory — one number selects a reproducible dynamical regime, the way a logistic r does. Whether that');
console.log(' regime spans fixed→periodic→chaos is what the sweep shows.)');
