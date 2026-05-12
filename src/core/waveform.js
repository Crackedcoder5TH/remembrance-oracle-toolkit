'use strict';

/**
 * Canonical waveform encoder + coherency primitive — JS port.
 *
 * Mirrors Void-Data-Compressor/to_waveform.py byte-for-byte. Same
 * inputs produce identical Float64Array(256) outputs in both
 * languages. Contract C-49 (in Void's verify_capabilities.py)
 * enforces the parity falsifiably.
 *
 * Why this exists:
 *   Void's substrate is 77,596 × 256 floats. The wire format that
 *   crosses repo boundaries is `Float64Array(256)`, full stop —
 *   never JSON pattern definitions, never language-specific schemas.
 *   This module is the JS-side encoder so JS callers can produce
 *   the exact same waveform bytes Python produces, without ever
 *   shelling out, JSON-serializing, or "translating."
 *
 * Math (byte-identical to Python's numpy version):
 *   1. text → utf-8 bytes (Uint8Array)
 *   2. linear interpolation to exactly 256 points
 *   3. min-max normalize to [0.0, 1.0]
 *   4. degenerate cases (empty / single-byte / flat) → constant 0.5
 *
 * Performance: pure JS, no native deps. Roughly 0.05ms per call
 * for typical text inputs (a function body or a paragraph).
 */

const WAVEFORM_DIM = 256;

/**
 * Encode arbitrary text into a 256-D Float64Array waveform.
 * Pure function, deterministic, language-agnostic.
 *
 * @param {string} text — input string
 * @returns {Float64Array} length=256, values in [0, 1]
 */
function toWaveform(text) {
  if (text === null || text === undefined || text === '') {
    return new Float64Array(WAVEFORM_DIM); // zeros
  }
  // utf-8 encode → uint8 array → cast to float64 (matches numpy semantics)
  const utf8 = Buffer.from(text, 'utf-8');
  const raw = new Float64Array(utf8.length);
  for (let i = 0; i < utf8.length; i++) raw[i] = utf8[i];

  if (raw.length === 0) return new Float64Array(WAVEFORM_DIM);
  if (raw.length === 1) return new Float64Array(WAVEFORM_DIM).fill(0.5);

  // np.interp(linspace(0, n-1, 256), arange(n), raw) — linear interp
  // to exactly 256 sample points across the byte sequence.
  const n = raw.length;
  const wf = new Float64Array(WAVEFORM_DIM);
  if (WAVEFORM_DIM === 1) {
    wf[0] = raw[0];
  } else {
    const step = (n - 1) / (WAVEFORM_DIM - 1);
    for (let i = 0; i < WAVEFORM_DIM; i++) {
      const x = i * step;
      const lo = Math.floor(x);
      const hi = Math.min(lo + 1, n - 1);
      const frac = x - lo;
      wf[i] = raw[lo] * (1 - frac) + raw[hi] * frac;
    }
  }

  // min-max normalize. Flat → constant 0.5 (degenerate, no direction).
  let min = wf[0], max = wf[0];
  for (let i = 1; i < WAVEFORM_DIM; i++) {
    if (wf[i] < min) min = wf[i];
    if (wf[i] > max) max = wf[i];
  }
  if (max - min < 1e-10) return new Float64Array(WAVEFORM_DIM).fill(0.5);
  const denom = max - min;
  for (let i = 0; i < WAVEFORM_DIM; i++) wf[i] = (wf[i] - min) / denom;
  return wf;
}

/**
 * Cosine similarity between two waveforms — the universal "do these
 * mean the same thing?" primitive of the ecosystem.
 *
 *   coherency(a, b) = (a · b) / (||a|| * ||b||)
 *
 * @param {Float64Array|number[]} a
 * @param {Float64Array|number[]} b
 * @returns {number} scalar in [-1, 1]; 0 if either input has no direction
 */
function coherency(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] || 0;
    const bv = b[i] || 0;
    dot += av * bv;
    na  += av * av;
    nb  += bv * bv;
  }
  const normA = Math.sqrt(na);
  const normB = Math.sqrt(nb);
  if (normA < 1e-12 || normB < 1e-12) return 0.0;
  return dot / (normA * normB);
}

module.exports = { toWaveform, coherency, WAVEFORM_DIM };
