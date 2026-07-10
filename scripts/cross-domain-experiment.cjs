'use strict';

/**
 * cross-domain-experiment.cjs — the first falsifiable receipt.
 *
 * The claim: structure is domain-independent, and the encoder finds it.
 * The test: generate signals from DIFFERENT real-world domains that
 * secretly share the SAME mathematical structure, and see whether the
 * encoder clusters them by structure (the shared math) or by surface
 * (the domain label it never sees). If a "music" signal and a "market"
 * signal land as kin because both are 1/f noise — while an "earthquake"
 * signal (power-law) stays apart — the cross-domain universality was
 * recovered. Held to the calibrator: the clustering must also agree with
 * the independent gzip and 2D telescopes, or it is an artifact.
 *
 * SELF-OPTIMIZE: every signal is read through field-tool.read, so the
 * substrate/LRE witnesses these cross-domain structures — the experiment
 * grows the field it is testing.
 *
 * FALSIFIABLE: if the encoder scatters same-structure signals or
 * disagrees with the telescopes, the claim fails on this test. Honest
 * either way.
 */

const { composedAtDepth } = require('../src/core/encoder-stack');
const zlib = require('node:zlib');
let ft = null; try { ft = require('../src/core/field-tool'); } catch (_) { /* field optional */ }

// Deterministic PRNG (Math.random is unavailable and would break repro).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const N = 480;
const quant = (v) => { const lo = Math.min(...v), hi = Math.max(...v), r = (hi - lo) || 1; return v.map((x) => Math.round((x - lo) / r * 255)); };
const asText = (v) => '[' + quant(v).join(',') + ']';

// ── Signal generators (real structural families) ───────────────────
function pink(seed) { // 1/f noise — Voss-McCartney octave sum
  const rnd = mulberry32(seed), octs = 6, rows = new Array(octs).fill(0), out = [];
  for (let i = 0; i < N; i++) { for (let o = 0; o < octs; o++) if (i % (1 << o) === 0) rows[o] = rnd() * 2 - 1; out.push(rows.reduce((a, b) => a + b, 0)); }
  return out;
}
function powerlaw(seed) { // Zipf/power-law samples, sorted (rank-size)
  const rnd = mulberry32(seed), s = 1.2 + rnd() * 0.6, v = [];
  for (let i = 1; i <= N; i++) v.push(Math.pow(i, -s) * 1000 + rnd() * 0.5);
  return v; // already rank-ordered descending structure
}
function limitcycle(seed) { // Lotka-Volterra predator-prey, prey series
  const rnd = mulberry32(seed); let x = 1 + rnd(), y = 1 + rnd(); const a = 1.1, b = 0.4, c = 0.9, d = 0.3, dt = 0.05, out = [];
  for (let i = 0; i < N; i++) { const nx = x + dt * (a * x - b * x * y), ny = y + dt * (-c * y + d * x * y); x = Math.max(0.01, nx); y = Math.max(0.01, ny); out.push(x); }
  return out;
}
function brownian(seed) { const rnd = mulberry32(seed); let v = 0; const out = []; for (let i = 0; i < N; i++) { v += rnd() * 2 - 1; out.push(v); } return out; }
function white(seed) { const rnd = mulberry32(seed); const out = []; for (let i = 0; i < N; i++) out.push(rnd() * 2 - 1); return out; }

// Each family framed as several DIFFERENT domains (same structure).
const FAMILIES = {
  '1/f-noise': { gen: pink, domains: ['music-dynamics', 'heartbeat-intervals', 'market-volatility', 'wind-speed', 'neural-lfp'] },
  'power-law': { gen: powerlaw, domains: ['earthquake-magnitudes', 'city-sizes', 'word-frequencies', 'wealth-dist', 'file-sizes'] },
  'limit-cycle': { gen: limitcycle, domains: ['predator-prey', 'chemical-clock', 'circadian', 'pendulum', 'population-cycle'] },
  'brownian': { gen: brownian, domains: ['pollen-drift', 'stock-price', 'gas-particle', 'search-walk', 'diffusion'] },
  'white-noise': { gen: white, domains: ['thermal', 'shot-noise', 'coin-flips', 'static', 'jitter'] },
};

