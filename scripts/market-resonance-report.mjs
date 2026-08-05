#!/usr/bin/env node
// market-resonance-report.mjs — take the market data ALREADY HARVESTED into the
// substrate, re-compress it at full encoder depth, measure resonance (raw + the
// whitened capacity dial, each against a label-shuffle null), and run the
// candlestick module on the live OHLC of the same instrument families. Then just
// report what it shows, as it presents — no signal, no prediction, no meaning.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const { composedAtDepth, currentDepth } = require('../src/core/decoder-stack');
const W = require('../src/core/whitening');
const { crawlMany } = require('../src/market/market-crawler');
const { detectAll } = require('../src/market/candlestick');
const { patternFlow, cosine } = require('../src/market/market-encode');

const VOID = process.env.VOID_DIR || '/home/user/Void-Data-Compressor';
const SRC = path.join(VOID, 'archive/legacy_pattern_files/market_substrate.json');

// ---- load the already-harvested market waveforms ---------------------------
const raw = JSON.parse(fs.readFileSync(SRC, 'utf8')).patterns;
const group = (name) => name.split('/')[1].replace(/_\d+$/, '');
const items = raw.map((p) => ({ name: p.name, grp: group(p.name), wave: p.waveform }));
const groups = [...new Set(items.map((x) => x.grp))];
const depth = currentDepth();

// re-compress each harvested waveform at full encoder depth (the harvested vectors
// were depth-4/116-D; we re-read them through the current depth-8 stack)
const ser = (ys) => { const m = Math.max(...ys.map(Math.abs)) || 1; return ys.map((y) => (y / m).toFixed(5)).join(','); };
for (const it of items) it.vec = Array.from(composedAtDepth(ser(it.wave), depth));

console.log(`HARVESTED MARKET DATA — ${items.length} waveforms (256-pt normalized series), re-compressed at depth ${depth}`);
console.log('  groups: ' + groups.map((g) => `${g}×${items.filter((x) => x.grp === g).length}`).join('  ') + '\n');

// ---- resonance: within-group vs cross-group, with a label-shuffle null ------
// The label-shuffle keeps every vector (and the encoder cone) but destroys group
// identity, so (real − shuffled) is the genuine group structure above the cone.
function groupContrast(labels, vecs) {
  let win = 0, wn = 0, cro = 0, cn = 0;
  for (let i = 0; i < vecs.length; i++) for (let j = i + 1; j < vecs.length; j++) {
    const c = cosine(vecs[i], vecs[j]);
    if (labels[i] === labels[j]) { win += c; wn++; } else { cro += c; cn++; }
  }
  return { within: win / (wn || 1), cross: cro / (cn || 1) };
}
function shuffle(arr, seed) { let s = seed; const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }

const labels = items.map((x) => x.grp);
const shuffled = shuffle(labels, 7);

function report(tag, vecs) {
  const real = groupContrast(labels, vecs);
  const nul = groupContrast(shuffled, vecs);
  const realSep = real.within - real.cross;
  const nulSep = nul.within - nul.cross;
  console.log(`  ${tag}`);
  console.log(`    within-group cosine : ${real.within.toFixed(3)}    cross-group : ${real.cross.toFixed(3)}    separation : ${(realSep).toFixed(3)}`);
  console.log(`    label-shuffle null  : within ${nul.within.toFixed(3)}  cross ${nul.cross.toFixed(3)}  separation ${nulSep.toFixed(3)}`);
  console.log(`    GENUINE group structure (real−null separation): ${(realSep - nulSep).toFixed(3)}`);
  return realSep - nulSep;
}

console.log('=== RESONANCE among harvested market waveforms (cosine; separation vs label-shuffle null) ===\n');
const rawVecs = items.map((x) => x.vec);
report('RAW encoder space:', rawVecs);

// whitened (the capacity dial): fit ZCA on the market vectors, re-measure
const Wm = W.fitWhitening(rawVecs, { epsilon: 1e-3 });
const wVecs = rawVecs.map((v) => Array.from(W.applyWhitening(v, Wm)));
const effRaw = W.participationRatio(rawVecs).toFixed(1);
const effW = W.participationRatio(wVecs).toFixed(1);
console.log('');
report(`WHITENED space (effDim ${effRaw} → ${effW}):`, wVecs);

// ---- resonance of harvested market vs the broader library ------------------
// what NON-market patterns does each market group resonate with most? (whitened
// query over a sample of the full library, reported as measured)
try {
  const store = JSON.parse(fs.readFileSync(path.join(VOID, 'pattern_index_fractal.json'), 'utf8'));
  const idx = store.index || store;
  const lib = [];
  for (const k of Object.keys(idx)) {
    if (k.startsWith('market/')) continue;
    const v = idx[k].composed_v1; if (Array.isArray(v) && v.length === 116) lib.push({ k, v });
    if (lib.length >= 4000) break;
  }
  // project market waveforms to depth-4/116-D to match the library's composed_v1
  console.log('\n=== harvested market groups vs the broader library (top resonant non-market pattern per group) ===');
  for (const g of groups) {
    const gv = items.filter((x) => x.grp === g).map((x) => Array.from(composedAtDepth(ser(x.wave), 4)));
    const centroid = gv[0].map((_, d) => gv.reduce((s, v) => s + v[d], 0) / gv.length);
    let best = null;
    for (const p of lib) { const c = cosine(centroid, p.v); if (!best || c > best.c) best = { k: p.k, c }; }
    console.log(`  ${g.padEnd(7)} → ${best.k}  (cosine ${best.c.toFixed(3)})`);
  }
} catch (e) { console.log('\n(library cross-resonance skipped: ' + e.message + ')'); }

// ---- candlestick module on LIVE OHLC of the same instrument families -------
// The harvested set is close-only (256-pt normalized), so candlesticks — which
// need O/H/L/C — are run on live OHLC of the matching instruments, as measured.
const MAP = { sp500: '^GSPC', vix: '^VIX', gold: 'GC=F', oil: 'CL=F' };
const wanted = groups.filter((g) => MAP[g]).map((g) => MAP[g]);
console.log('\n=== CANDLESTICK module on live OHLC of the same families (' + wanted.join(', ') + ') ===');
const feeds = await crawlMany(wanted, { range: '1y', interval: '1d' });
const pfVecs = [];
for (const f of feeds) {
  if (f.error || (f.candles || []).length < 3) { console.log(`  ${f.symbol.padEnd(7)} unavailable: ${f.error || 'too few bars'}`); continue; }
  const det = detectAll(f.candles);
  const top = Object.entries(det.counts).sort((a, b) => b[1] - a[1]).slice(0, 8).map(([n, k]) => `${n}×${k}`).join('  ');
  console.log(`  ${f.symbol.padEnd(7)} ${String(f.candles.length).padStart(4)} bars → ${top}`);
  pfVecs.push({ sym: f.symbol, vec: Array.from(composedAtDepth(ser(patternFlow(f.candles)), depth)) });
}
if (pfVecs.length >= 2) {
  console.log('\n  candlestick pattern-pressure resonance (cosine of the signed pattern-stream vectors):');
  for (let i = 0; i < pfVecs.length; i++) for (let j = i + 1; j < pfVecs.length; j++)
    console.log(`    ${pfVecs[i].sym} · ${pfVecs[j].sym} = ${cosine(pfVecs[i].vec, pfVecs[j].vec).toFixed(3)}`);
}
console.log('\n(reported as measured — resonance is cosine in the encoder/whitened space, candlestick counts are the named-pattern tally on the live flow. No signal, no prediction.)');
