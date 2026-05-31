'use strict';

/**
 * waveform.js — canonical Remembrance encoder.
 *
 * As of fractal-waveform v0.1, the canonical `toWaveform` / `coherency`
 * are the STRUCTURAL encoder (see ./fractal-waveform.js and
 * docs/FRACTAL_WAVEFORM_SPEC.md). The legacy byte-stretch encoder is
 * preserved under `byteToWaveform` / `byteCoherency` for callers that
 * genuinely want raw-byte similarity (binary blobs, non-text inputs).
 *
 * The byte version cannot discriminate code from prose (a JS source file
 * vs a markdown README scored 0.86, higher than several real code-vs-code
 * pairings). The fractal version encodes the ecosystem's existing
 * structural vocabulary (atomic properties + structural histograms +
 * structurality), then gates the cosine by structurality agreement.
 *
 * Cross-language note: Void's `to_waveform.py` is still the byte-stretch
 * (contracts C-49/C-50). Until Void mirrors fractal-waveform (proposed
 * C-71, see spec), JS↔Python parity holds only for the byte encoder.
 */

const {
  FRACTAL_DIM,
  toFractalWaveform,
  fractalCoherency,
  fractalCoherencyOf,
} = require('./fractal-waveform');

// ─── Legacy byte-stretch (preserved for binary / non-text inputs) ────────

const BYTE_DIM = 256;

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

function byteToWaveform(text) {
  if (typeof text !== 'string' || text.length === 0) return new Float64Array(BYTE_DIM);
  const bytes = Buffer.from(text, 'utf8');
  const fp = new Float64Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) fp[i] = bytes[i];
  const wf = _linearInterp(fp, BYTE_DIM);
  let lo = wf[0], hi = wf[0];
  for (let i = 1; i < BYTE_DIM; i++) { if (wf[i] < lo) lo = wf[i]; if (wf[i] > hi) hi = wf[i]; }
  if (hi - lo < 1e-10) { const flat = new Float64Array(BYTE_DIM); flat.fill(0.5); return flat; }
  const norm = new Float64Array(BYTE_DIM);
  for (let i = 0; i < BYTE_DIM; i++) norm[i] = (wf[i] - lo) / (hi - lo);
  return norm;
}

/** Cosine over two byte waveforms. Length-mismatch returns 0 — never
 * silently compare vectors from different encoders. */
function byteCoherency(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  const da = Math.sqrt(na), db = Math.sqrt(nb);
  if (da < 1e-12 || db < 1e-12) return 0;
  return dot / (da * db);
}

function byteCoherencyOf(textA, textB) {
  return byteCoherency(byteToWaveform(textA), byteToWaveform(textB));
}

// ─── Canonical exports ───────────────────────────────────────────────────

module.exports = {
  // Canonical: structural fractal encoder.
  DIM: FRACTAL_DIM,
  toWaveform: toFractalWaveform,
  coherency: fractalCoherency,
  coherencyOf: fractalCoherencyOf,
  // Legacy byte-stretch, preserved for binary / non-text inputs.
  BYTE_DIM,
  byteToWaveform,
  byteCoherency,
  byteCoherencyOf,
};
