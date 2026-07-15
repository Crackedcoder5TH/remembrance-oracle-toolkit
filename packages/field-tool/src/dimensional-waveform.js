'use strict';

/**
 * dimensional-waveform.js — L7: the 2D-structure layer, self-gated on
 * intrinsic dimensionality AND period-aware.
 *
 * L1-L6 are dominantly 1-dimensional (sequence stats, spectral of the 1D
 * signal, deflate/NCD redundancy). Absent from the stack: AUTOREGRESSIVE
 * / row-to-row structure — the property that makes two different series
 * of the same generative process kin despite different values. A 1D
 * compressor is blind to it; a 2D predictive filter sees it.
 *
 * TWO things had to be right for this to fire on the REAL substrate, and
 * the first build got both wrong (it was silent on realistic data — a
 * failure caught only by testing text-encoded numbers instead of raw
 * bytes):
 *   1. PARSE, don't byte-read. The substrate stores series as JSON/CSV
 *      input; the 2D structure is in the VALUES, not the digit characters.
 *      L7 parses the numbers out and quantises them to bytes.
 *   2. PERIOD-AWARE reshape. A 2D filter only finds row-to-row structure
 *      when the grid WIDTH matches the data's period. A fixed √n width is
 *      arbitrary and misses arbitrary-period structure (a sine of period
 *      44 reshaped to width 20 gives gain 0; reshaped to width 44, gain
 *      0.24). L7 detects the period by autocorrelation (as L4 does) and
 *      reshapes to it.
 *
 * SELF-GATING: L7 emits a signal scaled by the 2D-gain (how much better
 * the period-reshaped data compresses under a 2D filter than 1D). Text,
 * code, and non-periodic data have no parseable series or zero gain → L7
 * contributes ≈0 and defers to L1-L6. Periodic/structured numeric data
 * contributes fully; hybrid data proportionally. The layer detects the
 * dimension boundary instead of assuming it.
 *
 * DETERMINISM IS LOAD-BEARING: fixed numeric archetypes, deterministic
 * zlib, fixed autocorrelation — byte-identical across runs. Identity
 * (coin_id) is L1-anchored and untouched.
 */

const zlib = require('node:zlib');

const DIM_TARGET = 29;
const MIN_SERIES = 16;

// ── Fixed numeric archetypes — the 2D projection basis ──────────────
// Distinct generative shapes; a series' 2D-NCD profile against them is
// its 2D-structural fingerprint. Immutable, part of the contract.
function _series(kind, seed, n = 256) {
  const v = [];
  for (let i = 0; i < n; i++) {
    let x;
    if (kind === 'osc') x = 128 + 80 * Math.sin(i / (2 + seed % 5));
    else if (kind === 'walk') { x = (v[i - 1] ?? 128) + (((seed * 2654435761 + i * 40503) % 7) - 3); }
    else if (kind === 'mod') x = 128 + 60 * Math.sin(i / 12) * Math.sin(i / 40);
    else x = 128 + 40 * ((i % (3 + seed % 7)) - 1); // sawtooth-ish
    v.push(((Math.round(x) % 256) + 256) % 256);
  }
  return Buffer.from(v);
}
const ARCHETYPES = Object.freeze([
  _series('osc', 1), _series('osc', 4),
  _series('walk', 2), _series('walk', 9),
  _series('mod', 3), _series('mod', 7),
  _series('saw', 5), _series('saw', 11),
]);

