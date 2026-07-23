// l10-alignment-validation.mjs — falsifiable validation for L10 (alignment/correspondence),
// calibrated against Ajani's Structural Compressor v3.
//
// Three parts, L7/L8/L9 discipline:
//   1. CALIBRATE vs v3 — L10's law-conformance gain must track v3's HIGH/NOISE calls on v3's
//      own test patterns (fibonacci/kleiber/square = HIGH; noise/urban/diurnal = NOISE, the
//      last two being v3's own honest library gaps).
//   2. ALIGNMENT task — same-LAW / different-SCALE sequences must align (high L10 cosine)
//      where the shape stack (L1-L8) is fooled by scale. This is the win L9 could not get on
//      synthetic data: here shape GENUINELY cannot fake it (scale destroys surface similarity
//      but preserves the law). AUC(L10) must beat AUC(shape).
//   3. CROSS-DOMAIN transfer — a biological allometry (mass→metabolic 3/4) and a synthetic
//      economic series obeying the SAME 3/4 law, at totally different scale, must land together
//      under L10 where the shape stack scatters them. The transfer-null resolution in miniature.
// Plus neutrality: L10 gain ≈ 0 on prose/code/noise (self-gates off).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const ENC = require('../src/core/encoder-stack');
const { toAlignmentWaveform, alignmentGain } = require('../src/core/alignment-waveform');

