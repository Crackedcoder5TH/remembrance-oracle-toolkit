#!/usr/bin/env node
'use strict';

/**
 * fit-whitening-reference — fit the ONE resonance space and cache it.
 *
 * The reference (src/core/whitening-reference.js) is eight per-layer 29×29
 * ZCA transforms fitted on the canonical substrate: every store row (via
 * src/core/store-export.js) plus every index entry at the canonical width
 * (via the library). The core module must not require the library — that
 * closed a lexical cycle decoder-stack → reference → library → index →
 * decoder-stack — so the fit lives here, and the module invokes this script
 * as a child process when its cache is missing or stale (store sha changed).
 *
 *   node scripts/fit-whitening-reference.js          fit (no-op when the cache is current)
 *   node scripts/fit-whitening-reference.js --force  refit
 *   node scripts/fit-whitening-reference.js --status the reference in force
 *
 * Reached through the goggles: `--do whiten [--force | --status]`.
 */

const fs = require('node:fs');
const path = require('node:path');
const { createGate, requireGate } = require('../src/core/covenant-fractal');
const REF = require('../src/core/whitening-reference');
const { participationRatio } = require('../src/core/whitening');

// The one write — the cached reference under .remembrance/ — goes through the covenant gate.
const _writeCache = requireGate((gate, file, data) => fs.writeFileSync(file, data));
const _sealedGate = () => createGate().seal({
  charge: 0, valence: 1, mass: 'light', spin: 'even', phase: 'solid',
  reactivity: 'inert', electronegativity: 0.3, group: 18, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'utility',
});

const FIT_SAMPLE = 60000;

/** The substrate index's canonical vectors, through the library (one loader). */
function indexVectors() {
  const { VoidLibrary } = require('../src/core/void-library');
  const lib = new VoidLibrary();
  lib._ensureLoaded();
  const out = [];
  for (const [name, vec] of (lib._composed || new Map())) {
    if (!name.startsWith('store/')) out.push(vec);   // store rows come from the store itself
  }
  return out;
}
indexVectors.atomicProperties = { charge: 1, valence: 1, mass: "medium", spin: "even", phase: "solid", reactivity: "inert", electronegativity: 1, group: 10, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Store rows (a strided sample up to FIT_SAMPLE) at the canonical width. */
function storeRows() {
  const { loadStore } = require('../src/core/store-export');
  const s = loadStore();
  if (s.error) return { rows: [], width: 0, sha: null, error: s.error };
  const rows = [];
  const step = Math.max(1, Math.floor(s.rows / FIT_SAMPLE));
  for (let i = 0; i < s.rows && rows.length < FIT_SAMPLE; i += step) rows.push(s.data.subarray(i * s.width, (i + 1) * s.width));
  return { rows, width: s.width, sha: s.sha, error: null };
}
storeRows.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 1, group: 10, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Fit the reference on the canonical substrate and write the cache. */
function fitReference() {
  const store = storeRows();
  const index = indexVectors();
  const width = store.width || (index.length ? index[0].length : 0);
  const rows = [...store.rows, ...index.filter((v) => v.length === width)];
  if (!width || rows.length < REF.LAYER_DIM * 4) return null;
  const layers = REF.fitLayers(rows, width);
  const ref = {
    key: `${store.sha || 'nostore'}:${index.length}:${width}`,
    width, layers,
    fitted: { store: store.rows.length, index: index.filter((v) => v.length === width).length, rows: rows.length, epsilon: REF.EPSILON, at: new Date().toISOString() },
    storeError: store.error,
  };
  const sample = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 4000)) === 0).map((v) => Array.from(v));
  ref.pr = { raw: participationRatio(sample), whitened: participationRatio(sample.map((v) => Array.from(REF.whitenComposed(v, ref)))) };
  fs.mkdirSync(path.dirname(REF.CACHE_PATH), { recursive: true });
  _writeCache(_sealedGate(), REF.CACHE_PATH, JSON.stringify(ref));
  return ref;
}
fitReference.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 13, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes('--status')) { console.log(JSON.stringify(REF.status(), null, 1)); return 0; }
  if (!argv.includes('--force')) {
    const cur = REF.cached();
    if (cur) { console.log(`reference current — ${cur.layers.length} layers × ${REF.LAYER_DIM}-D, fitted ${cur.fitted.rows} rows (${cur.fitted.at})`); return 0; }
  }
  const ref = fitReference();
  if (!ref) { console.error('nothing to fit on: no store and no index on this host — the resonance space is RAW here'); return 1; }
  console.log(`fitted ${ref.layers.length} layers × ${REF.LAYER_DIM}-D on ${ref.fitted.rows} rows (${ref.fitted.store} store + ${ref.fitted.index} index) · participation ratio raw ${ref.pr.raw.toFixed(1)} → whitened ${ref.pr.whitened.toFixed(1)} of ${ref.width} · cached at ${REF.CACHE_PATH}`);
  return 0;
}
main.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

if (require.main === module) process.exit(main());
module.exports = { fitReference, indexVectors, storeRows };
