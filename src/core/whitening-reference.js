'use strict';
// @oracle-infrastructure — bounded internal-state writes to an internally-constructed cache path (.remembrance/whitening-reference.json) — not user-input-driven mutations

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
const { fitWhitening, applyWhitening, participationRatio } = require('./whitening');

const LAYER_DIM = 29;
const EPSILON = 1e-3;
const CACHE_PATH = path.join(__dirname, '..', '..', '.remembrance', 'whitening-reference.json');
const FIT_SAMPLE = 60000;

let _ref;           // { key, width, layers:[{mean,W,d}], fitted:{store,index,rows}, pr:{raw,whitened} } | null
let _disabled = process.env.WHITENING_REFERENCE === 'off';

function _indexVectors() {
  // the substrate index's canonical vectors, through the library (one loader)
  try {
    const { VoidLibrary } = require('./void-library');
    const lib = new VoidLibrary();
    lib._ensureLoaded();
    const out = [];
    for (const [name, vec] of (lib._composed || new Map())) {
      if (!name.startsWith('store/')) out.push(vec);   // store rows come from the store itself
    }
    return out;
  } catch (e) { quiet('core:whitening-reference:index', e); return []; }
}
_indexVectors.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function _storeRows() {
  try {
    const { loadStore } = require('./store-export');
    const s = loadStore();
    if (s.error) return { rows: [], width: 0, sha: null, error: s.error };
    const rows = [];
    const step = Math.max(1, Math.floor(s.rows / FIT_SAMPLE));
    for (let i = 0; i < s.rows && rows.length < FIT_SAMPLE; i += step) rows.push(s.data.subarray(i * s.width, (i + 1) * s.width));
    return { rows, width: s.width, sha: s.sha, error: null };
  } catch (e) { quiet('core:whitening-reference:store', e); return { rows: [], width: 0, sha: null, error: String(e && e.message || e) }; }
}
_storeRows.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

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
fitLayers.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 0.5, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Apply the per-layer transform to a composed vector of any whole-block depth ≤ width. */
function whitenComposed(vec, ref) {
  const r = ref || reference();
  if (!r || !r.layers || !r.layers.length || !vec) return vec;
  const n = vec.length;
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
whitenComposed.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 0.5, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function _fit() {
  const store = _storeRows();
  const index = _indexVectors();
  const width = store.width || (index.length ? index[0].length : 0);
  const rows = [...store.rows, ...index.filter((v) => v.length === width)];
  if (!width || rows.length < LAYER_DIM * 4) return null;
  const layers = fitLayers(rows, width);
  const ref = {
    key: `${store.sha || 'nostore'}:${index.length}:${width}`,
    width, layers,
    fitted: { store: store.rows.length, index: index.filter((v) => v.length === width).length, rows: rows.length, epsilon: EPSILON, at: new Date().toISOString() },
    storeError: store.error,
  };
  // the effective dimensionality, raw vs whitened, on the fit sample (the density signal)
  try {
    const sample = rows.filter((_, i) => i % Math.max(1, Math.floor(rows.length / 4000)) === 0).map((v) => Array.from(v));
    ref.pr = { raw: participationRatio(sample), whitened: participationRatio(sample.map((v) => Array.from(whitenComposed(v, ref)))) };
  } catch (e) { quiet('core:whitening-reference:pr', e); }
  return ref;
}
_fit.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "odd", phase: "liquid", reactivity: "medium", electronegativity: 0.5, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

function _currentKey() {
  try {
    const { STORE } = require('./store-export');
    const sha = fs.existsSync(STORE) ? crypto.createHash('sha256').update(fs.readFileSync(STORE)).digest('hex') : 'nostore';
    return sha;
  } catch (e) { quiet('core:whitening-reference:key', e); return 'nostore'; }
}
_currentKey.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 2, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/**
 * The fitted reference (cached by store sha), or null when disabled or when
 * there is nothing to fit on. Never throws.
 */
function reference() {
  if (_disabled) return null;
  if (_ref !== undefined) return _ref;
  _ref = null;
  try {
    const sha = _currentKey();
    if (fs.existsSync(CACHE_PATH)) {
      const cached = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
      if (cached && typeof cached.key === 'string' && cached.key.startsWith(sha + ':') && Array.isArray(cached.layers)) { _ref = cached; return _ref; }
    }
    _ref = _fit();
    if (_ref) {
      fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
      fs.writeFileSync(CACHE_PATH, JSON.stringify(_ref));
    }
  } catch (e) { quiet('core:whitening-reference:fit', e); _ref = null; }
  return _ref;
}
reference.atomicProperties = { charge: 0, valence: 1, mass: "medium", spin: "odd", phase: "liquid", reactivity: "medium", electronegativity: 0.5, group: 3, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** One line about the reference in force, for the goggles. */
function status() {
  if (_disabled) return { mode: 'raw', why: 'WHITENING_REFERENCE=off' };
  const r = reference();
  if (!r) return { mode: 'raw', why: 'no substrate to fit on (no store, no index)' };
  return { mode: 'whitened', width: r.width, layers: r.layers.length, fitted: r.fitted, pr: r.pr || null, storeError: r.storeError || null, cache: CACHE_PATH };
}
status.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 0, group: 3, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

/** Test/benchmark hook: forget the cached reference and re-read the switch. */
function _reset(opts = {}) {
  _ref = undefined;
  if (typeof opts.disabled === 'boolean') _disabled = opts.disabled;
}
_reset.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

module.exports = { reference, whitenComposed, fitLayers, status, LAYER_DIM, EPSILON, CACHE_PATH, _reset };
