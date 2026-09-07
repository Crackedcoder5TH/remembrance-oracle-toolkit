'use strict';

/**
 * whitening-reference.js — the transform that lets resonance discriminate.
 *
 * WHAT WAS WRONG. whitening.js (ZCA, fitted on the substrate) existed since
 * 2026-08-01 with one consumer: the density factor. Every resonance path —
 * decoder-stack.composedCosine / flowCosines, FractalIndex.searchFlow, the
 * library's scoreWithFlow behind the goggles' META lens, Void's resonance
 * detector — took cosines on RAW composed vectors. The raw vectors live in a
 * narrow cone (participation ratio ~6 of 116), so everything read CONSONANT
 * 0.9+, 100% of domain pairs "resonated" at 0.9998, and the contracts that
 * pin separability (C-60/C-61) fell to 0 and 29 points. The transform was
 * also fitted at 116-D (composed_v1, depth 4) from an index that had lost
 * its 45k patterns to the store on 2026-08-04.
 *
 * WHAT THIS IS. One reference, fitted on the canonical substrate — every
 * store row (45,547 × 232-D via src/core/store-export.js) plus every index
 * entry at the canonical width — PER LAYER BLOCK: eight independent 29×29
 * ZCA transforms, one for each active decoder layer. Per block, not one
 * 232×232, so the depth-flow checkpoints [29, 58, …, 232] keep their meaning
 * (whitening a whole vector would mix L8 into L1 and the flow would read a
 * blend). The reference is cached by store sha + index census and refitted
 * when either changes.
 *
 * WHO FITS IT. scripts/fit-whitening-reference.js (goggles --do whiten): this
 * module only reads the cache and spawns the fitter when it is missing or
 * stale, because requiring the library from here closed a lexical cycle.
 *
 * WHERE IT IS APPLIED. decoder-stack.composedCosine and flowCosines whiten
 * both sides before the cosine; FractalIndex whitens at rebuild/add and at
 * query. Every consumer discriminates at once. Void's detector applies the
 * same reference (exported as JSON) before correlating domain signatures.
 *
 * HONESTY. `WHITENING_REFERENCE=off` disables it (the raw cone, for
 * comparison and for the benchmark's before/after); a host without the
 * store falls back to fitting on the index alone and says so in status();
 * a host with neither returns identity, and status() says "raw".
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { quiet } = require('./quiet');
const { fitWhitening, applyWhitening } = require('./whitening');
const LAYER_DIM = 29;
const RETIRED_WIDTH = 256;   // the byte waveform that was tried, found wrong, retired
const EPSILON = 1e-3;
const CACHE_PATH = path.join(__dirname, '..', '..', '.remembrance', 'whitening-reference.json');

let _ref;           // { key, width, layers:[{mean,W,d}], fitted:{store,index,rows}, pr:{raw,whitened} } | null
let _disabled = process.env.WHITENING_REFERENCE === 'off';

/** Fit one 29×29 ZCA per layer block over rows of the canonical width. */
function fitLayers(rows, width) {
  const blocks = Math.floor(width / LAYER_DIM);
  const layers = [];
  for (let b = 0; b < blocks; b++) {
    const X = rows.map((v) => { const o = new Array(LAYER_DIM); for (let i = 0; i < LAYER_DIM; i++) o[i] = v[b * LAYER_DIM + i] || 0; return o; });
    const t = fitWhitening(X, { epsilon: EPSILON });
    layers.push({ mean: t.mean, W: t.W, d: t.d });
  }
  return layers;
}
fitLayers.atomicProperties = { charge: 1, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 1, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Apply the per-layer transform to a composed vector of any whole-block depth ≤ width. */
function whitenComposed(vec, ref) {
  const r = ref || reference();
  if (!r || !r.layers || !r.layers.length || !vec) return vec;
  const n = vec.length;
  // The retired 256-D byte waveform is not a decoder vector: it has no
  // layers to whiten. Refused here so it can never be dressed as one.
  if (n === RETIRED_WIDTH) { quiet('core:whitening-reference:retired-width', new Error('256-D waveform refused')); return vec; }
  const out = new Float64Array(n);
  const blocks = Math.min(r.layers.length, Math.floor(n / LAYER_DIM));
  for (let b = 0; b < blocks; b++) {
    const seg = new Array(LAYER_DIM);
    let any = false;
    for (let i = 0; i < LAYER_DIM; i++) { seg[i] = vec[b * LAYER_DIM + i] || 0; if (seg[i] !== 0) any = true; }
    // An all-zero block is PADDING (FractalIndex pads shallower patterns to
    // MAX_DEPTH); whitening it would fabricate a layer the pattern never had.
    if (!any) continue;
    const w = applyWhitening(seg, r.layers[b]);
    for (let i = 0; i < LAYER_DIM; i++) out[b * LAYER_DIM + i] = w[i];
  }
  for (let i = blocks * LAYER_DIM; i < n; i++) out[i] = vec[i] || 0;   // a partial trailing block stays raw
  return out;
}
whitenComposed.atomicProperties = { charge: 1, valence: 0, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function _currentKey() {
  try {
    const { STORE } = require('./store-export');
    const sha = fs.existsSync(STORE) ? crypto.createHash('sha256').update(fs.readFileSync(STORE)).digest('hex') : 'nostore';
    return sha;
  } catch (e) { quiet('core:whitening-reference:key', e); return 'nostore'; }
}
_currentKey.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 1, group: 10, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** The cached reference when it matches the store on this host, else null. Never fits. */
function cached() {
  try {
    if (!fs.existsSync(CACHE_PATH)) return null;
    const doc = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
    if (doc && typeof doc.key === 'string' && doc.key.startsWith(_currentKey() + ':') && Array.isArray(doc.layers)) return doc;
  } catch (e) { quiet('core:whitening-reference:cache', e); }
  return null;
}
cached.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "solid", reactivity: "medium", electronegativity: 0, group: 6, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * The reference in force, or null when disabled or when there is nothing to
 * fit on. Reads the cache; when the cache is missing or stale (the store
 * changed) it runs scripts/fit-whitening-reference.js as a CHILD PROCESS —
 * a process boundary, not a require, because the fitter needs the library
 * and the library's search engine needs this module (the lexical cycle the
 * cycle ratchet refused). Never throws.
 */
function reference() {
  if (_disabled) return null;
  if (_ref !== undefined) return _ref;
  _ref = cached();
  if (_ref) return _ref;
  try {
    const { execFileSync } = require('node:child_process');
    execFileSync(process.execPath, [path.join(__dirname, '..', '..', 'scripts', 'fit-whitening-reference.js')],
      { stdio: ['ignore', 'ignore', 'ignore'], timeout: 15 * 60 * 1000 });
    _ref = cached();
  } catch (e) { quiet('core:whitening-reference:fit', e); _ref = null; }
  return _ref;
}
reference.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 1, group: 9, period: 2, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };

/** One line about the reference in force, for the goggles. */
function status() {
  if (_disabled) return { mode: 'raw', why: 'WHITENING_REFERENCE=off' };
  const r = reference();
  if (!r) return { mode: 'raw', why: 'no substrate to fit on (no store, no index)' };
  return { mode: 'whitened', width: r.width, layers: r.layers.length, fitted: r.fitted, pr: r.pr || null, storeError: r.storeError || null, cache: CACHE_PATH };
}
status.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "solid", reactivity: "inert", electronegativity: 0, group: 9, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Test/benchmark hook: forget the cached reference and re-read the switch. */
function _reset(opts = {}) {
  _ref = undefined;
  if (typeof opts.disabled === 'boolean') _disabled = opts.disabled;
}
_reset.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 2, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { reference, cached, whitenComposed, fitLayers, status, LAYER_DIM, EPSILON, CACHE_PATH, _reset };
