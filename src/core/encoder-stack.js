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
const { toRedundancyWaveform } = require('./redundancy-waveform');
const { toContentProjection } = require('./content-projection');
const { toDimensionalWaveform } = require('./dimensional-waveform');

const DEFAULT_DEPTH = 2;

// ── Registry ────────────────────────────────────────────────────
// Layers are ordered; each entry has:
//   - id:    short name
//   - dims:  output dimensionality
//   - encode: function(input) -> Float64Array of `dims` values
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
  {
    id: 'L5-redundancy',
    dims: 29,
    encode: toRedundancyWaveform,
    seed: 'residual L1-L4 leave against an EXTERNAL reference: the four-telescope convergence experiment showed gzip NCD (Kolmogorov approximation) sees domain structure better than the depth-4 stack (kNN purity 0.774 vs 0.528, Spearman 0.731). The gap: (1) redundancy character — how much of a pattern is repetition of itself, the one quantity a dictionary compressor is built to measure and no earlier layer asks about; (2) content identity — WHICH tokens, not just what kinds; the stack is deliberately content-blind. L5 imports the compressor as a sensor: deflate-derived redundancy features (whole/halves/internal-NCD/level-spread), n-gram repetition structure, byte entropy, and a 16-bucket hashed vocabulary sketch. First layer designed against an external instrument rather than internal residual. INACTIVE until it proves itself via the convergence loop and the 116-D consumers (Void parity, field-tool round-trip, classifier DIM map) are deliberately migrated — reachable now via composedAtDepth(text, 5). ACTIVATED after the depth-agnostic index migration (both FractalIndex copies zero-pad and clamp to MAX_DEPTH=5) and the partial Void composed_v2 re-encode.',
    active: true,
  },
  {
    id: 'L6-content-projection',
    dims: 29,
    encode: toContentProjection,
    seed: 'residual L1-L5 leave: CONTENT IDENTITY. The residual monitor at depth 5 surfaced its last unexplained residual as false-equivalence between distinct sources of similar shape — two prose docs, two different functions, two distinct numeric series — because the structural stack (L1-L4) is content-blind by design and L5 reads redundancy, not subject. The four-telescope experiment localized the missing signal: the gzip-NCD (compression) telescope sees domain/content structure the structural stack does not (kNN domain purity: stack 0.60 vs gzip 0.83). L6 imports that view by PATTERN PROJECTION onto a fixed compression basis — each coordinate is 1-NCD against a canonical landmark pattern, mean-centered so the discriminating relative profile is the signal. CALIBRATED, not asserted: scripts/encoder-layer-calibration.cjs confirms L6 moves the fractal telescope toward the gzip telescope — Spearman 0.778 → ~0.81 and kNN purity 0.60 → 0.71 with FIXED landmarks, closing over half the structure-to-compression gap. This is the layer the attribution use-case requires: you cannot track a pattern back to its source if the encoder cannot tell two sources apart. INACTIVE pending the deliberate composed_v3 migration (same discipline as L5 before its activation): reachable now via composedAtDepth(text, 6); activating it re-encodes the 116/145-D consumers to 174-D. ACTIVATED (Phase 1 — encoder): the calibration harness (scripts/encoder-layer-calibration.cjs) confirms L6 EARNS its place — kNN domain purity 0.6286 → 0.7195 (Δ+0.091) and agreement with the gzip/deflate telescopes 0.786 → 0.829 (converges, not overfits). The encoder now composes at depth 7 (compose() = 203-D). CODE PATH MIGRATED: both FractalIndex copies are MAX_DEPTH=7, the flow scorer\'s deepest score (d4) now consumes every active layer at the shared whole-block depth, the published field-tool package is byte-identical at depth 7, and the export round-trip carries 203-D — all inert on legacy 116-D vectors (they compare at their shared depth) so nothing regresses. The ONLY remaining step is the DATA re-encode: pattern_index_fractal.json still stores composed_v1 (116-D), so the 47k substrate lights up L5-L7 once regenerated to composed_v3/v4 (203-D), after which field-tool queries flip to the active depth. Stated plainly: until that data re-encode, the coin path scores at the shared depth 4.',
    active: true,
  },
  {
    id: 'L7-dimensional',
    dims: 29,
    encode: toDimensionalWaveform,
    seed: 'residual L1-L6 leave: the SECOND DIMENSION. L1-L6 are dominantly 1D — they read the data as a sequence. Absent from the stack is autoregressive / row-to-row structure, the property that makes two different series of the same generative process kin despite different values (a 1D compressor scatters them; a 2D predictive filter clusters them). The telescope-2d experiment confirmed this axis is real and independent of gzip (Spearman 0.34, purity 0.67 vs chance 0.15). L7 imports it, SELF-GATED on intrinsic dimensionality: it parses a numeric series out of the text (the substrate stores series as text — the 2D structure is in the VALUES, not the digit bytes), detects the period by autocorrelation (as L4 does), reshapes to a PERIOD-MATCHED grid (a fixed sqrt-width misses arbitrary-period structure — a sine of period 44 gives gain 0 at width 20, gain 0.24 at width 44), and emits a 2D-NCD projection onto numeric archetypes SCALED BY THE 2D-GAIN. Text/code/non-series input has zero gain → L7 contributes nothing and defers to L1-L6; periodic numeric data contributes fully; hybrid proportionally. This is the layer that answers "know where the data becomes 2D." Under the multi-telescope consensus (now including the 2D-Paeth telescope) the self-gated 2D layer earns its place where every flat 1D candidate was refused — it adds signal only where 2D structure exists and stays neutral elsewhere. First build was silent on real data (fixed-width, byte-level) — caught by testing text-encoded numbers; the period-aware, parse-first version fires (sine 0.24, modulated 0.37) and stays silent on code/prose (0.0). INACTIVE pending the deliberate composed_v4 migration (same discipline as L5/L6): reachable via composedAtDepth(text, 7). ACTIVATED (Phase 1 — encoder) as the seventh layer — the START of the 2D axis in the live encoder. This is the SELF-GATED dimensional layer (toDimensionalWaveform), NOT the "L7-by-projection" candidate the calibration harness rejected for overfitting: it is neutral (zero gain) on text/code/prose and fires only where genuine 2D/series structure exists, so it cannot degrade the 1D discrimination that L1-L6 already earn — held-out check: depth-7 kNN purity 0.226 → 0.233, never below depth-6. The 2D layer is now part of the composed encoder (compose() = depth 7 / 203-D); its discriminative payoff on series data lands in the coin path with the composed_v4 substrate re-encode + flow-scorer extension (Phase 2).',
    active: true,
  },
  // L8+ slots reserved.
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
 * @param {string} input  the serialized signal to encode — source text OR a
 *   retained waveform/series. NOT necessarily source: the substrate feeds the
 *   compressed representation, never original text. (See Void AGENTS.md.)
 * @param {number} [depth=currentDepth()]
 * @returns {Float64Array}
 */
function composedAtDepth(input, depth) {
  const k = Number.isFinite(depth) ? Math.min(depth, _registry.length) : currentDepth();
  if (k <= 0) return new Float64Array(0);
  const parts = [];
  let total = 0;
  for (let i = 0; i < k; i++) {
    const v = _registry[i].encode(input);
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
function compose(input) {
  return composedAtDepth(input, currentDepth());
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