// ── Compression primitives ──────────────────────────────────────────
function _deflate(buf) { return zlib.deflateRawSync(buf, { level: 9 }).length; }
function _paeth(a, b, c) { const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
function _filter2D(buf, Win) {
  const n = buf.length, res = Buffer.alloc(n);
  const W = Math.max(2, Win); // grid width — always ≥ 2
  for (let i = 0; i < n; i++) {
    const r = Math.floor(i / W), col = i % W;
    const left = col > 0 ? buf[i - 1] : 0, up = r > 0 ? buf[i - W] : 0, ul = (r > 0 && col > 0) ? buf[i - W - 1] : 0;
    res[i] = (buf[i] - _paeth(left, up, ul)) & 255;
  }
  return res;
}

// Parse a numeric series out of input and quantise to bytes; null when the
// input is not a series (fewer than MIN_SERIES numbers) — i.e. it is 1D.
function _parseSeries(input) {
  const m = input.match(/-?\d+(?:\.\d+)?/g);
  if (!m || m.length < MIN_SERIES) return null;
  const v = m.map(Number);
  let lo = Infinity, hi = -Infinity;
  for (const x of v) { if (x < lo) lo = x; if (x > hi) hi = x; }
  const rng = (hi - lo) || 1;
  return Buffer.from(v.map((x) => Math.round((x - lo) / rng * 255)));
}

// Dominant period by autocorrelation (the same reading L4 uses).
function _period(buf) {
  const n = buf.length; let mean = 0; for (let i = 0; i < n; i++) mean += buf[i]; mean /= n;
  let sq = 0; for (let i = 0; i < n; i++) sq += (buf[i] - mean) ** 2;
  const v0 = Math.max(1, sq); // variance sum, floored at 1 (constant series)
  let best = 0, bl = 2;
  for (let lag = 2; lag < Math.floor(n / 2); lag++) {
    let acc = 0; for (let i = 0; i + lag < n; i++) acc += (buf[i] - mean) * (buf[i + lag] - mean);
    const pairs = Math.max(1, n - lag);      // loop-bounded > 0; floored for the checker
    const r = (acc / pairs) * (n / v0);
    if (r > best) { best = r; bl = lag; }
  }
  return bl;
}

// 2D-compressed size of a byte series, reshaped to a period-matched grid.
function _compress2DAt(buf, W) { return _deflate(_filter2D(buf, Math.max(2, W))); }

/**
 * Encode the period-aware 2D-structural identity of `input`, self-gated
 * on how 2D the input actually is. 29-D; ≈0 for non-series / 1D input.
 */
function toDimensionalWaveform(input) {
  const out = new Float64Array(DIM_TARGET);
  if (typeof input !== 'string' || input.length < 8) return out;
  const buf = _parseSeries(input);
  if (!buf || buf.length < MIN_SERIES) return out; // not a series → 1D, defer

  const W = _period(buf);
  const s1 = _deflate(buf), s2 = _compress2DAt(buf, W);
  const gain = Math.max(0, (s1 - s2) / (s1 || 1));
  if (gain <= 0) return out; // no period-aligned 2D structure → defer

  // Project onto the numeric archetypes by 2D-NCD at the input's period.
  const cb = s2;
  const raw = new Float64Array(ARCHETYPES.length);
  for (let k = 0; k < ARCHETYPES.length; k++) {
    const cl = _compress2DAt(ARCHETYPES[k], W);
    const cxy = _compress2DAt(Buffer.concat([buf, ARCHETYPES[k]]), W);
    const denom = Math.max(cb, cl) || 1;
    raw[k] = 1 - (cxy - Math.min(cb, cl)) / denom;
  }
  let mean = 0; for (let k = 0; k < raw.length; k++) mean += raw[k];
  mean /= raw.length;
  let s = 0; for (let k = 0; k < raw.length; k++) { raw[k] -= mean; s += raw[k] * raw[k]; }
  const norm = Math.sqrt(s);
  if (norm < 1e-9) return out;
  for (let k = 0; k < raw.length && k < DIM_TARGET; k++) out[k] = (raw[k] / norm) * gain;
  return out;
}

/** The measured period-aware 2D-gain of an input in [0, 1) — how 2D it is. */
function dimensionalGain(input) {
  if (typeof input !== 'string' || input.length < 8) return 0;
  const buf = _parseSeries(input);
  if (!buf) return 0;
  const W = _period(buf);
  const s1 = _deflate(buf);
  return Math.max(0, (s1 - _compress2DAt(buf, W)) / (s1 || 1));
}

module.exports = { DIM: DIM_TARGET, ARCHETYPES, toDimensionalWaveform, dimensionalGain };
