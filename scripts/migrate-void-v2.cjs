#!/usr/bin/env node
'use strict';

/**
 * migrate-void-v2.cjs — append L5 blocks to the Void library.
 *
 * For every pattern whose source is locatable in the substrate files
 * present on this machine, compute the L5 redundancy waveform from
 * the canonical text (JSON-serialized waveform — the same convention
 * the original encode used; see L3's design notes) and write
 * composed_v2 = composed_v1 (116) + L5 (29) alongside the v1 vector.
 *
 * ADDITIVE and idempotent: composed_v1 untouched, spec_version kept,
 * migration metadata recorded. Patterns without locatable sources
 * stay v1-only — the depth-agnostic indexes zero-pad them, which is
 * cosine-clean, and the composition gate floors zero blocks by
 * salience. Partial migration is safe by construction; re-run this
 * on the machine that holds all substrate files for full coverage.
 */

const fs = require('fs');
const path = require('path');
const { toRedundancyWaveform } = require(path.join(__dirname, '..', 'src', 'core', 'redundancy-waveform.js'));

const VOID = process.env.VOID_DIR || path.join(__dirname, '..', '..', 'Void-Data-Compressor');
const FRACTAL = path.join(VOID, 'pattern_index_fractal.json');
const SOURCE_INDEX = path.join(VOID, 'pattern_index.json');

console.log('loading indexes…');
const fractal = JSON.parse(fs.readFileSync(FRACTAL, 'utf8'));
const sourceIdx = JSON.parse(fs.readFileSync(SOURCE_INDEX, 'utf8')).index;

// Load every substrate file that exists, building name → text.
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

let migrated = 0, alreadyV2 = 0, unlocatable = 0, total = 0;
const t0 = Date.now();
for (const id of Object.keys(fractal.index)) {
  total++;
  const e = fractal.index[id];
  if (!e || !Array.isArray(e.composed_v1) || e.composed_v1.length !== 116) { unlocatable++; continue; }
  if (Array.isArray(e.composed_v2) && e.composed_v2.length === 145) { alreadyV2++; continue; }
  const text = sourceText(id);
  if (text === null) { unlocatable++; continue; }
  const l5 = toRedundancyWaveform(text);
  e.composed_v2 = e.composed_v1.concat(Array.from(l5, x => +x.toFixed(6)));
  migrated++;
  if (migrated % 2000 === 0) console.log(`  ${migrated} migrated…`);
}

fractal.l5_migration = {
  migrated_total: (fractal.l5_migration ? fractal.l5_migration.migrated_total : 0) + migrated,
  coverage: `${migrated + alreadyV2}/${total}`,
  encoder: 'src/core/redundancy-waveform.toRedundancyWaveform (29-D)',
  note: 'composed_v2 = composed_v1 + L5. v1 preserved; unmigrated entries are zero-padded by depth-agnostic consumers.',
};

fs.writeFileSync(FRACTAL, JSON.stringify(fractal));
console.log(`\ndone in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
console.log(`  migrated now:  ${migrated}`);
console.log(`  already v2:    ${alreadyV2}`);
console.log(`  v1-only (sources not on this machine): ${unlocatable}`);
console.log(`  coverage:      ${migrated + alreadyV2}/${total} (${(100 * (migrated + alreadyV2) / total).toFixed(1)}%)`);
