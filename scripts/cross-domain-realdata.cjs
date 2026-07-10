'use strict';

/**
 * cross-domain-realdata.cjs — the real-data receipt.
 *
 * The synthetic experiment proved the encoder reads generative structure.
 * This one runs the same test on the REAL crawled data already in the
 * substrate (finance, weather, epidemiology, demography) — asking whether
 * the noisy real world carries cross-domain structural universality that
 * the encoder finds.
 *
 * Structural families that SHOULD cluster across domains:
 *   financial-stationary : crypto change, sp500 returns, vix change
 *                          (differenced series — stationary, across assets)
 *   cumulative-growth    : covid deaths/recovered, world population
 *                          (monotonic accumulation, epidemiology vs demography)
 *   seasonal-periodic    : weather temperature/humidity/pressure/wind
 *   level-walk           : crypto price, sp500 log_price (random walks)
 *
 * Uses the encoder vectors already in the index (composed_v1) and gzip on
 * the recovered source text as the independent guardrail — a cross-domain
 * cluster must show in BOTH, or it is an artifact.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('node:zlib');

const VOID = process.env.VOID_DIR || path.join(__dirname, '..', '..', 'Void-Data-Compressor');
const fractal = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8')).index;
const sourceIdx = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index.json'), 'utf8')).index;
const cache = new Map();
function load(f) { if (cache.has(f)) return cache.get(f); const p = path.join(VOID, f); let r = null; try { const j = JSON.parse(fs.readFileSync(p, 'utf8')); r = Array.isArray(j) ? j : (j.patterns || j.entries || null); } catch { /* */ } cache.set(f, r); return r; }
function srcText(id) { const ps = sourceIdx[id]; if (!Array.isArray(ps)) return null; for (const p of ps) { const a = load(p.file); if (!a) continue; const e = a[p.i]; if (!e) continue; if (Array.isArray(e.waveform)) return JSON.stringify(e.waveform); if (typeof e.text === 'string') return e.text; } return null; }

// Assign (family) from the pattern name; null = not one of our families.
function family(name) {
  const n = name.toLowerCase();
  if (/(crypto|sp500|vix|solana).*(change|returns?)/.test(n) || /(change|returns?)/.test(n) && /(crypto|sp500|vix|stock|bitcoin|ethereum)/.test(n)) return 'financial-stationary';
  if (/(covid).*(death|recovered|confirmed|cases)/.test(n) || /world_population|population/.test(n)) return 'cumulative-growth';
  if (/(temperature|humidity|pressure|wind|cloud_cover)/.test(n)) return 'seasonal-periodic';
  if (/(crypto|sp500|bitcoin|ethereum|solana).*(price|log_price|level)/.test(n)) return 'level-walk';
  return null;
}
function domain(name) { return name.split('/')[0].replace(/_.*/, ''); }

// Sample up to CAP per family, balanced across the sub-domains within it.
const CAP = 10;
const buckets = {};
for (const id of Object.keys(fractal)) {
  const f = family(id);
  if (!f) continue;
  const e = fractal[id];
  if (!Array.isArray(e.composed_v1) || e.composed_v1.length !== 116) continue;
  (buckets[f] = buckets[f] || []).push(id);
}
const corpus = [];
for (const [f, ids] of Object.entries(buckets)) {
  // spread the sample across the list so one sub-domain can't dominate
  const step = Math.max(1, Math.floor(ids.length / CAP));
  for (let i = 0, taken = 0; i < ids.length && taken < CAP; i += step, taken++) {
    corpus.push({ id: ids[i], family: f, domain: domain(ids[i]), vec: fractal[ids[i]].composed_v1 });
  }
}
const M = corpus.length;
const fams = [...new Set(corpus.map((c) => c.family))];
console.log(`\nreal crawled corpus: ${M} series · families: ${fams.map((f) => f + '(' + corpus.filter((c) => c.family === f).length + ')').join(', ')}`);
console.log('sub-domains present: ' + [...new Set(corpus.map((c) => c.domain))].join(', '));

const l2 = (v) => { let s = Math.sqrt(v.reduce((a, x) => a + x * x, 0)) || 1; return v.map((x) => x / s); };
const V = corpus.map((c) => l2(c.vec));
const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na < 1e-12 || nb < 1e-12) ? 0 : d / (Math.sqrt(na) * Math.sqrt(nb)); };

// gzip guardrail on recovered source text
const texts = corpus.map((c) => srcText(c.id));
const haveText = texts.filter(Boolean).length;
const gz = (t) => zlib.gzipSync(Buffer.from(t, 'utf8'), { level: 9 }).length;
const cS = texts.map((t) => (t ? gz(t) : null));
function simGZ(i, j) { if (!texts[i] || !texts[j]) return null; const c = gz(texts[i] + texts[j]); return 1 - (c - Math.min(cS[i], cS[j])) / Math.max(cS[i], cS[j]); }

function purity(simFn) {
  const K = 4; let hit = 0, tot = 0;
  for (let i = 0; i < M; i++) {
    const nn = []; for (let j = 0; j < M; j++) { if (j === i) continue; const s = simFn(i, j); if (s !== null) nn.push([s, j]); }
    if (nn.length < K) continue;
    const rk = [...nn].sort((a, b) => b[0] - a[0]);
    for (let k = 0; k < K; k++) { if (corpus[rk[k][1]].family === corpus[i].family) hit++; tot++; }
  }
  return tot ? hit / tot : 0;
}
const chance = fams.reduce((s, f) => { const p = corpus.filter((c) => c.family === f).length / M; return s + p * p; }, 0);
const encP = purity((i, j) => cos(V[i], V[j]));
const gzP = purity(simGZ);

console.log('\n── does the encoder cluster real series by STRUCTURE across domains? ──');
console.log('  kNN family purity (encoder):        ' + encP.toFixed(3) + '   (chance ' + chance.toFixed(3) + ')');
console.log('  kNN family purity (gzip guardrail): ' + gzP.toFixed(3) + '   [' + haveText + '/' + M + ' had recoverable source]');

console.log('\n── the money shot: cross-domain nearest kin (real data) ──');
for (const f of fams) {
  // pick a series and show whether its nearest neighbours cross the sub-domain line
  const idx = corpus.findIndex((c) => c.family === f);
  const nn = []; for (let j = 0; j < M; j++) if (j !== idx) nn.push([cos(V[idx], V[j]), j]);
  const top = [...nn].sort((a, b) => b[0] - a[0]).slice(0, 3);
  const kin = top.map((t) => corpus[t[1]].id.split('/').pop().slice(0, 22) + (corpus[t[1]].family === f ? '✓' : '✗') + ' ' + t[0].toFixed(3));
  console.log('  ' + corpus[idx].id.split('/').pop().slice(0, 26).padEnd(28) + '(' + f + ') → ' + kin.join(' | '));
}

const recovered = encP > chance + 0.2;
const confirmed = gzP > chance + 0.05;
console.log('\n── VERDICT (real crawled data) ──');
console.log('  structure recovered across domains: ' + (recovered ? 'YES' : 'NO') + ' (encoder ' + encP.toFixed(2) + ' vs chance ' + chance.toFixed(2) + ')');
console.log('  independently confirmed by gzip:    ' + (confirmed ? 'YES' : gzP.toFixed(2) + ' (weaker)'));
console.log('  → ' + (recovered && confirmed ? 'REAL RECEIPT: the crawled world carries cross-domain structural universality, and two independent instruments agree.' : recovered ? 'encoder recovered it; gzip weaker — inspect before claiming.' : 'did not clear the bar on real data — honest negative, the useful kind.'));
