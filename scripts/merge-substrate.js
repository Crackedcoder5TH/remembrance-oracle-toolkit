#!/usr/bin/env node
'use strict';

/**
 * merge-substrate — collapse the substrate's scattered files into ONE store.
 * Reached through the goggles: `--do merge [--apply]`.
 *
 * WHY
 *
 * The data was four files that disagreed about what they covered:
 *
 *   pattern_index_fractal.json   entries, coherency readings, 29-D fractal,
 *                                composed_v1 (116-D) / composed_v2 (145-D)
 *   composed_v5_index.json       canonical 232-D vectors, depth 8
 *   field_substrate_part1/2.json raw waveforms
 *   pattern_index.json           an index over 115 separate substrate files
 *
 * Nothing read all of them. `--do redecode` looked only at the first, found no
 * source file on disk for 44,906 entries, and reported them permanently
 * unreachable — while 42,712 of their canonical vectors sat in the second file.
 * `--do void` and `--do state` read the first file only, so a completed
 * re-decode reported as a no-op. Every one of those was the same defect: the
 * data is one thing, the readers each saw a slice, and each slice looked
 * complete from inside.
 *
 * WHAT MERGES
 *
 * One entry per name, carrying everything known about it:
 *
 *   composed        canonical vector at the decoder's current width
 *   composed_width  the width it is actually stored at — NOT assumed
 *   composed_from   which store it came from (provenance of the vector)
 *   coherence       the compressor's reading
 *   coherence_source  provenance of the reading
 *   waveform        the raw signal, where one exists
 *   fractal         29-D L1
 *   ledger, sanitize, source_file, ingested_from   carried through unchanged
 *
 * NO READING IS RECOMPUTED AND NO TIME DIMENSION IS ADDED. This moves data;
 * it does not measure. Coherency comes off the compressor and is copied
 * verbatim. Entries are keyed by name, never ordered by ingest sequence.
 *
 * A number that did not come from the compressor is never promoted into
 * `coherence` — it is carried under its original key and counted separately.
 */

const fs = require('node:fs');
const path = require('node:path');
const { currentDepth, flowCheckpoints } = require('../src/core/decoder-stack');

const VOID = process.env.VOID_ROOT
  || path.join(process.env.HARVEST_HOME || '/home/user', 'Void-Data-Compressor');

const SRC = {
  fractal: path.join(VOID, 'pattern_index_fractal.json'),
  v5: path.join(VOID, 'composed_v5_index.json'),
  wave1: path.join(VOID, 'field_substrate_part1.json'),
  wave2: path.join(VOID, 'field_substrate_part2.json'),
};
const OUT = process.env.SUBSTRATE_MERGED
  || path.join(VOID, 'substrate.json');

function readJSON(p) {
  try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch (_) { return null; }
}

