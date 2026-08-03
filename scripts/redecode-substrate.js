#!/usr/bin/env node
'use strict';

/**
 * redecode-substrate — unfold every entry again at the CANONICAL decoder
 * width. Reached through the goggles: `--do redecode [namespace|all] [--apply]`.
 *
 * WHY
 *
 * currentDepth() is 8 → 232-D. The substrate holds entries at 116-D (depth 4)
 * and 145-D (depth 5) because they were written when those were the widths in
 * use. Readings now span the full waveform, so a full-width query is being
 * compared against half-width memory, and the four deepest layers —
 * L5-redundancy, L6-content-projection, L7-dimensional, L8-dynamical — have
 * nothing to match against on those entries.
 *
 * This re-unfolds each artifact through the canonical decoder and stores the
 * result. It does NOT recompute coherency: coherency comes off the compressor
 * reading the artifact's bytes and is unchanged by how many lens axes the
 * decoder separates it into. Existing readings are carried through untouched.
 *
 * NO TIME DIMENSION IS READ OR WRITTEN. Entries are processed in whatever
 * order the index yields; nothing is ordered by ingest sequence, no ledger
 * time is consulted, and the ledger block on each entry is carried through
 * unmodified.
 *
 * Dry-run by default; --apply writes. Checkpoints every N so an interrupted
 * run keeps what it unfolded and a re-run resumes.
 */

const fs = require('node:fs');
const path = require('node:path');
const { composedAtDepth, currentDepth, flowCheckpoints } = require('../src/core/decoder-stack');

const INDEX_PATH = process.env.SUBSTRATE_PATH
  || path.join(process.env.HARVEST_HOME || '/home/user',
    'Void-Data-Compressor', 'pattern_index_fractal.json');
const CONTENT_CAP = 64000;
const CHECKPOINT_EVERY = Number(process.env.REDECODE_CHECKPOINT_EVERY || 500);

/** Absolute path of the artifact this entry was unfolded from, or null. */
function sourcePathOf(key, entry) {
  if (!entry || !entry.ingested_from) return null;
  const rel = key.slice(key.indexOf('/') + 1);
  return path.join(entry.ingested_from, rel);
}

function main() {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const target = argv.find((a) => !a.startsWith('--')) || 'all';

  const depth = currentDepth();
  const width = flowCheckpoints().slice(-1)[0];

  let idx;
  try { idx = JSON.parse(fs.readFileSync(INDEX_PATH, 'utf8')); }
  catch (e) { console.error(`cannot read substrate at ${INDEX_PATH}: ${e.message}`); process.exit(1); }
  const index = idx.index || {};

  console.log(`REDECODE — canonical depth ${depth} (${width}-D)`);
  console.log(`  scope: ${target}${apply ? '' : '   [DRY RUN — nothing written]'}\n`);

  let already = 0, done = 0, gone = 0, tooSmall = 0, failed = 0, sinceCkpt = 0, ckpts = 0;
  const keys = Object.keys(index);

  const checkpoint = () => {
    if (!apply) return;
    try {
      const tmp = INDEX_PATH + '.redecode.tmp';
      fs.writeFileSync(tmp, JSON.stringify(idx));
      fs.renameSync(tmp, INDEX_PATH);
      ckpts++;
      console.log(`  … checkpoint ${ckpts}: ${done} re-decoded`);
    } catch (e) { console.error(`  checkpoint failed (continuing): ${e.message}`); }
  };

  for (const key of keys) {
    if (target !== 'all' && !key.startsWith(target + '/')) continue;
    const entry = index[key];
    if (!entry) continue;

    const cur = entry.composed_v2 || entry.composed_v1;
    if (Array.isArray(cur) && cur.length >= width) { already++; continue; }

    const src = sourcePathOf(key, entry);
    if (!src || !fs.existsSync(src)) { gone++; continue; }

    let content;
    try { content = fs.readFileSync(src, 'utf8').slice(0, CONTENT_CAP); }
    catch { gone++; continue; }
    if (content.length < 60) { tooSmall++; continue; }

    let vec;
    try { vec = Array.from(composedAtDepth(content, depth)); }
    catch (e) { failed++; continue; }
    if (!vec.length) { failed++; continue; }

    if (apply) {
      // The canonical waveform, under its own name. composed_v1/composed_v2
      // are left in place: they are what the older readings were taken
      // against, and deleting them would erase the ability to tell a
      // width-boundary difference from a real one.
      entry.composed = vec;
      entry.composed_width = vec.length;
      entry.decoded_depth = depth;
    }
    done++;
    if (++sinceCkpt >= CHECKPOINT_EVERY) { sinceCkpt = 0; checkpoint(); }
  }

  console.log(`\n  re-decoded:        ${done}`);
  console.log(`  already canonical: ${already}`);
  if (gone) console.log(`  source gone:       ${gone}  (entry kept, still at its old width)`);
  if (tooSmall) console.log(`  below floor:       ${tooSmall}`);
  if (failed) console.log(`  decode failed:     ${failed}`);
  if (ckpts) console.log(`  checkpoints:       ${ckpts}`);

  if (!apply) {
    console.log('\n  dry run — nothing written. Re-run with --apply.');
    return;
  }
  idx.ingestion_log = idx.ingestion_log || [];
  idx.ingestion_log.push({
    at: new Date().toISOString(), redecoded: done, depth, width,
    tool: 'redecode-substrate',
    note: 'unfolded again at the canonical decoder width; coherency readings untouched',
  });
  const tmp = INDEX_PATH + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(idx));
  fs.renameSync(tmp, INDEX_PATH);
  console.log(`\n  written → ${INDEX_PATH}`);
}

main();
