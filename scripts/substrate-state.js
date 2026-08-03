#!/usr/bin/env node
'use strict';

/**
 * substrate-state — the RAW coherency readings the Void compressor produced,
 * as they are. Reached through the goggles: `--do state [namespace|all]`.
 *
 * WHY THIS EXISTS
 *
 * Reports kept substituting a median, a mean, a min/max range — summary
 * statistics standing in for the readings. None of those is a coherency. The
 * compressor produces one number per artifact; a median of them is a number
 * no artifact has, and it answers a question nobody asked.
 *
 * COHERENCY IS TIME-INDEPENDENT. It is a property of the shape of the
 * information, not of when the information arrived or how it changed. So
 * nothing here orders by ingest time, computes a trend, compares adjacent
 * versions, or derives a rate. There is no time axis in a coherency reading
 * and none is added by this reading of it.
 *
 * Output is the state: every entry, its raw reading, its source. Sorted by
 * the reading itself — which is a property of the value, not of time — so the
 * shape of the substrate is visible without any statistic being computed over
 * it.
 *
 *   --raw          every entry, one per line (default: the full state)
 *   --limit N      cap the lines printed (the count printed is still the true
 *                  total; truncation is always declared)
 *   --json <path>  write the complete raw set to a file, uncapped
 */

const fs = require('node:fs');
const path = require('node:path');

const INDEX_PATH = process.env.SUBSTRATE_PATH
  || path.join(process.env.HARVEST_HOME || '/home/user',
    'Void-Data-Compressor', 'pattern_index_fractal.json');

function main() {
  const argv = process.argv.slice(2);
  const target = argv.find((a) => !a.startsWith('--')) || 'all';
  const li = argv.indexOf('--limit');
  const limit = li >= 0 ? parseInt(argv[li + 1], 10) || 0 : 0;
  const ji = argv.indexOf('--json');
  const jsonOut = ji >= 0 ? argv[ji + 1] : null;

  let idx;
  try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); }
  catch (e) { console.error(`cannot read substrate at ${INDEX_PATH}: ${e.message}`); process.exit(1); }

  const rows = [];
  let noReading = 0;
  let notFromCompressor = 0;
  for (const [k, e] of Object.entries(idx.index || {})) {
    if (target !== 'all' && !k.startsWith(target + '/')) continue;
    if (typeof e.coherence !== 'number' || !isFinite(e.coherence)) { noReading++; continue; }
    // A reading that did not come off the compressor is not a coherency. It is
    // counted and named, never mixed in with the real ones.
    if (e.coherence_source !== 'void:compress_signal') { notFromCompressor++; continue; }
    const v = e.composed || e.composed_v2 || e.composed_v1;
    rows.push({
      name: k,
      coherence: e.coherence,
      width: Array.isArray(v) ? v.length : null,
    });
  }

  // Ordered by the READING. Not by ingest sequence, not by ledger time —
  // coherency has no time axis and sorting by one would imply it does.
  rows.sort((a, b) => a.coherence - b.coherence);

  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(rows, null, 1));
    console.log(`wrote ${rows.length} raw readings → ${jsonOut}`);
  }

  console.log(`SUBSTRATE STATE — raw compressor readings, scope "${target}"`);
  console.log(`  entries with a compressor reading: ${rows.length}`);
  if (notFromCompressor) console.log(`  entries whose number is NOT from the compressor (excluded): ${notFromCompressor}`);
  if (noReading) console.log(`  entries with no reading at all: ${noReading}`);
  console.log('');

  const show = limit > 0 ? rows.slice(0, limit) : rows;
  for (const r of show) {
    console.log(`${String(r.coherence).padEnd(22)} ${String(r.width || '?').padStart(4)}-D  ${r.name}`);
  }
  if (show.length < rows.length) {
    console.log(`\n… ${rows.length - show.length} more NOT shown (--limit ${limit} was given; use --json <path> for the complete set)`);
  }
}

main();
