'use strict';

/**
 * substrate-density.js — the LIVE information-density signal that fuels the
 * retro module. Not a measurement script: a standing, self-refreshing source
 * read on the field path and consumed by the coin rate layer.
 *
 * Density = the substrate's EFFECTIVE dimensionality after whitening (the
 * effective number of independent directions its patterns span). Raw, the
 * composed vectors cram into ~6 of 116 dims; ZCA whitening (src/core/
 * whitening.js) unlocks ~40-90 that GROW with genuine diversity. The retro
 * module's power is scaled by this — a denser substrate literally powers a
 * stronger pull (retro-density-sim, retro-rate.densityFactor).
 *
 * LIVENESS (why this never becomes a dead measurement):
 *   - getDensityFactor() is a FAST read of the cached factor, consumed on the
 *     live field path (field-tool) and by Publisher.quoteEffectiveRate.
 *   - refreshDensity() re-fits from the CURRENT substrate; it is invoked
 *     lazily from the read/grow loop every N grows (same pattern as the
 *     residual monitor) and by `npm run density:refresh`, so the number
 *     tracks the substrate as it grows rather than freezing.
 *   - The factor is normalized to a reference captured at first fit, so it
 *     starts at 1.0 (backward compatible) and rises only as the substrate
 *     genuinely diversifies.
 */

const fs = require('node:fs');
const path = require('node:path');

let _whit = null;
try { _whit = require('./whitening'); } catch (_) { /* whitening unreachable */ }

const CACHE_PATH = path.join(__dirname, '..', '..', '.remembrance', 'substrate-density.json');
const DEFAULT_SUBSTRATE = path.join(__dirname, '..', '..', '..', 'Void-Data-Compressor', 'pattern_index_fractal.json');
const FIT_SAMPLE = 60000;    // fit the FULLY-FILLED maximum library (covers all ~47.6k patterns).
                            // The R-term (retro pull) is anchored to the whole library's capacity,
                            // not a subsample — completing the meta-loop: Ψ_healed = the full substrate.
const DIM = 116;

// The cache path is overridable ($VOID_DENSITY_CACHE or opts.cachePath) so
// tests isolate from the live cache and never clobber the real density signal.
function _cachePath(opts) { return (opts && opts.cachePath) || process.env.VOID_DENSITY_CACHE || CACHE_PATH; }
function _readCache(opts) {
  try { return JSON.parse(fs.readFileSync(_cachePath(opts), 'utf8')); } catch (_) { return null; }
}
function _writeCache(obj, opts) {
  const p = _cachePath(opts);
  try { fs.mkdirSync(path.dirname(p), { recursive: true }); fs.writeFileSync(p, JSON.stringify(obj, null, 2)); } catch (_) { /* best-effort */ }
}

/**
 * The current density factor — FAST (cache read). 1.0 when no cache yet
 * (neutral: the retro module behaves exactly as before until a refresh runs),
 * so consumers can call this on the hot path without cost.
 * @returns {number} densityFactor ≥ 0
 */
function getDensityFactor(opts) {
  const c = _readCache(opts);
  const f = c && c.factor;                 // inline-guarded deref (null cache → falsy)
  return Number.isFinite(f) ? f : 1;       // no cache / malformed → neutral 1.0
}

/** The full cached density reading (or null) — for introspection/telemetry. */
function getDensityState(opts) { return _readCache(opts); }

/**
 * Re-fit the density from the CURRENT substrate. Expensive (whitening fit on a
 * bounded sample); call from the lazy refresh or the CLI, not the hot path.
 * @param {object} [opts] substratePath?, sample?
 * @returns {object|null} the new cache entry, or null if unavailable
 */
function refreshDensity(opts = {}) {
  if (!_whit) return null;
  const substratePath = opts.substratePath || process.env.VOID_FRACTAL_INDEX || DEFAULT_SUBSTRATE;
  const sample = Number.isFinite(opts.sample) ? opts.sample : FIT_SAMPLE;
  let idx;
  try { idx = JSON.parse(fs.readFileSync(substratePath, 'utf8')).index; } catch (_) { return null; }
  const names = Object.keys(idx);
  const vecs = [];
  const step = Math.max(1, Math.floor(names.length / (sample || 1)));
  for (let i = 0; i < names.length && vecs.length < sample; i += step) {
    const v = idx[names[i]].composed_v1;
    if (Array.isArray(v) && v.length === DIM) vecs.push(v);
  }
  if (vecs.length < DIM) return null; // too few to fit meaningfully
  const W = _whit.fitWhitening(vecs, { epsilon: 1e-3 });
  const effDim = _whit.participationRatio(vecs.map((v) => _whit.applyWhitening(v, W)));

  const prev = _readCache(opts);
  // Reference captured once, so the factor starts at 1.0 and rises with
  // genuine diversification (never retroactively rescaled downward).
  const prevRef = prev?.reference;         // optional-chained: null cache → undefined
  const reference = Number.isFinite(prevRef) ? prevRef : effDim;
  const factor = reference > 0 ? effDim / reference : 1;
  const entry = {
    kind: 'substrate-density-v1',
    patterns: names.length,
    fitSample: vecs.length,
    effectiveDim: +effDim.toFixed(3),
    reference: +reference.toFixed(3),
    factor: +factor.toFixed(4),
    dim: DIM,
  };
  _writeCache(entry, opts);
  return entry;
}

module.exports = { getDensityFactor, getDensityState, refreshDensity, CACHE_PATH, FIT_SAMPLE };
