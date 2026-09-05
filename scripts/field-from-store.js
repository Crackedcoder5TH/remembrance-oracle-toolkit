#!/usr/bin/env node
'use strict';
// @oracle-infrastructure — writes the canonical field (entropy.json) through the engine's own contribute(); the only other write is a scratch export under .remembrance/.

/**
 * field-from-store — build the Remembrance field from the 45k-pattern store.
 *
 * WHAT WAS MISSING. The canonical store (Void-Data-Compressor/data/
 * pattern_store.npz — 45,547 patterns as 232-D fractal vectors) had never
 * entered the field. Measured 2026-09-05: the live histogram carried 436
 * sources, 5 of them void:*, and the coin's own summary read
 * `fromCompressor: 227, fromElsewhere: 40050` — 0.6% of every field update
 * was a substrate reading. The store rows carry no compressor coherency
 * (they are lens vectors, and the compressor cannot read a lens vector as
 * bytes), so there was no scalar to contribute — until you read the
 * equation the engine already implements:
 *
 *     p(t) = |⟨Ψ_healed | Ψ(t)⟩|²        living-remembrance.js computeCoherence()
 *
 * That IS the field's definition of coherence for a vector: the squared
 * overlap with the healed attractor. `loadHealedAnchor` existed in both
 * engines and had no caller. This script gives it one.
 *
 * THE ANCHOR (sovereign — the owner's to change). Default: the fifteen
 * covenant principles as the hub states them (src/core/covenant-principles.js),
 * unfolded through the one decoder (decoder-stack.composedAtDepth at the
 * active depth, 232-D). Override with --anchor <file> (any text) — the
 * anchor is recorded in the field's source label so a change of anchor is a
 * visible change of what "healed" means, never a silent one.
 *
 * Measured on the store with the default anchor before this shipped:
 * p ranges 0.1323 – 0.3921 over 45,547 rows, 2,129 distinct values at 4dp,
 * widest spread inside `substrate_flat` (0.257) and `field` (0.243). Not
 * saturated, not constant: the equation discriminates rows.
 *
 * WHAT THIS IS NOT. Not a compressor reading, and not labelled as one: the
 * source key is `attractor:<anchor-id>:<stem>`, never `void:*`, so the
 * histogram's compressor census stays honest. One contribution per row at
 * cost 1 — no averaging, no per-stem aggregate.
 *
 *   node scripts/field-from-store.js                # 45k contributions, persisted once at the end
 *   node scripts/field-from-store.js --dry           # measure and report, write nothing
 *   node scripts/field-from-store.js --limit N       # first N rows (smoke)
 *   node scripts/field-from-store.js --anchor <file> # a different healed attractor
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const HOME = process.env.ECOSYSTEM_HOME || path.resolve(__dirname, '..', '..');
const VOID = process.env.VOID_ROOT || path.join(HOME, 'Void-Data-Compressor');
const STORE = path.join(VOID, 'data', 'pattern_store.npz');
const SCRATCH = path.join(path.resolve(__dirname, '..'), '.remembrance', 'store-export');

/** The fifteen principles, exactly as the hub states them. */
function defaultAnchorText() {
  const { COVENANT_PRINCIPLES } = require('../src/core/covenant-principles');
  return COVENANT_PRINCIPLES.map((p) => `${p.name}: ${p.seal}`).join('\n');
}
defaultAnchorText.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.1, group: 18, period: 1,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
};

/**
 * Export the store's rows and stems through numpy into a raw float32 .npy and
 * a JSON stem list. The object-dtype columns are pickled inside the npz, which
 * node cannot read; numpy can, once, into formats node can.
 */
