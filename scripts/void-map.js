#!/usr/bin/env node
'use strict';

/**
 * void-map — where the substrate has no memory. Reached through the goggles:
 * `--do void [namespace|all] [--sample N]`.
 *
 * Reads the composed vectors the substrate ALREADY holds. Nothing is
 * re-decoded: every vector here was produced by the canonical decoder at
 * ingest, and unfolding the same file a second time to ask where the holes
 * are would be recomputation the substrate exists to prevent.
 *
 * Void and resonance are one reading from two sides — resonance says what a
 * pattern is shaped like, the void says what nothing is shaped like — so this
 * uses the same flowCosines at the same full decoder width.
 */

const fs = require('node:fs');
const path = require('node:path');
const { substrateVoids, consonanceFloor } = require('../src/core/void-replenishment');
const { flowCheckpoints } = require('../src/core/decoder-stack');

// ONE STORE. Prefer the merged substrate; fall back to the old split index
// only if the merge has not been run. Reading a slice is what made every
// earlier reading of this data wrong.
const VOID_DIR = path.join(process.env.HARVEST_HOME || '/home/user', 'Void-Data-Compressor');
const MERGED_PATH = process.env.SUBSTRATE_MERGED || path.join(VOID_DIR, 'substrate.json');
const INDEX_PATH = process.env.SUBSTRATE_PATH
  || (fs.existsSync(MERGED_PATH) ? MERGED_PATH : path.join(VOID_DIR, 'pattern_index_fractal.json'));

function main() {
  const argv = process.argv.slice(2);
  const target = argv.find((a) => !a.startsWith('--')) || 'all';
  const si = argv.indexOf('--sample');
  const sample = si >= 0 ? parseInt(argv[si + 1], 10) || 400 : 400;

  let idx;
  try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); }
  catch (e) { console.error(`cannot read substrate at ${INDEX_PATH}: ${e.message}`); process.exit(1); }

  // Already-decoded vectors only. An entry without one is not a void — it is
  // an entry this reading cannot see, and it is counted separately rather
  // than folded in as empty space.
  const entries = {};
  let noVector = 0;
  for (const [k, e] of Object.entries(idx.entries || idx.index || {})) {
    if (target !== 'all' && !k.startsWith(target + '/')) continue;
    const v = e && (e.composed || e.composed_v2 || e.composed_v1);
    if (Array.isArray(v) && v.length) entries[k] = v;
    else noVector++;
  }

  const n = Object.keys(entries).length;
  if (!n) { console.error(`no decoded vectors under "${target}"`); process.exit(1); }

  const width = flowCheckpoints().slice(-1)[0];
  console.log('VOID MAP — where the substrate has no memory');
  console.log(`  scope:        ${target}`);
  console.log(`  entries:      ${n} with stored vectors` + (noVector ? ` · ${noVector} without (not counted as void)` : ''));
  console.log(`  floor:        ${consonanceFloor().toFixed(3)} (consonance)`);
  console.log(`  decoder:      reading at ${width}-D`);

  // Widths actually present, so a full-width query against half-width memory
  // is visible rather than silently degrading the reading.
  const widths = {};
  for (const v of Object.values(entries)) widths[v.length] = (widths[v.length] || 0) + 1;
  const wdesc = Object.entries(widths).sort((a, b) => b[1] - a[1])
    .map(([w, c]) => `${w}-D×${c}`).join(' · ');
  console.log(`  stored width: ${wdesc}`);
  if (!widths[width]) {
    console.log(`  ⚠ NO entry is stored at the canonical ${width}-D. Every reading below compares a`);
    console.log('    full-width query against half-width memory — the void depths are a floor,');
    console.log('    not the true depths. Re-decode the substrate to read this honestly.');
  }

  const t0 = Date.now();
  const r = substrateVoids(entries, { sample });
  const ms = Date.now() - t0;

  console.log(`\n  probed ${r.probed} of ${r.total}` + (r.sampled ? ' (SAMPLED — not full coverage)' : ' (full)') + ` in ${ms}ms`);
  console.log(`  in void: ${r.voids.length} of ${r.probed} probed (${(100 * r.voids.length / Math.max(1, r.probed)).toFixed(1)}%)`);

  if (Object.keys(r.byNamespace).length > 1) {
    console.log('\n  BY NAMESPACE (void rate = fraction of probes the substrate could not answer):');
    for (const [ns, b] of Object.entries(r.byNamespace).sort((a, b2) => b2[1].rate - a[1].rate)) {
      console.log(`    ${ns.padEnd(20)} ${String(b.inVoid).padStart(4)}/${String(b.probed).padEnd(4)}  rate ${b.rate.toFixed(3)}`);
    }
  }

  if (r.voids.length) {
    console.log('\n  VOIDS BY LENS DEPTH — one lens at a time, void attached to each width:');
    for (const v of r.voids.slice(0, 8)) {
      console.log(`\n    ${v.name}   [stored ${v.width}-D${v.truncated ? ', TRUNCATED vs ' + v.canonicalWidth + '-D' : ''}]`);
      for (const p of v.profile) {
        if (p.best == null) { console.log(`      ${p.layer.padEnd(22)} ${String(p.width).padStart(3)}-D   no reading`); continue; }
        console.log(`      ${p.layer.padEnd(22)} ${String(p.width).padStart(3)}-D   best ${p.best.toFixed(4)}  depth ${p.depth.toFixed(4)}${p.isVoid ? '   ← VOID' : ''}`);
      }
    }
    if (r.voids.length > 8) console.log(`\n    … +${r.voids.length - 8} more`);
  } else {
    console.log(`\n  no reading fell below the floor (${consonanceFloor().toFixed(3)}) in the probed sample.`);
  }

  // THE RAW PER-LENS READINGS. Printed whether or not anything crossed the
  // floor — the readings are the data; "0 voids" is a statistic about them.
  console.log('\n  RAW PER-LENS READINGS (best match at each cumulative decoder width):');
  for (const pr of (r.profiles || []).slice(0, 6)) {
    console.log(`\n    ${pr.name}   [stored ${pr.width}-D]`);
    for (const p of pr.profile) {
      if (p.best == null) { console.log(`      ${p.layer.padEnd(22)} ${String(p.width).padStart(3)}-D   no reading`); continue; }
      console.log(`      ${p.layer.padEnd(22)} ${String(p.width).padStart(3)}-D   ${p.best}${p.isVoid ? '   ← below floor' : ''}`);
    }
    console.log(`      deepest nearest → ${pr.nearest}`);
  }

  console.log('\n  A void is where replenishment has somewhere to go: a pattern placed here is');
  console.log('  new information, not a duplicate of something the substrate already holds.');
  console.log('  Interpretation of WHICH voids matter is the operator\'s — this reports where they are.');
}

main();
