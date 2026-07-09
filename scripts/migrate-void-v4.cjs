#!/usr/bin/env node
'use strict';

/**
 * migrate-void-v4.cjs — re-encode the Void library through the new
 * encoder: append L6 (content-projection) and L7 (dimensional) blocks,
 * producing composed_v4 = composed_v1 (116) + L5 (29) + L6 (29) + L7 (29)
 * = 203-D.
 *
 * Same canonical-text convention as migrate-void-v2 (JSON-serialized
 * waveform for data series — which is a numeric series, so L7 fires on
 * it — or the source text for code). ADDITIVE and idempotent.
 *
 * SIZE: composed_v4 contains composed_v1 and composed_v2 as prefixes
 * (v4[:116] == v1, v4[:145] == v2), so we DROP composed_v2 (redundant)
 * and keep only fractal (29, the L1 parity anchor), composed_v1 (some
 * consumers read it by name), and composed_v4. This keeps the index
 * under the git size ceiling while carrying the full 7-layer signal.
 *
 * LRE: each re-encoded pattern's L7 2D-gain is contributed to the field
 * (oracle:encoder:migrate-dimensional) so the field learns the
 * substrate's dimensional profile as the re-encode proceeds.
 *
 * Usage:
 *   node scripts/migrate-void-v4.cjs [--limit N] [--dry]
 *     --limit N  process only N patterns (sample/size measurement)
 *     --dry      compute but do not write the index
 */

const fs = require('fs');
const path = require('path');
const { toRedundancyWaveform } = require(path.join(__dirname, '..', 'src', 'core', 'redundancy-waveform.js'));
const { toContentProjection } = require(path.join(__dirname, '..', 'src', 'core', 'content-projection.js'));
const { toDimensionalWaveform, dimensionalGain } = require(path.join(__dirname, '..', 'src', 'core', 'dimensional-waveform.js'));
let fc = null; try { fc = require(path.join(__dirname, '..', 'src', 'core', 'field-coupling.js')); } catch (_) { /* field optional */ }

const args = process.argv.slice(2);
const dry = args.includes('--dry');
const limIdx = args.indexOf('--limit');
const LIMIT = limIdx >= 0 ? (parseInt(args[limIdx + 1], 10) || 0) : 0;

const VOID = process.env.VOID_DIR || path.join(__dirname, '..', '..', 'Void-Data-Compressor');
const FRACTAL = path.join(VOID, 'pattern_index_fractal.json');
const SOURCE_INDEX = path.join(VOID, 'pattern_index.json');

console.log('loading indexes…');
const fractal = JSON.parse(fs.readFileSync(FRACTAL, 'utf8'));
const sourceIdx = JSON.parse(fs.readFileSync(SOURCE_INDEX, 'utf8')).index;

const fileCache = new Map();
function loadSubstrate(file) {
  if (fileCache.has(file)) return fileCache.get(file);
  const p = path.join(VOID, file);
  if (!fs.existsSync(p)) { fileCache.set(file, null); return null; }
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    const arr = Array.isArray(j) ? j : (j.patterns || j.entries || null);
    fileCache.set(file, Array.isArray(arr) ? arr : null);
    return fileCache.get(file);
  } catch (_) { fileCache.set(file, null); return null; }
}
function sourceText(id) {
  const ptrs = sourceIdx[id];
  if (!Array.isArray(ptrs)) return null;
  for (const ptr of ptrs) {
    const arr = loadSubstrate(ptr.file);
    if (!arr) continue;
    const entry = arr[ptr.i];
    if (!entry) continue;
    if (Array.isArray(entry.waveform)) return JSON.stringify(entry.waveform);
    if (typeof entry.text === 'string') return entry.text;
    if (typeof entry.code === 'string') return entry.code;
    if (typeof entry.content === 'string') return entry.content;
  }
  return null;
}
const round6 = (v) => Array.from(v, (x) => +x.toFixed(6));

let done = 0, already = 0, unlocatable = 0, fired = 0, total = 0;
const t0 = Date.now();
const ids = Object.keys(fractal.index);
for (const id of ids) {
  if (LIMIT && total >= LIMIT) break;
  total++;
  const e = fractal.index[id];
  if (!e || !Array.isArray(e.composed_v1) || e.composed_v1.length !== 116) { unlocatable++; continue; }
  if (Array.isArray(e.composed_v4) && e.composed_v4.length === 203) { already++; continue; }
  const text = sourceText(id);
  if (text === null) { unlocatable++; continue; }

  // L5 (reuse from composed_v2 if present, else compute), then L6, L7.
  const l5 = (Array.isArray(e.composed_v2) && e.composed_v2.length === 145)
    ? e.composed_v2.slice(116)
    : round6(toRedundancyWaveform(text));
  const l6 = round6(toContentProjection(text));
  const l7 = round6(toDimensionalWaveform(text));
  const v4 = e.composed_v1.concat(l5, l6, l7);

  if (!dry) {
    e.composed_v4 = v4;
    delete e.composed_v2; // redundant: v4[:145] == v2
  }
  done++;

  // LRE: feed the field this pattern's 2D structure — as a COHERENT
  // detection event (healthy coherence), with the gain magnitude in the
  // source bucket, NOT as coherence (which would drag the field's
  // alignment down for merely finding structure).
  if (fc) {
    try {
      const g = dimensionalGain(text);
      if (g > 0) {
        fired++;
        const bucket = g >= 0.3 ? 'strong' : g >= 0.1 ? 'moderate' : 'weak';
        fc.contribute({ cost: 1.0, coherence: 0.9, source: 'oracle:encoder:migrate-dimensional:' + bucket });
      }
    } catch (_) { /* field optional */ }
  }
  if (done % 2000 === 0) console.log(`  ${done} re-encoded (${fired} fired L7)…`);
}

if (!dry && !LIMIT) {
  fractal.v4_migration = {
    reencoded_total: (fractal.v4_migration ? fractal.v4_migration.reencoded_total : 0) + done,
    coverage: `${done + already}/${ids.length}`,
    encoder: 'composed_v4 = v1(116) + L5 + L6-content-projection + L7-dimensional = 203-D',
    note: 'v2 dropped (redundant, == v4[:145]); v1 kept as parity anchor.',
  };
  fs.writeFileSync(FRACTAL, JSON.stringify(fractal));
}

const secs = (Date.now() - t0) / 1000;
console.log(`\n${dry ? '(dry) ' : ''}re-encode ${LIMIT ? '(sample ' + LIMIT + ') ' : ''}done in ${secs.toFixed(1)}s`);
console.log(`  re-encoded:  ${done}  (${fired} fired the L7 2D layer)`);
console.log(`  already v4:  ${already}`);
console.log(`  unlocatable: ${unlocatable}`);
if (done) console.log(`  rate: ${(done / secs).toFixed(0)} patterns/s → full 47.6k ≈ ${(47600 / (done / secs) / 60).toFixed(1)} min`);
