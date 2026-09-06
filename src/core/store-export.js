'use strict';

/**
 * store-export.js — the 45k pattern store, readable from node.
 *
 * Void-Data-Compressor/data/pattern_store.npz holds the canonical pattern
 * library: 45,547 patterns as 232-D fractal vectors plus their source stems.
 * The object columns inside the npz are pickled, which node cannot read, so
 * numpy exports them ONCE per store version into formats node can:
 *
 *   <hub>/.remembrance/store-export/waveforms.f32.npy   rows × width float32
 *   <hub>/.remembrance/store-export/stems.json          one stem per row
 *   <hub>/.remembrance/store-export/store.sha256        the store this came from
 *
 * The export is cached by the store's sha256 and rebuilt when the store
 * changes. Two consumers: scripts/field-from-store.js (every row through the
 * field equation) and src/core/void-library.js (every row in the resonance
 * library — the library the goggles' META lens reads).
 *
 * Nothing here measures. Moving vectors is not a reading.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { createGate, requireGate } = require('./covenant-fractal');

const HUB = path.resolve(__dirname, '..', '..');
const HOME = process.env.ECOSYSTEM_HOME || path.resolve(HUB, '..');
const VOID = process.env.VOID_ROOT || path.join(HOME, 'Void-Data-Compressor');
const STORE = path.join(VOID, 'data', 'pattern_store.npz');
const SCRATCH = path.join(HUB, '.remembrance', 'store-export');

// The one write — the export stamp — goes through the covenant gate.
const _writeStamp = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});

/**
 * Export the store's rows and stems through numpy (cached by store sha).
 * @returns {{ npy: string, stems: string, sha: string, cached: boolean }}
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
  _writeStamp(_sealedGate(), stamp, sha + '\n');
  return { npy, stems, sha, cached: false };
}
exportStore.atomicProperties = { charge: 0, valence: 1, mass: "light", spin: "odd", phase: "gas", reactivity: "high", electronegativity: 1, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

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
readNpyF32.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 0, group: 2, period: 3, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * The store as node can hold it: one Float64 buffer of rows × width plus the
 * stems. An error object when the store is not on this host — a library
 * without the store is smaller, never a substitute.
 * @returns {{ rows:number, width:number, data:Float64Array, stems:string[], sha:string }|{ error:string }}
 */
function loadStore() {
  if (!fs.existsSync(STORE)) return { error: `pattern store not on this host: ${STORE}` };
  try {
    const exp = exportStore();
    const { rows, width, data } = readNpyF32(exp.npy);
    const stems = JSON.parse(fs.readFileSync(exp.stems, 'utf8'));
    return { rows, width, data: Float64Array.from(data), stems, sha: exp.sha };
  } catch (e) {
    return { error: `store export failed: ${e && e.message ? e.message : e}` };
  }
}
loadStore.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 0.5, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { exportStore, readNpyF32, loadStore, STORE, SCRATCH };
