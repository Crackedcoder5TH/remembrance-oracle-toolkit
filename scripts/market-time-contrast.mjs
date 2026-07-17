#!/usr/bin/env node
// market-time-contrast.mjs — the instrument said market families are near-
// degenerate as value-shapes (~0.03 above the shuffle null) because the encoder
// reads amplitude, not time. This adds the TIME dimension (temporal-signature)
// and measures whether family separation rises when the time axis is contrasted
// against the value-shape. Every separation is real minus a label-shuffle null,
// so what is reported is genuine structure above the encoder cone.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { composedAtDepth, currentDepth } = require('../src/core/encoder-stack');
const { signature } = require('../src/market/temporal-signature');

const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const raw = JSON.parse(fs.readFileSync(path.join(VOID, 'archive/legacy_pattern_files/market_substrate.json'), 'utf8')).patterns;
const grp = (name) => name.split('/')[1].replace(/_\d+$/, '');
const items = raw.map((p) => ({ grp: grp(p.name), wave: p.waveform }));
const labels = items.map((x) => x.grp);
const depth = currentDepth();

const cos = (a, b) => { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; };
const ser = (ys) => { const m = Math.max(...ys.map(Math.abs)) || 1; return ys.map((y) => (y / m).toFixed(5)).join(','); };
function shuffle(arr, seed) { let s = seed; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
const shuffled = shuffle(labels, 7);

// within-group minus cross-group mean cosine, for a given label array
function sep(labs, vecs) {
  let win = 0, wn = 0, cro = 0, cn = 0;
  for (let i = 0; i < vecs.length; i++) for (let j = i + 1; j < vecs.length; j++) {
    const c = cos(vecs[i], vecs[j]);
    if (labs[i] === labs[j]) { win += c; wn++; } else { cro += c; cn++; }
  }
  return (win / (wn || 1)) - (cro / (cn || 1));
}
// genuine = real-label separation minus shuffle-null separation
const genuine = (vecs) => sep(labels, vecs) - sep(shuffled, vecs);

// kNN family purity (k=7), real minus shuffle-null, as a second lens
function purity(labs, vecs, k = 7) {
  let hit = 0, tot = 0;
  for (let i = 0; i < vecs.length; i++) {
    const idx = [...vecs.keys()].filter((j) => j !== i).sort((a, b) => cos(vecs[i], vecs[b]) - cos(vecs[i], vecs[a])).slice(0, k);
    const v = {}; for (const j of idx) v[labs[j]] = (v[labs[j]] || 0) + 1;
    if (Object.keys(v).sort((a, b) => v[b] - v[a])[0] === labs[i]) hit++; tot++;
  }
  return hit / tot;
}
const genuinePurity = (vecs) => purity(labels, vecs) - purity(shuffled, vecs);

// z-score each column of a matrix (so blocks combine on equal footing)
function zscore(rows) {
  const D = rows[0].length, n = rows.length;
  const mu = new Array(D).fill(0), sd = new Array(D).fill(0);
  for (const r of rows) for (let d = 0; d < D; d++) mu[d] += r[d] / n;
  for (const r of rows) for (let d = 0; d < D; d++) sd[d] += (r[d] - mu[d]) ** 2 / n;
  for (let d = 0; d < D; d++) sd[d] = Math.sqrt(sd[d]) || 1;
  return rows.map((r) => r.map((v, d) => (v - mu[d]) / sd[d]));
}

// three representations
const valueVec = items.map((x) => Array.from(composedAtDepth(ser(x.wave), depth)));       // encoder value-shape
const timeVec = items.map((x) => Array.from(signature(x.wave)));                            // the TIME dimension
const zVal = zscore(valueVec), zTime = zscore(timeVec);
const combined = zVal.map((v, i) => v.concat(zTime[i]));                                    // value ⊕ time (raw concat)
// block-balanced concat: scale the time block so both blocks carry equal norm
// (each is unit-variance per dim, so norm ∝ √dims) — rules out "time was diluted"
const balW = Math.sqrt(zVal[0].length / zTime[0].length);
const balanced = zVal.map((v, i) => v.concat(zTime[i].map((x) => x * balW)));

console.log('MARKET FAMILY SEPARATION — does adding the TIME dimension sharpen distinct shape?');
console.log(`  ${items.length} harvested waveforms · groups ${[...new Set(labels)].map((g) => g + '×' + labels.filter((l) => l === g).length).join(' ')} · depth ${depth}\n`);
console.log('  representation                     genuine cosine-sep     genuine kNN-purity (vs shuffle null)');
const rows = [
  ['value-shape raw (encoder, cone)', valueVec],
  ['value-shape z-scored (cone removed)', zVal],   // CONTROL: isolates cone-removal from the time dim
  ['TIME dimension only (signature)', timeVec],
  ['value(z) ⊕ TIME(z) raw concat', combined],
  ['value(z) ⊕ TIME(z) block-balanced', balanced],
];
for (const [name, vecs] of rows) {
  console.log('  ' + name.padEnd(34) + genuine(vecs).toFixed(3).padStart(10) + '            ' + (genuinePurity(vecs) * 100).toFixed(1) + ' pts');
}
console.log('\n(reported as measured — genuine = real-label minus label-shuffle null, so it is structure above the encoder cone.');
console.log(' A rise from the value-only row is the time dimension letting the instrument see the distinct family shape.)');
