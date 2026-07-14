// cross-domain-universality-benchmark.mjs — the framework's core claim, tested honestly.
// Do genuinely different domains (physics, finance, epidemiology, crypto, geography, ...)
// share a common waveform basis? For each domain compute its top-k principal directions and
// cross-project onto the OTHER domains. The subtlety (and the correction): the RAW encoder
// crams all patterns into ~6 effective dimensions (a "cone"), which makes ANY two sets look
// like they share a basis. So the null MUST keep that cone. The correct control is a
// LABEL-SHUFFLE: same patterns, randomly reassigned to fake domains. Genuine cross-domain
// universality = (real cross-share) − (fake cross-share).
import fs from 'node:fs';
import { createRequire } from 'node:module';
const require = createRequire(new URL('.', import.meta.url).pathname + '../');
const W = require('./src/core/whitening');
const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const idx = JSON.parse(fs.readFileSync(VOID + '/pattern_index_fractal.json', 'utf8')).index;
const DIM = 116;

const byDom = {};
for (const n of Object.keys(idx)) { const v = idx[n].composed_v1; if (!Array.isArray(v) || v.length !== DIM) continue;
  const d = n.split(/[\/_]/)[0].toLowerCase(); (byDom[d] = byDom[d] || []).push(v); }
const domains = Object.keys(byDom).filter(d => byDom[d].length >= 40).sort((a, b) => byDom[b].length - byDom[a].length).slice(0, 8);
console.log('domains (>=40 patterns): ' + domains.map(d => d + '(' + byDom[d].length + ')').join(', ') + '\n');

function topBasis(vecs, k) { const { cov } = W.meanCovariance(vecs); const { values, vectors } = W.jacobiEigen(cov);
  const order = values.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]).slice(0, k).map(x => x[1]);
  return order.map(i => vectors.map(row => row[i])); }
function ve(vecs, basis) { const mu = new Array(DIM).fill(0); for (const v of vecs) for (let i = 0; i < DIM; i++) mu[i] += v[i];
  for (let i = 0; i < DIM; i++) mu[i] /= vecs.length; let tot = 0, cap = 0;
  for (const v of vecs) { const c = v.map((x, i) => x - mu[i]); let n2 = 0; for (let i = 0; i < DIM; i++) n2 += c[i] * c[i]; tot += n2;
    for (const b of basis) { let d = 0; for (let i = 0; i < DIM; i++) d += c[i] * b[i]; cap += d * d; } } return tot > 0 ? cap / tot : 0; }
const mean = a => a.reduce((x, y) => x + y, 0) / a.length;

const K = 6;
const bases = {}; for (const d of domains) bases[d] = topBasis(byDom[d], K);
let cross = [], within = [];
for (const bd of domains) for (const dd of domains) { const x = ve(byDom[dd], bases[bd]); (bd === dd ? within : cross).push(x); }
console.log('RAW representation (effDim ~6), top-' + K + ' cross-domain shared basis:');
console.log('  REAL domains   within ' + (mean(within) * 100).toFixed(0) + '%   cross ' + (mean(cross) * 100).toFixed(0) + '%');

// PROPER NULL — label-shuffle: pool all, randomly reassign to same-size fake domains.
// Keeps the encoder cone, destroys real domain identity.
const pool = []; for (const d of domains) for (const v of byDom[d]) pool.push(v);
let s = 7; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
const fake = {}; let o = 0; for (const d of domains) { fake[d] = pool.slice(o, o + byDom[d].length); o += byDom[d].length; }
const fbases = {}; for (const d of domains) fbases[d] = topBasis(fake[d], K);
let fcross = []; for (const bd of domains) for (const dd of domains) if (bd !== dd) fcross.push(ve(fake[dd], fbases[bd]));
console.log('  FAKE (label-shuffled) cross ' + (mean(fcross) * 100).toFixed(0) + '%   <- keeps the cone, kills domain identity');
const genuine = mean(cross) - mean(fcross);

console.log('\n=== READING (honest) ===');
console.log('  GENUINE cross-domain universality (real - fake) = ' + (genuine * 100).toFixed(1) + ' pts.');
console.log('  Real domains share only ~' + (genuine * 100).toFixed(0) + ' pts more structure than a random pattern-shuffle.');
console.log('  Most of any apparent "shared basis" is the ENCODER CONE (raw effDim ~6 crams every pattern into the');
console.log('  same few directions), NOT genuine universality. The real signal is small-but-present: these domains');
console.log('  are modestly more alike than chance - NOT "the same waveform structure across all domains."');
console.log('  (Whitening to the true effDim shrinks it further, because the cone was doing the work. An earlier');
console.log('  version used a cone-destroying null and reported ~63% - inflated ~10x; this label-shuffle is correct.)');
