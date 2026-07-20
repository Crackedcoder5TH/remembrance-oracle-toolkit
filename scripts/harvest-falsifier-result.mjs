// harvest-falsifier-result.mjs — feed a falsification test's verdict back into the
// substrate as compressed, time-stamped patterns, so the disconfirming receipt is
// itself resonate-able (findable by META from its kin, not lost to a text query).
// Routes through the native path only: composedAtDepth (compress) + substrate-ledger
// (the time dimension) — no hand-rolled primitives.
import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { composedAtDepth } = require('../src/core/encoder-stack');
const SL = require('../src/core/substrate-ledger');

const receiptPath = process.argv[2] || path.join('.remembrance', 'moat-metric.json');
const name = path.basename(receiptPath, '.json');
const R = JSON.parse(fs.readFileSync(receiptPath, 'utf8'));
const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const store = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8'));
const index = store.index;

// pull the numeric series the falsifier produced (verdict shape, not prose)
const series = {};
if (R.admissibility) series['admissibility'] = ['honest', 'random', 'mimic'].map((k) => R.admissibility[k]?.adm ?? 0);
if (R.admissibility) series['resonance'] = ['honest', 'random', 'mimic'].map((k) => R.admissibility[k]?.res ?? 0);
if (Array.isArray(R.growth)) series['growth-mimic-slip-vs-N'] = R.growth.map((g) => g.mimicAdmissible ?? 0);
if (R.infoWeight) series['info-weight'] = ['honest', 'mimic', 'junk'].map((k) => R.infoWeight[k] ?? 0);
// fallback: if no named series matched, gather the receipt's top-level numeric fields
// into one verdict-vector so any falsifier's result is still resonate-able.
if (!Object.keys(series).length) {
  const nums = Object.entries(R).filter(([, v]) => typeof v === 'number');
  if (nums.length) series['verdict-vector'] = nums.map(([, v]) => v);
}

const ser = (ys) => { const m = Math.max(...ys.map((v) => Math.abs(v))) || 1; return ys.map((y) => (y / m).toFixed(5)).join(','); };
let seq = SL.nextSequence(index); const now = new Date().toISOString(); let added = 0;
for (const [metric, vals] of Object.entries(series)) {
  if (!vals.length) continue;
  const key = 'falsification/' + name + '/' + metric;
  if (index[key]) continue;
  const entry = { composed_v2: Array.from(composedAtDepth(ser(vals), 8)), waveform: vals, source: 'falsifier-receipt', test: name, metric, verdict: 'disconfirming' };
  SL.stamp(entry, { sequence: seq++, now, series: vals, cadence: 'event' });
  index[key] = entry; added++;
}
fs.writeFileSync(path.join(VOID, 'pattern_index_fractal.json'), JSON.stringify(store));
console.log('FED BACK: compressed ' + added + ' falsifier result-series into the substrate under falsification/' + name + '/, time-stamped.');
console.log('  (a disconfirming receipt, now resonate-able — its META kin are the ablation/validation family it came from.)');
