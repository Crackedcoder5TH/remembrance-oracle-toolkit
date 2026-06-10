'use strict';

/**
 * encoder-stack.js — registry + depth-aware composer for the
 * fractal-by-stacking encoder layers.
 *
 * Per the architectural principle: the encoder isn't a fixed
 * function; it's a stack that grows as the substrate finds residual
 * that current layers don't explain.
 *
 *   depth 1 (L1):        structural fractal      29-D
 *   depth 2 (L1+L2):     + lexical waveform     +29-D → 58-D
 *   depth 3 (L1+L2+L3):  + (next encoder)       +29-D → 87-D
 *   ...
 *
 * Each layer encoder is registered with a `seed`: the kind of
 * residual it was designed to explain. The residual monitor (in
 * residual-monitor.js) measures whether activated layers are
 * sufficient, and signals when the stack should grow.
 *
 * Entanglement with the Void compression flow: compression invokes
 * the stack at currentDepth(); if compression finds collisions
 * (residual signal), the stack activates the next registered layer.
 * Encoder spawning is part of compression, not a separate process.
 */

const { toFractalWaveform } = require('./fractal-waveform');
const { toLexicalWaveform } = require('./lexical-waveform');
const { toNumericalWaveform } = require('./numerical-waveform');
const { toSpectralWaveform } = require('./spectral-waveform');

const DEFAULT_DEPTH = 2;

// ── Registry ────────────────────────────────────────────────────
// Layers are ordered; each entry has:
//   - id:    short name
//   - dims:  output dimensionality
//   - encode: function(text) -> Float64Array of `dims` values
//   - seed:  description of the residual this layer was designed
//            to explain (used by the residual monitor to choose
//            the next layer to activate)
//   - active: whether the layer is currently in use

const _registry = [
  {
    id: 'L1-structural',
    dims: 29,
    encode: toFractalWaveform,
    seed: 'baseline: atomic properties + structural histograms + structurality',
    active: true,
  },
  {
    id: 'L2-lexical',
    dims: 29,
    encode: toLexicalWaveform,
    seed: 'residual L1 missed: naming conventions, vocabulary entropy, formatting, stylistic markers, content type',
    active: true,
  },
  {
    id: 'L3-numerical',
    dims: 29,
    encode: toNumericalWaveform,
    seed: 'residual L1+L2 missed: numeric statistics, sequence dynamics (autocorr, slope, monotonicity), distribution shape (tail heaviness, log-scale), structural sequence (char entropy, periodic patterns), domain markers (timestamp/ratio/coordinate). Designed from the residual monitor surfacing cascade/*+validation/* collapse on JSON-serialized number arrays.',
    active: true,
  },
  {
    id: 'L4-spectral',
    dims: 29,
    encode: toSpectralWaveform,
    seed: 'residual L1+L2+L3 missed: WITHIN-numerical-domain confusion (cascade/* weather, crypto, econ all read as one signature at L3 because L3 captures shape statistics not frequency content). L4 extracts FFT-derived energy distribution across 8 log-frequency bins, spectral shape (centroid, spread, flatness, roll-off), multi-lag autocorrelation (lags 2,4,8,16,32), non-stationarity (variance ratio, trend strength, detrended residual, piecewise heterogeneity, largest gap), and spectral domain markers (1/f-noise-likeness, white-noise-likeness, daily and weekly period spikes). Designed to distinguish weather oscillation from crypto random-walk from economic drift from analytical curves.',
    active: true,
  },
  // L5+ slots reserved.
];

function currentDepth() {
  return _registry.filter(l => l.active).length;
}

function maxAvailableDepth() {
  return _registry.length;
}

function activeLayers() {
  return _registry.filter(l => l.active).map(l => ({ id: l.id, dims: l.dims, seed: l.seed }));
}

/**
 * Activate the next registered-but-inactive layer. Returns the
 * layer that was activated, or null if no more available.
 */
function activateNextLayer() {
  const next = _registry.find(l => !l.active);
  if (!next) return null;
  next.active = true;
  return { id: next.id, dims: next.dims, seed: next.seed };
}

/**
 * Register a new layer encoder. Called when a residual analysis
 * surfaces a missing dimension and a new encoder is designed.
 */
function registerLayer({ id, dims, encode, seed, active = false }) {
  if (_registry.find(l => l.id === id)) {
    throw new Error('encoder layer already registered: ' + id);
  }
  _registry.push({ id, dims, encode, seed, active });
}

// ── Composer ────────────────────────────────────────────────────

/**
 * Encode at the requested depth. depth=k activates the first k
 * registered layers (regardless of their active flag), concatenates
 * their outputs.
 *
 * @param {string} text
 * @param {number} [depth=currentDepth()]
 * @returns {Float64Array}
 */
function composedAtDepth(text, depth) {
  const k = Number.isFinite(depth) ? Math.min(depth, _registry.length) : currentDepth();
  if (k <= 0) return new Float64Array(0);
  const parts = [];
  let total = 0;
  for (let i = 0; i < k; i++) {
    const v = _registry[i].encode(text);
    parts.push(v);
    total += v.length;
  }
  const out = new Float64Array(total);
  let off = 0;
  for (const v of parts) {
    for (let i = 0; i < v.length; i++) out[off + i] = v[i];
    off += v.length;
  }
  return out;
}

/**
 * Same as composedAtDepth but uses the currently-active depth.
 */
function compose(text) {
  return composedAtDepth(text, currentDepth());
}

/**
 * Cosine between two composed signatures (same depth).
 */
function composedCosine(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function composedCosineOf(textA, textB, depth) {
  return composedCosine(
    composedAtDepth(textA, depth),
    composedAtDepth(textB, depth),
  );
}

module.exports = {
  DEFAULT_DEPTH,
  currentDepth,
  maxAvailableDepth,
  activeLayers,
  activateNextLayer,
  registerLayer,
  composedAtDepth,
  compose,
  composedCosine,
  composedCosineOf,
};
