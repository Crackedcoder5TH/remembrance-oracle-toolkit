'use strict';

/**
 * code-to-waveform.js — oracle's canonical encoder.
 *
 * As of fractal-waveform v0.1, `codeToWaveform` and `waveformCosine` ARE
 * the structural fractal versions from ./fractal-waveform. The byte-stretch
 * (the original 256-D linear-interpolated UTF-8) is preserved under
 * `byteCodeToWaveform` / `byteWaveformCosine` for callers that genuinely
 * want raw-byte similarity on binary / non-text inputs.
 *
 * Why: byte-stretch could not discriminate code from prose — a JS source
 * file and a markdown README scored 0.86 cosine, higher than several real
 * code-vs-code pairs. Fractal-waveform encodes the ecosystem's existing
 * structural vocabulary (atomic properties + structural histograms +
 * structurality), then gates the cosine by structurality agreement.
 *
 * Migration note: stored waveforms from before this change are 256-D and
 * cannot be compared against new 29-D fractal vectors. `waveformCosine`
 * returns 0 on length mismatch (instead of silently truncating to
 * `Math.min(a.length, b.length)` and producing meaningless numbers).
 * Field-memory entries with legacy `waveform: [256 floats]` will simply
 * not match new queries until re-encoded.
 *
 * Cross-language parity: Void's `to_waveform.py` is still the byte
 * version (contracts C-49/C-50). Until `to_fractal_waveform.py` lands
 * (proposed C-71, see docs/FRACTAL_WAVEFORM_SPEC.md), JS↔Python parity
 * holds only for the byte encoder, NOT the canonical fractal one.
 */

const {
  FRACTAL_DIM,
  toFractalWaveform,
  fractalCoherency,
} = require('./fractal-waveform');

// ─── Legacy byte-stretch (binary / non-text inputs) ──────────────────────

const BYTE_TARGET_LEN = 256;

function _linearInterp(fp, targetLen) {
  const n = fp.length;
  const out = new Float64Array(targetLen);
  if (n === 0) return out;
  if (n === 1) { out.fill(fp[0]); return out; }
  const step = (n - 1) / (targetLen - 1);
  for (let i = 0; i < targetLen; i++) {
    const x = i * step;
    const j = Math.floor(x);
    if (j >= n - 1) { out[i] = fp[n - 1]; }
    else { const t = x - j; out[i] = fp[j] + t * (fp[j + 1] - fp[j]); }
  }
  return out;
}

function byteCodeToWaveform(code) {
  if (typeof code !== 'string' || code.length === 0) {
    return new Float64Array(BYTE_TARGET_LEN);
  }
  const bytes = Buffer.from(code, 'utf8');
  const fp = new Float64Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) fp[i] = bytes[i];
  const wf = _linearInterp(fp, BYTE_TARGET_LEN);
  let lo = wf[0], hi = wf[0];
  for (let i = 1; i < BYTE_TARGET_LEN; i++) {
    if (wf[i] < lo) lo = wf[i]; if (wf[i] > hi) hi = wf[i];
  }
  if (hi - lo < 1e-10) {
    const flat = new Float64Array(BYTE_TARGET_LEN); flat.fill(0.5); return flat;
  }
  const span = hi - lo;
  for (let i = 0; i < BYTE_TARGET_LEN; i++) wf[i] = (wf[i] - lo) / span;
  return wf;
}

/** Cosine over byte waveforms. Length-mismatch returns 0 — never silently
 * compare vectors from different encoders. */
function byteWaveformCosine(a, b) {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  if (a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i], y = b[i];
    dot += x * y; na += x * x; nb += y * y;
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom < 1e-12 ? 0 : dot / denom;
}

// ─── Stable fingerprint (used for dedup IDs across the codebase) ─────────

/** FNV-1a over the waveform's 4-decimal string form. Deterministic and
 * dependency-free. Works on any waveform length, including the new
 * fractal vectors. Note: this hash changes when the encoder changes, so
 * digests recorded by the old byte encoder will differ from digests
 * computed by the new fractal encoder for the same source. */
function digestWaveform(wf) {
  let h = 0x811c9dc5;
  for (let i = 0; i < wf.length; i++) {
    const s = wf[i].toFixed(4);
    for (let j = 0; j < s.length; j++) {
      h ^= s.charCodeAt(j);
      h = (h + ((h << 1) + (h << 4) + (h << 7) + (h << 8) + (h << 24))) >>> 0;
    }
  }
  return h.toString(16).padStart(8, '0');
}

// ─── Canonical exports ───────────────────────────────────────────────────

module.exports = {
  // Canonical: structural fractal encoder.
  TARGET_LEN: FRACTAL_DIM,
  codeToWaveform: toFractalWaveform,
  waveformCosine: fractalCoherency,
  digestWaveform,
  // Legacy byte-stretch for binary / non-text inputs.
  BYTE_TARGET_LEN,
  byteCodeToWaveform,
  byteWaveformCosine,
};
