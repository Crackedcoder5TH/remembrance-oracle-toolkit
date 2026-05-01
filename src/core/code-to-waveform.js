'use strict';

/**
 * codeToWaveform — JS port of void's _code_to_waveform (Python).
 *
 * Converts a code string to a 256-sample waveform in [0, 1]:
 *   1. UTF-8 encode → byte array (uint8)
 *   2. Linear interpolation to 256 points (np.interp equivalent)
 *   3. Min-max normalize; degenerate input → flat 0.5
 *
 * Byte-identical to the Python reference for the same input string,
 * verified by tests/code-to-waveform.test.js. Both are deterministic
 * and side-effect-free.
 *
 * Use: oracle's auto-submit, registration, and feedback paths can
 * compute their own waveform without round-tripping to a Python
 * subprocess.
 */

const TARGET_LEN = 256;

/**
 * np.interp(x, xp, fp) for the specific shape we need:
 *   xp = [0, 1, ..., n-1]
 *   x  = linspace(0, n-1, 256)
 *
 * Returns Float64Array of length 256.
 */
function _linearInterp(fp, targetLen) {
  const n = fp.length;
  const out = new Float64Array(targetLen);
  if (n === 0) return out;
  if (n === 1) { out.fill(fp[0]); return out; }
  const step = (n - 1) / (targetLen - 1);
  for (let i = 0; i < targetLen; i++) {
    const x = i * step;
    const j = Math.floor(x);
    if (j >= n - 1) {
      out[i] = fp[n - 1];
    } else {
      const t = x - j;
      out[i] = fp[j] + t * (fp[j + 1] - fp[j]);
    }
  }
  return out;
}

/**
 * Convert a code string to a 256-sample float64 waveform in [0, 1].
 * Empty input → all zeros. Constant input (after interp) → all 0.5.
 */
function codeToWaveform(code) {
  if (typeof code !== 'string' || code.length === 0) {
    return new Float64Array(TARGET_LEN);
  }
  const bytes = Buffer.from(code, 'utf8');
  const fp = new Float64Array(bytes.length);
  for (let i = 0; i < bytes.length; i++) fp[i] = bytes[i];

  const wf = _linearInterp(fp, TARGET_LEN);

  let lo = wf[0], hi = wf[0];
  for (let i = 1; i < TARGET_LEN; i++) {
    if (wf[i] < lo) lo = wf[i];
    if (wf[i] > hi) hi = wf[i];
  }
  if (hi - lo < 1e-10) {
    const flat = new Float64Array(TARGET_LEN);
    flat.fill(0.5);
    return flat;
  }
  const span = hi - lo;
  for (let i = 0; i < TARGET_LEN; i++) wf[i] = (wf[i] - lo) / span;
  return wf;
}

module.exports = { codeToWaveform, TARGET_LEN };

codeToWaveform.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 1, period: 2,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'core',
};
