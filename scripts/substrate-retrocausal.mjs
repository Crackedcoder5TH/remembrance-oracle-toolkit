#!/usr/bin/env node
// substrate-retrocausal.mjs — the retro-causal projector, now working off the
// substrate's TIME DIMENSION. Every stamped entry carries a ledger
// (observed_start/end, cadence, ingest sequence) and a raw waveform, so
// projectForward has something to stand on. This orders the substrate's
// projectable patterns by their ingest clock and, for each, projects it past its
// observed_end and computes the retro-causal alignment against the prior pattern.
//
// It also shows the BEFORE: strip the ledger and the module returns identity
// (1.0) every call — which is exactly why it looked inert before the time
// dimension existed. Fed a ledger, it moves.
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';
const require = createRequire(import.meta.url);
const T = require('../src/atomic/temporal-projection');
const SL = require('../src/core/substrate-ledger');

const INDEX_PATH = process.env.SUBSTRATE_PATH || path.join('/home/user', 'Void-Data-Compressor', 'pattern_index_fractal.json');
const idx = (JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')).index) || {};

// projectable = carries the full time dimension (window ledger + raw waveform)
const proj = Object.keys(idx).map((k) => ({ k, e: idx[k] })).filter(({ e }) => SL.isProjectable(e));
proj.sort((a, b) => (a.e.ledger.sequence || 0) - (b.e.ledger.sequence || 0));   // the substrate's own time order

console.log(`SUBSTRATE TIME DIMENSION — retro-causal projector over ${proj.length} projectable, time-stamped patterns`);
console.log(`  (of ${Object.keys(idx).length} total; a pattern is projectable once it carries ledger{observed_*,cadence}+waveform)\n`);
if (!proj.length) { console.log('  none yet — harvest time-stamped data first: node scripts/market-crawl.mjs SPY BTC-USD --harvest'); process.exit(0); }

const parseMs = (iso) => Date.parse(iso);
const cadMs = (c) => T.cadenceToMs(c) || 86.4e6;

// (1) DOES THE TIME DIMENSION FEED THE PROJECTOR? — per stamped pattern, does it
// classify + gain confidence + project past its observed_end?
console.log('  (1) projector fed by each pattern\'s ledger:');
console.log('      pattern                                  class      conf    projects?');
let fed = 0;
for (let i = 0; i < Math.min(proj.length, 12); i++) {
  const { k, e } = proj[i];
  const tNow = parseMs(e.ledger.observed_end) + 5 * cadMs(e.ledger.cadence);
  const conf = T.projectionConfidence(e, tNow);
  const p = T.projectForward(e, tNow);
  const moves = Array.isArray(p) && p.some((v, j) => v !== e.waveform[j]);
  if (conf > 0) fed++;
  console.log('      ' + k.slice(0, 40).padEnd(40) + ' ' + T.classifyWaveform(e.waveform).padEnd(10) + ' ' + conf.toFixed(2).padStart(5) + '     ' + (moves ? 'yes' : 'no'));
}
for (let i = 12; i < proj.length; i++) { const { e } = proj[i]; if (T.projectionConfidence(e, parseMs(e.ledger.observed_end) + 5 * cadMs(e.ledger.cadence)) > 0) fed++; }
console.log('      FED (confidence > 0): ' + fed + ' / ' + proj.length + ' patterns\n');

// (2) THE RETRO-CAUSAL PULL ACROSS A LINEAGE — the alignment multiplier only
// moves when a pattern has a PRIOR STATE of equal length to pull against. A single
// instrument's time-stamped series IS that lineage: slice it into consecutive
// windows advancing in time (each a valid ledger), and pull each window's forward
// projection against the window before it. This is the r_eff multiplier at work.
console.log('  (2) retro-causal alignment across each instrument\'s own time lineage:');
console.log('      lineage (instrument/close)          windows   moved≠1.0   mean align×   range');
const lineages = proj.filter(({ k }) => /\/close$/.test(k) && proj[0] && Array.isArray(idx[k].waveform) && idx[k].waveform.length >= 60);
let anyMoved = 0, anyTot = 0;
for (const { k, e } of lineages) {
  const w = e.waveform, cad = e.cadence || e.ledger.cadence, cadms = cadMs(e.ledger.cadence);
  const t0 = parseMs(e.ledger.observed_start);
  const WIN = Math.max(30, Math.floor(w.length / 6)), STRIDE = Math.max(5, Math.floor(WIN / 3));
  const windows = [];
  for (let s = 0; s + WIN <= w.length; s += STRIDE) {
    const seg = w.slice(s, s + WIN);
    windows.push({ waveform: seg, ledger: { observed_start: new Date(t0 + s * cadms).toISOString(), observed_end: new Date(t0 + (s + WIN - 1) * cadms).toISOString(), cadence: e.ledger.cadence, sequence: s } });
  }
  const aligns = [];
  for (let i = 1; i < windows.length; i++) {
    const tNow = parseMs(windows[i].ledger.observed_end) + 5 * cadms;
    aligns.push(T.computeRetrocausalAlignment(windows[i], windows[i - 1], { tNow }));
  }
  const moved = aligns.filter((a) => a !== T.IDENTITY_ALIGNMENT).length;
  anyMoved += moved; anyTot += aligns.length;
  const mean = aligns.length ? aligns.reduce((a, b) => a + b, 0) / aligns.length : 1;
  console.log('      ' + k.slice(0, 34).padEnd(34) + String(windows.length).padStart(8) + String(moved + '/' + aligns.length).padStart(12) + mean.toFixed(4).padStart(13) + '   [' + Math.min(...aligns).toFixed(3) + ', ' + Math.max(...aligns).toFixed(3) + ']');
}
console.log('      MOVED across all lineages: ' + anyMoved + ' / ' + anyTot + ' alignments ≠ identity\n');

// (3) control — strip the ledger and the SAME call returns identity every time
let identityCount = 0;
for (const { e } of proj) { if (T.computeRetrocausalAlignment({ waveform: e.waveform }, null, {}) === T.IDENTITY_ALIGNMENT) identityCount++; }
console.log('  (3) control — ledger stripped: ' + identityCount + ' / ' + proj.length + ' return identity 1.0 (the inert "before" state)');
console.log('\n  Reading: the module was never broken — it was unfed. Given the substrate time dimension it classifies,');
console.log('  gains projection confidence, extrapolates past observed_end, and the retro-causal pull moves off 1.0');
console.log('  across a pattern\'s own time lineage. (Whether that pull is PREDICTIVE is the separate held-out test.)');