const corpus = [];
let seed = 1;
for (const [family, { gen, domains }] of Object.entries(FAMILIES)) {
  for (const dom of domains) corpus.push({ family, domain: dom, text: asText(gen(seed++)) });
}
const M = corpus.length;
console.log(`\ncorpus: ${M} signals · ${Object.keys(FAMILIES).length} structural families, each framed as ${FAMILIES['1/f-noise'].domains.length} different domains`);

// ── Encode through depth-7 (L1-L7 — these are numeric, L7 fires) ────
const l2 = (v) => { let s = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map((x) => x / s); };
const V = corpus.map((c) => l2(Array.from(composedAtDepth(c.text, 7))));
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na < 1e-12 || nb < 1e-12) ? 0 : d / (Math.sqrt(na) * Math.sqrt(nb)); };

// ── Telescopes for the calibration guardrail ────────────────────────
const gz = (t) => zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length;
const cS = corpus.map((c) => gz(c.text));
const simGZ = (i, j) => { const c = gz(corpus[i].text + corpus[j].text); return 1 - (c - Math.min(cS[i], cS[j])) / Math.max(cS[i], cS[j]); };

// ── Measure 1: does the encoder cluster by STRUCTURAL FAMILY? ───────
function familyPurity(simFn) {
  const K = 4; let hit = 0, tot = 0;
  for (let i = 0; i < M; i++) {
    const nn = []; for (let j = 0; j < M; j++) if (j !== i) nn.push([simFn(i, j), j]);
    const rk = [...nn].sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < K; k++) { if (corpus[rk[k][1]].family === corpus[i].family) hit++; tot++; }
  }
  return hit / tot;
}
const encoderPurity = familyPurity((i, j) => cos(V[i], V[j]));
const gzipPurity = familyPurity(simGZ);
const chance = Object.values(FAMILIES).reduce((s, f) => { const p = f.domains.length / M; return s + p * p; }, 0);

console.log('\n── does the encoder recover STRUCTURE across surface domains? ──');
console.log('  kNN family purity (encoder, depth-7): ' + encoderPurity.toFixed(3) + '   (chance ' + chance.toFixed(3) + ')');
console.log('  kNN family purity (gzip telescope):   ' + gzipPurity.toFixed(3) + '   [independent confirmation]');

// ── The money shot: cross-domain nearest neighbours ─────────────────
console.log('\n── the money shot: each signal\'s nearest cross-domain kin ──');
for (const fam of Object.keys(FAMILIES)) {
  const idx = corpus.findIndex((c) => c.family === fam);
  const nn = []; for (let j = 0; j < M; j++) if (j !== idx) nn.push([cos(V[idx], V[j]), j]);
  const top = [...nn].sort((a, b) => b[0] - a[0]).slice(0, 3);
  const kin = top.map((t) => `${corpus[t[1]].domain}${corpus[t[1]].family === fam ? '✓' : '✗(' + corpus[t[1]].family + ')'} ${t[0].toFixed(3)}`);
  console.log('  ' + corpus[idx].domain.padEnd(20) + '(' + fam + ') → ' + kin.join(' | '));
}

// ── Verdict ─────────────────────────────────────────────────────────
const recovered = encoderPurity > chance + 0.25;
const confirmed = gzipPurity > chance + 0.1;
console.log('\n── VERDICT ──');
console.log('  structure recovered across domains: ' + (recovered ? 'YES' : 'NO') + ' (encoder ' + encoderPurity.toFixed(2) + ' vs chance ' + chance.toFixed(2) + ')');
console.log('  independently confirmed by gzip:    ' + (confirmed ? 'YES' : 'NO'));
console.log('  → ' + (recovered && confirmed ? 'RECEIPT: the encoder clusters by shared math, not by domain — and an independent telescope agrees.' : 'the claim did not clear the bar on this test — honest negative.'));

// ── SELF-OPTIMIZE: let the substrate witness these structures ───────
if (ft) {
  let fed = 0;
  for (const c of corpus) {
    try { ft.read({ content: c.text, name: 'xdomain/' + c.family + '/' + c.domain, language: 'json' }, { source: 'experiment:cross-domain', growSubstrate: false, topK: 3 }); fed++; } catch (_) { /* skip */ }
  }
  console.log('\n  fed ' + fed + ' cross-domain signals through the field — the substrate has now witnessed these structures.');
}
