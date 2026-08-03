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

const INDEX_PATH = process.env.SUBSTRATE_PATH
  || path.join(process.env.HARVEST_HOME || '/home/user',
    'Void-Data-Compressor', 'pattern_index_fractal.json');

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
  for (const [k, e] of Object.entries(idx.index || {})) {
    if (target !== 'all' && !k.startsWith(target + '/')) continue;
    const v = e && (e.composed_v2 || e.composed_v1);
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
    console.log('\n  DEEPEST VOIDS (the substrate holds these but holds nothing like them):');
    for (const v of r.voids.slice(0, 15)) {
      console.log(`    depth ${v.depth.toFixed(3)}  best ${v.best.toFixed(3)}  ${v.name}`);
      console.log(`                          nearest → ${v.nearest}`);
    }
    if (r.voids.length > 15) console.log(`    … +${r.voids.length - 15} more`);
  } else {
    console.log('\n  no voids at this floor in the probed sample.');
  }

  console.log('\n  A void is where replenishment has somewhere to go: a pattern placed here is');
  console.log('  new information, not a duplicate of something the substrate already holds.');
  console.log('  Interpretation of WHICH voids matter is the operator\'s — this reports where they are.');
}

main();