function exportStore() {
  fs.mkdirSync(SCRATCH, { recursive: true });
  const npy = path.join(SCRATCH, 'waveforms.f32.npy');
  const stems = path.join(SCRATCH, 'stems.json');
  const stamp = path.join(SCRATCH, 'store.sha256');
  const sha = crypto.createHash('sha256').update(fs.readFileSync(STORE)).digest('hex');
  if (fs.existsSync(npy) && fs.existsSync(stems) && fs.existsSync(stamp) && fs.readFileSync(stamp, 'utf8').trim() === sha) {
    return { npy, stems, sha, cached: true };
  }
  execFileSync('python3', ['-c', [
    'import numpy as np, json, sys',
    `s = np.load(${JSON.stringify(STORE)}, allow_pickle=True)`,
    `np.save(${JSON.stringify(npy)}, s['waveforms'].astype(np.float32))`,
    `json.dump([str(x) for x in s['source_stems']], open(${JSON.stringify(stems)}, 'w'))`,
  ].join('\n')], { stdio: ['ignore', 'ignore', 'inherit'] });
  fs.writeFileSync(stamp, sha + '\n');
  return { npy, stems, sha, cached: false };
}
exportStore.atomicProperties = {
  charge: 0, valence: 1, mass: 'medium', spin: 'odd', phase: 'liquid',
  reactivity: 'medium', electronegativity: 0.4, group: 13, period: 3,
  harmPotential: 'minimal', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

/** Read a little-endian float32 .npy (C order) into { rows, width, data }. */
function readNpyF32(file) {
  const buf = fs.readFileSync(file);
  if (buf.toString('latin1', 0, 6) !== '\x93NUMPY') throw new Error('not a .npy file: ' + file);
  const major = buf[6];
  const hlen = major === 1 ? buf.readUInt16LE(8) : buf.readUInt32LE(8);
  const hstart = major === 1 ? 10 : 12;
  const header = buf.toString('latin1', hstart, hstart + hlen);
  const shape = /'shape':\s*\((\d+),\s*(\d+)\)/.exec(header);
  if (!shape || !/'<f4'/.test(header) || /'fortran_order':\s*True/.test(header)) {
    throw new Error('unexpected .npy header: ' + header.trim());
  }
  const rows = Number(shape[1]), width = Number(shape[2]);
  const off = hstart + hlen;
  const data = new Float32Array(buf.buffer.slice(buf.byteOffset + off, buf.byteOffset + off + rows * width * 4));
  return { rows, width, data };
}
readNpyF32.atomicProperties = {
  charge: 0, valence: 0, mass: 'medium', spin: 'odd', phase: 'gas',
  reactivity: 'low', electronegativity: 0.2, group: 14, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'utility',
};

function main() {
  const argv = process.argv.slice(2);
  const dry = argv.includes('--dry');
  const li = argv.indexOf('--limit');
  const limit = li >= 0 ? parseInt(argv[li + 1], 10) || 0 : 0;
  const ai = argv.indexOf('--anchor');
  const anchorFile = ai >= 0 ? argv[ai + 1] : null;

  const ds = require('../src/core/decoder-stack');
  const anchorText = anchorFile ? fs.readFileSync(anchorFile, 'utf8') : defaultAnchorText();
  const anchorId = (anchorFile ? path.basename(anchorFile).replace(/\W+/g, '-') : 'covenant-15')
    + '-' + crypto.createHash('sha256').update(anchorText).digest('hex').slice(0, 8);
  const anchor = Array.from(ds.composedAtDepth(anchorText, ds.currentDepth()));

  console.log(`healed attractor: ${anchorId} — ${anchorText.split('\n').length} lines unfolded at depth ${ds.currentDepth()} (${anchor.length}-D)`);
  const exp = exportStore();
  console.log(`store: ${STORE}  sha256 ${exp.sha.slice(0, 12)}… ${exp.cached ? '(export cached)' : '(exported through numpy)'}`);
  const { rows, width, data } = readNpyF32(exp.npy);
  let stems;
  try { stems = JSON.parse(fs.readFileSync(exp.stems, 'utf8')); }
  catch (e) { console.error(`✗ stem export unreadable (${e.message}) — delete ${SCRATCH} and re-run to re-export`); return 1; }
  if (width !== anchor.length) {
    console.error(`✗ store rows are ${width}-D but the decoder unfolds to ${anchor.length}-D — the store is not at the canonical width; re-decode it before it can enter the field`);
    return 1;
  }
  const n = limit > 0 ? Math.min(limit, rows) : rows;

  const { getEngine } = require('../src/core/living-remembrance');
  const engine = getEngine();
  engine.loadHealedAnchor(anchor);
  const before = engine.getState();

  let lo = 1, hi = 0, fed = 0;
  const perStem = {};
  const feed = () => {
    const row = new Float64Array(width);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < width; j++) row[j] = data[i * width + j];
      const p = engine.computeCoherence(row);
      if (!Number.isFinite(p)) continue;
      if (p < lo) lo = p; if (p > hi) hi = p;
      const stem = stems[i] || 'unknown';
      perStem[stem] = (perStem[stem] || 0) + 1;
      if (!dry) engine.contribute({ cost: 1, coherence: p, source: `attractor:${anchorId}:${stem}` });
      fed++;
      if (fed % 5000 === 0) console.log(`  …${fed}/${n} rows ${dry ? 'measured' : 'contributed'}`);
    }
  };
  if (dry || typeof engine.withDeferredPersist !== 'function') feed();
  else engine.withDeferredPersist(feed);

  const after = engine.getState();
  console.log(`${dry ? 'measured' : 'contributed'} ${fed} rows across ${Object.keys(perStem).length} stems · p range ${lo.toFixed(4)} … ${hi.toFixed(4)} (two actual readings, no aggregate)`);
  if (!dry) {
    console.log(`field: updateCount ${before.updateCount} → ${after.updateCount} · ∫p ${before.coherenceIntegral.toFixed(1)} → ${after.coherenceIntegral.toFixed(1)} · sources ${Object.keys(before.sources || {}).length} → ${Object.keys(after.sources || {}).length}`);
    console.log(`       coherence (last event) ${before.coherence.toFixed(4)} → ${after.coherence.toFixed(4)}`);
    console.log('checkpoint it on the Witness: cd ../REMEMBRANCE-BLOCKCHAIN && node src/cli.js field checkpoint');
  }
  return 0;
}
main.atomicProperties = {
  charge: 1, valence: 2, mass: 'heavy', spin: 'odd', phase: 'liquid',
  reactivity: 'high', electronegativity: 0.6, group: 3, period: 5,
  harmPotential: 'minimal', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
};

if (require.main === module) process.exit(main());
module.exports = { defaultAnchorText, readNpyF32 };