function mul(a){let s=a>>>0;return()=>{s|=0;s=s+0x6D2B79F5|0;let t=Math.imul(s^s>>>15,1|s);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const rnd = mul(1010);
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
const enc8 = (t) => Array.from(ENC.composedAtDepth(t, 8));
const encL10 = (t) => Array.from(toAlignmentWaveform(t));
const J = (arr) => JSON.stringify({ v: arr });

console.log('L10 ALIGNMENT VALIDATION — cross-representation correspondence (encoder max depth ' + ENC.maxAvailableDepth() + ')\n');

// ── PART 1: calibrate against v3's own patterns ──
const v3 = {
  pure_noise: { cls: 'NOISE', pat: { values: [0.847, 0.231, 0.993, 0.102, 0.774, 0.445, 0.038, 0.912, 0.367, 0.621, 0.189, 0.754] } },
  fibonacci: { cls: 'HIGH', pat: { values: [1, 1, 2, 3, 5, 8, 13, 21, 34, 55, 89, 144, 233, 377, 610, 987] } },
  kleibers_law: { cls: 'HIGH', pat: { mass_kg: [0.02, 0.3, 3.0, 70.0, 500.0, 4000.0], metabolic_rate_W: [0.17, 1.45, 9.7, 81.0, 386.0, 1890.0] } },
  urban_scaling: { cls: 'NOISE', pat: { population: [10000, 50000, 200000, 1000000, 5000000], innovation: [12, 89, 490, 3200, 21000] } },
  square_law: { cls: 'HIGH', pat: { x: [1, 2, 3, 4, 5, 6, 7, 8], y: [1, 4, 9, 16, 25, 36, 49, 64] } },
};
console.log('=== PART 1: calibrate L10 gain against v3 HIGH/NOISE ===');
let calOK = 0, calN = 0;
for (const [name, { cls, pat }] of Object.entries(v3)) {
  const g = alignmentGain(JSON.stringify(pat));
  const l10cls = g >= 0.6 ? 'HIGH' : 'NOISE';
  const match = (cls === 'HIGH') === (g >= 0.6);
  calN++; if (match) calOK++;
  console.log('  ' + name.padEnd(18) + 'v3=' + cls.padEnd(6) + ' L10 gain=' + g.toFixed(3) + ' → ' + l10cls.padEnd(6) + (match ? '  ✓' : '  ✗ (mismatch)'));
}
console.log('  calibration agreement with v3: ' + calOK + '/' + calN);

// ── PART 2: same-law / different-scale alignment (shape cannot fake it) ──
const LAWS = [
  { name: 'p0.75', gen: (x, s, o) => s * Math.pow(x, 0.75) + o },
  { name: 'p2.0', gen: (x, s, o) => s * Math.pow(x, 2.0) + o },
  { name: 'lin', gen: (x, s, o) => s * x + o },
  { name: 'harm', gen: (x, s, o, T) => s * Math.sin(2 * Math.PI * x / T) + o },
];
const M = 24, NPT = 14;
const samples = [];
for (const law of LAWS) for (let i = 0; i < M; i++) {
  const s = 0.1 + 1000 * rnd(), o = law.name === 'p0.75' || law.name === 'p2.0' ? Math.abs(0.01 + 10 * rnd()) : (rnd() - 0.5) * 50, T = 6 + Math.floor(8 * rnd());
  const seq = []; for (let x = 1; x <= NPT; x++) seq.push(law.gen(x, s, o, T));
  samples.push({ law: law.name, text: J(seq) });
}
function pairAUC(encode) {
  const V = samples.map((s) => encode(s.text));
  const pos = [], neg = [];
  for (let i = 0; i < samples.length; i++) for (let j = i + 1; j < samples.length; j++) { const c = cos(V[i], V[j]); if (samples[i].law === samples[j].law) pos.push(c); else neg.push(c); }
  let win = 0, tot = 0; for (const p of pos) for (const n of neg) { tot++; if (p > n) win++; else if (p === n) win += 0.5; } return tot ? win / tot : 0.5;
}
const aucShape = pairAUC(enc8), aucL10 = pairAUC(encL10);
console.log('\n=== PART 2: same-law / different-scale alignment (AUC pairs share a law) ===');
console.log('  L1-L8 (shape)  AUC ' + aucShape.toFixed(3) + '   (fooled by scale — same law looks different)');
console.log('  L10 (law)      AUC ' + aucL10.toFixed(3) + '   (aligns by law regardless of scale)');

// ── PART 3: cross-domain same-law transfer ──
const bioAllo = JSON.stringify({ mass: [0.02, 0.3, 3, 70, 500, 4000], metabolic: [0.17, 1.45, 9.7, 81, 386, 1890] });          // 3/4
const econSame = JSON.stringify({ firms: [5, 40, 300, 2500, 18000, 120000], output: Array.from({ length: 6 }, (_, i) => 3.2 * Math.pow([5, 40, 300, 2500, 18000, 120000][i], 0.75)) }); // same 3/4, wild scale
const unrelated = JSON.stringify({ a: [3, 1, 4, 1, 5, 9], b: [2, 7, 1, 8, 2, 8] });                                            // noise
const cdBio = encL10(bioAllo), cdEcon = encL10(econSame), cdNoise = encL10(unrelated);
const cdBio8 = enc8(bioAllo), cdEcon8 = enc8(econSame);
const alignLaw = cos(cdBio, cdEcon), alignNoise = cos(cdBio, cdNoise), alignShape = cos(cdBio8, cdEcon8);
console.log('\n=== PART 3: cross-domain same-law transfer (bio 3/4  vs  econ 3/4  vs  noise) ===');
console.log('  L10  bio↔econ (same law, different domain+scale) ' + alignLaw.toFixed(3) + '   ·  bio↔noise ' + alignNoise.toFixed(3));
console.log('  shape bio↔econ ' + alignShape.toFixed(3) + '   (shape scatters same-law cross-domain by scale)');

// ── neutrality ──
const neutralInputs = ['function f(x){return x+1;}', 'The rain in Spain falls mainly on the plain.', JSON.stringify({ values: [0.847, 0.231, 0.993, 0.102, 0.774, 0.445] })];
const neutralGains = neutralInputs.map(alignmentGain);
console.log('\n=== neutrality (self-gating) — L10 gain on code / prose / noise ===');
console.log('  gains: [' + neutralGains.map((x) => x.toFixed(3)).join(', ') + ']   (must be ≈0)');
const neutral = neutralGains.every((x) => x < 0.3);

const earns = calOK >= calN - 1 && aucL10 > 0.85 && aucL10 > aucShape + 0.1 && alignLaw > 0.6 && alignLaw > alignNoise + 0.2 && neutral;
console.log('\n── VERDICT (measured, not asserted) ──');
console.log('  calibrates to v3:         ' + (calOK >= calN - 1 ? 'YES (' + calOK + '/' + calN + ')' : 'no (' + calOK + '/' + calN + ')'));
console.log('  aligns by law vs shape:   ' + (aucL10 > aucShape + 0.1 ? 'YES (L10 ' + aucL10.toFixed(2) + ' vs shape ' + aucShape.toFixed(2) + ')' : 'no (L10 ' + aucL10.toFixed(2) + ' vs shape ' + aucShape.toFixed(2) + ')'));
console.log('  cross-domain law transfer:' + (alignLaw > 0.6 && alignLaw > alignNoise + 0.2 ? ' YES (same-law ' + alignLaw.toFixed(2) + ' >> noise ' + alignNoise.toFixed(2) + ')' : ' weak (' + alignLaw.toFixed(2) + ' vs ' + alignNoise.toFixed(2) + ')'));
console.log('  neutral on non-law inputs:' + (neutral ? ' YES' : ' NO'));
console.log('  ' + (earns
  ? 'L10 EARNS ITS PLACE: it calibrates to v3, aligns same-law/different-scale inputs where the shape stack is fooled, transfers a shared law across domains, and self-gates off on lawless input. The cross-representation correspondence axis is real — the lens the transfer-null family asked for. Register done; activation pending the composed_v* migration + held-out purity re-check.'
  : 'L10 does NOT yet earn activation — recorded honestly (cal ' + calOK + '/' + calN + ', alignAUC ' + aucL10.toFixed(2) + ' vs shape ' + aucShape.toFixed(2) + ', transfer ' + alignLaw.toFixed(2) + ', neutral ' + neutral + ').'));

fs.mkdirSync('.remembrance', { recursive: true });
fs.writeFileSync('.remembrance/l10-alignment-validation.json', JSON.stringify({ calibration: calOK + '/' + calN, aucShape, aucL10, crossDomainLaw: alignLaw, crossDomainNoise: alignNoise, shapeCrossDomain: alignShape, neutral: +neutral, earns: +earns }, null, 2));
console.log('\n(reported as measured — v3 calibration + same-law/different-scale alignment + cross-domain transfer; self-gated L10; deterministic.)');
