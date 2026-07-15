#!/usr/bin/env node
// substrate-connect.mjs — the CONNECTION: query the full pattern library by resonance,
// through the whitening capacity-dial. You don't load 47k patterns; you address them.
//   node scripts/substrate-connect.mjs "<query text or code>" [k]
// Encodes the query, whitens (raising effective dimensionality → retrieval capacity),
// and returns the top-k resonant patterns from the whole library. The whitening transform
// is fit once and cached (.remembrance/substrate-whitening.json).
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(new URL('.', import.meta.url).pathname + '../');
const W = require('./src/core/whitening');
const E = require('./src/core/encoder-stack');

const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const idx = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8')).index;
const names = Object.keys(idx);
const DIM = 116;
const lib = [], libNames = [];
for (const n of names) { const v = idx[n].composed_v1; if (Array.isArray(v) && v.length === DIM) { lib.push(v); libNames.push(n); } }

// fit + cache the whitening (the capacity dial: effDim ~6 → ~68, retrieval 62% → 87%)
const CACHE = path.join('.remembrance', 'substrate-whitening.json');
let Wm;
try { const c = JSON.parse(fs.readFileSync(CACHE, 'utf8')); Wm = { mean: c.mean, W: c.W, d: c.d }; } catch {
  const sample = []; const step = Math.max(1, Math.floor(lib.length / 4000));
  for (let i = 0; i < lib.length && sample.length < 4000; i += step) sample.push(lib[i]);
  Wm = W.fitWhitening(sample, { epsilon: 1e-3 });
  try { fs.mkdirSync('.remembrance', { recursive: true }); fs.writeFileSync(CACHE, JSON.stringify(Wm)); } catch {}
}
const wlib = lib.map(v => W.applyWhitening(v, Wm));
function cos(a, b) { let d = 0, na = 0, nb = 0; for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; } return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0; }

export function connect(queryText, k = 8) {
  const qv = W.applyWhitening(Array.from(E.composedAtDepth(queryText, 4)), Wm);   // depth-4 = composed_v1 space
  const scored = wlib.map((v, i) => ({ name: libNames[i], score: cos(qv, v) }));
  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, k);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const q = process.argv[2] || 'coherency gradient flow';
  const k = parseInt(process.argv[3] || '8', 10);
  console.log(`substrate connection: ${lib.length} patterns · whitened resonance · top-${k} for "${q.slice(0, 60)}"\n`);
  for (const r of connect(q, k)) console.log(`  ${r.score.toFixed(4)}  ${r.name}`);
}