function main() {
  const apply = process.argv.includes('--apply');
  const depth = currentDepth();
  const width = flowCheckpoints().slice(-1)[0];

  console.log(`MERGE SUBSTRATE — one store, canonical depth ${depth} (${width}-D)`);
  console.log(apply ? '' : '  [DRY RUN — nothing written]\n');

  const fractal = readJSON(SRC.fractal);
  if (!fractal || !fractal.index) { console.error(`cannot read ${SRC.fractal}`); process.exit(1); }
  console.log(`  pattern_index_fractal : ${Object.keys(fractal.index).length} entries`);

  const v5raw = readJSON(SRC.v5);
  const v5 = (v5raw && v5raw.index) || {};
  console.log(`  composed_v5_index     : ${Object.keys(v5).length} canonical vectors (${v5raw ? v5raw.dims : '?'}-D)`);

  // Waveforms live as {patterns:[{name, waveform}]} across parts.
  const waves = {};
  for (const p of [SRC.wave1, SRC.wave2]) {
    const w = readJSON(p);
    for (const rec of (w && w.patterns) || []) {
      if (rec && rec.name && Array.isArray(rec.waveform)) waves[rec.name] = rec.waveform;
    }
  }
  console.log(`  field_substrate parts : ${Object.keys(waves).length} raw waveforms`);

  const entries = {};
  const stats = {
    total: 0, withComposed: 0, atCanonical: 0, belowCanonical: 0,
    withWaveform: 0, withCoherence: 0, coherenceFromCompressor: 0,
    coherenceNotFromCompressor: 0, vectorFromV5: 0, vectorFromFractal: 0,
  };

  const names = new Set([...Object.keys(fractal.index), ...Object.keys(v5), ...Object.keys(waves)]);
  for (const name of names) {
    const e = fractal.index[name] || {};
    const out = {};

    // ── the canonical vector: prefer the widest actually available ──
    const candidates = [
      [e.composed, e.composed_from || 'fractal-index'],
      [v5[name], 'composed_v5_index'],
      [e.composed_v2, 'composed_v2'],
      [e.composed_v1, 'composed_v1'],
    ].filter(([v]) => Array.isArray(v) && v.length);
    if (candidates.length) {
      candidates.sort((a, b) => b[0].length - a[0].length);
      const [vec, from] = candidates[0];
      out.composed = vec;
      out.composed_width = vec.length;   // stored, never assumed
      out.composed_from = from;
      stats.withComposed++;
      if (from === 'composed_v5_index') stats.vectorFromV5++; else stats.vectorFromFractal++;
      if (vec.length >= width) stats.atCanonical++; else stats.belowCanonical++;
    }

    // ── the reading: copied verbatim, never recomputed, never promoted ──
    if (typeof e.coherence === 'number' && isFinite(e.coherence)) {
      stats.withCoherence++;
      if (e.coherence_source === 'void:compress_signal') {
        out.coherence = e.coherence;
        out.coherence_source = e.coherence_source;
        stats.coherenceFromCompressor++;
      } else {
        // Not the compressor's, so not a coherency. Kept under its own name so
        // nothing is lost and nothing is laundered.
        out.unverified_score = e.coherence;
        out.unverified_source = e.coherence_source || null;
        stats.coherenceNotFromCompressor++;
      }
    }

    if (waves[name]) { out.waveform = waves[name]; stats.withWaveform++; }
    if (Array.isArray(e.fractal)) out.fractal = e.fractal;
    for (const k of ['ledger', 'sanitize', 'source_file', 'ingested_from', 'tokens']) {
      if (e[k] !== undefined) out[k] = e[k];
    }

    entries[name] = out;
    stats.total++;
  }

  console.log(`\n  MERGED: ${stats.total} entries`);
  console.log(`    with a vector            ${stats.withComposed}`);
  console.log(`      at canonical ${width}-D      ${stats.atCanonical}`);
  console.log(`      below canonical        ${stats.belowCanonical}`);
  console.log(`      vector from v5 store   ${stats.vectorFromV5}`);
  console.log(`      vector from fractal    ${stats.vectorFromFractal}`);
  console.log(`    with a raw waveform      ${stats.withWaveform}`);
  console.log(`    with a compressor reading ${stats.coherenceFromCompressor}`);
  console.log(`    number NOT from compressor (kept as unverified_score) ${stats.coherenceNotFromCompressor}`);
  console.log(`    no reading at all        ${stats.total - stats.withCoherence}`);

  if (!apply) { console.log('\n  dry run — nothing written. Re-run with --apply.'); return; }

  const store = {
    kind: 'remembrance-substrate',
    version: 1,
    depth,
    dims: width,
    merged_from: Object.values(SRC).map((p) => path.basename(p)),
    note: 'One store. The compressed patterns ARE the source; the decoder only determines how they are read.',
    stats,
    entries,
  };
  const tmp = OUT + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store));
  fs.renameSync(tmp, OUT);
  const bytes = fs.statSync(OUT).size;
  console.log(`\n  written → ${OUT}  (${(bytes / 1e6).toFixed(1)}MB)`);
}

main();
