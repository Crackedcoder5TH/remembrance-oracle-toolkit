'use strict';

/**
 * waveform.js — the canonical Remembrance encoder, self-contained.
 *
 * Byte-identical to Void's `to_waveform.py` and the oracle toolkit's
 * `src/core/code-to-waveform.js` (cross-language parity contracts C-49/C-50):
 *   1. UTF-8 encode the input to bytes
 *   2. Linear-interpolate (np.interp) to exactly 256 samples
 *   3. Min-max normalize to [0, 1]; degenerate input -> flat 0.5
 *
 * Pure, deterministic, side-effect-free. No dependencies.
 */

const DIM = 256;

/** np.interp for xp = [0..n-1], x = linspace(0, n-1, targetLen). */
function _linearInterp(fp, targetLen) {
  const n = fp.length;
  const out = new Float64Array(targetLen);
  if (n === 0) return out;
  if (n === 1) { out.fill(fp[0]); return out; }
  const step = (n - 1) / (targetLen - 1);
  for (let i = 0; i < targetLen; i++) {
    const x = i * step;
    const j = Math.floor(x);
    if (j >= n - 1) out[i] = fp[n - 1];
    else { const t = x - j; out[i] = fp[j] + t * (fp[j + 1] - fp[j]); }
  }
  return out;
}

/**
 * Encode arbitrary text into the native 256-D float64 waveform (values in
 * [0, 1]). Empty input -> all zeros. Flat/constant input -> all 0.5.
 * @param {string} text
 * @returns {Float64Array} length 256
 */
function toWaveform(text) {
  if (typeof text !== 'string' || text.length === 0) return new Float64Array(DIM);
  const bytes = Buffer.from(text, 'utf8');
  const fp = new Float64Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) fp[i] = bytes[i];

  const wf = _linearInterp(fp, DIM);
  let lo = wf[0], hi = wf[0];
  for (let i = 1; i < DIM; i++) { if (wf[i] < lo) lo = wf[i]; if (wf[i] > hi) hi = wf[i]; }
  if (hi - lo < 1e-10) { const flat = new Float64Array(DIM); flat.fill(0.5); return flat; }
  const norm = new Float64Array(DIM);
  for (let i = 0; i < DIM; i++) norm[i] = (wf[i] - lo) / (hi - lo);
  return norm;
}

/**
 * Cosine similarity of two waveforms — the universal "do these mean the same
 * thing?" primitive. Returns a scalar in [-1, 1] (typically [0, 1]); 0 when
 * either vector has no magnitude.
 * @param {ArrayLike<number>} a
 * @param {ArrayLike<number>} b
 * @returns {number}
 */
function coherency(a, b) {
  const n = Math.min(a.length, b.length);
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  const da = Math.sqrt(na), db = Math.sqrt(nb);
  if (da < 1e-12 || db < 1e-12) return 0;
  return dot / (da * db);
}

/** Convenience: cosine coherency between two raw texts. */
function coherencyOf(textA, textB) {
  return coherency(toWaveform(textA), toWaveform(textB));
}

module.exports = { DIM, toWaveform, coherency, coherencyOf };
