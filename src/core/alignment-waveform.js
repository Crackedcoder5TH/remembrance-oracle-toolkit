'use strict';

/**
 * alignment-waveform.js — L10: the CROSS-REPRESENTATION CORRESPONDENCE layer,
 * self-gated on fixed-law conformance.
 *
 * The residual L1-L9 leave, surfaced by the lens-fractal-compare receipt: the four
 * transfer nulls (physics→biology, PPI→expression, cross-family SC, depth-compounding)
 * form their OWN structural family, distinct from every shape lens — a coherent residual
 * whose shared thread is CROSS-REPRESENTATION CORRESPONDENCE: does representation A encode
 * the same underlying LAW as representation B, even when their surface shape/scale differ?
 * The shape stack (L1-L8) reads the surface; L9 reads within-input community; none reads
 * whether two things obey the SAME law. Two sequences y=3·x^0.75 and y=1000·x^0.75 have
 * wildly different magnitude and 1D shape — a shape encoder scatters them — but they are
 * the SAME correspondence (a 3/4 power law). L10 fingerprints an input by WHICH FIXED LAWS
 * it obeys, so same-law inputs align across domains regardless of surface.
 *
 * LAW LIBRARY (Ajani's Structural Compressor v3 — the calibration oracle): fixed power
 * laws (kleiber 3/4, 1/2, 1, 2/3, 4/3, 2, 3, -1, -2), fixed recursive rules (fibonacci,
 * doubling, halving), fixed harmonic templates (1/2/3 cycles/window), and the RELATIONAL
 * power laws between an input's own field-pairs (how Kleiber is caught: metabolic ~ mass^3/4).
 * Only scale/phase/amplitude are free; the LAW is fixed — data conforms or it doesn't. Each
 * coordinate of the 29-D fingerprint is the coherence (R²×signal-reduction) against one law.
 *
 * SELF-GATED like L7/L8/L9: gain = the strongest law-conformance found. Inputs with no
 * numeric sequences, or numbers that obey none of the fixed laws (noise), yield gain ≈ 0 →
 * L10 contributes nothing and defers to L1-L9, so it cannot degrade them. Law-bearing
 * inputs contribute fully; hybrid proportionally.
 *
 * DETERMINISM IS LOAD-BEARING: fixed law templates, closed-form scale/lstsq, fixed order —
 * byte-identical across runs. No Math.random, no Date.
 *
 * VALIDATION (labeled method, L7/L8/L9 discipline): scripts/l10-alignment-validation.mjs —
 * (1) CALIBRATE against v3: the fingerprint's dominant law must match v3's HIGH/NOISE calls
 * on its own test patterns; (2) ALIGNMENT task: same-law/different-scale sequences must align
 * (high cosine) where the shape stack is fooled by scale — the clean win L9 could not get on
 * synthetic data because here shape genuinely CANNOT fake it; (3) run through the transfer
 * nulls. INACTIVE pending that validation + the composed_v* migration; reachable via
 * composedAtDepth(text, 10).
 */

const DIM_TARGET = 29;
const EPS = 1e-12;
const MIN_LEN = 3;

const POWER_EXP = [0.75, 0.5, 1.0, 0.667, 1.333, 2.0, 3.0, -1.0, -2.0]; // 9 fixed power laws
const RECURSIVE = [[1, 1], [2, 0], [0.5, 0]];                            // fibonacci, doubling, halving
const HARMONIC_CYC = [1, 2, 3];                                          // fixed cycles/window

// ── numeric-sequence extraction: parse JSON and walk it, else scan numbers ──
function _sequences(input) {
  const seqs = [];
  let parsed = null;
  try { parsed = JSON.parse(input); } catch { parsed = null; }
  if (parsed !== null && typeof parsed === 'object') {
    const walk = (o) => {
      if (Array.isArray(o)) {
        const flat = o.filter((x) => typeof x === 'number' && Number.isFinite(x));
        if (flat.length === o.length && flat.length >= MIN_LEN) seqs.push(flat);
        else for (const it of o) if (it && typeof it === 'object') walk(it);
      } else if (o && typeof o === 'object') {
        for (const k of Object.keys(o)) {
          const v = o[k];
          if (Array.isArray(v) && v.length >= MIN_LEN && v.every((x) => typeof x === 'number' && Number.isFinite(x))) seqs.push(v);
          else if (v && typeof v === 'object') walk(v);
        }
      }
    };
    walk(parsed);
  }
  if (seqs.length === 0) {
    // fall back to scanning a numeric series out of the raw text
    const nums = (input.match(/-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g) || []).map(Number).filter(Number.isFinite);
    if (nums.length >= MIN_LEN) seqs.push(nums.slice(0, 512));
  }
  return seqs;
}

function _rSquared(y, pred) {
  const n = y.length || 1;
  let m = 0; for (const v of y) m += v; m /= n;
  let vt = 0, ve = 0; for (let i = 0; i < y.length; i++) { vt += (y[i] - m) ** 2; ve += (y[i] - pred[i]) ** 2; }
  vt /= n; ve /= n;
  if (vt < EPS) return ve < EPS ? 1 : 0;
  return 1 - ve / (vt || 1);
}
function _reduction(y, resid) {
  let om = 0; for (const v of y) om += v * v; om = Math.sqrt(om / (y.length || 1));
  let rm = 0; for (const v of resid) rm += v * v; rm = Math.sqrt(rm / (resid.length || 1));
  if (om < EPS) return 0;
  return 1 - rm / (om || 1);
}
// coherence of a fit = clamp(r² × signal-reduction), only when r² clears the bar (else 0)
function _coh(y, pred) {
  const r2 = _rSquared(y, pred);
  if (r2 <= 0.95) return 0;
  const resid = y.map((v, i) => v - pred[i]);
  const red = _reduction(y, resid);
  if (red <= 0.05) return 0;
  return Math.min(1, r2 * red);
}

function _powerCoh(y, exp) {
  if (y.length < MIN_LEN || y.some((v) => v <= 0)) return 0;
  const tpl = y.map((_, i) => Math.pow(i + 1, exp));
  let s = 0; for (let i = 0; i < y.length; i++) s += y[i] / (tpl[i] || EPS); s /= (y.length || 1);
  return _coh(y, tpl.map((t) => s * t));
}
function _relPowerCoh(x, y, exp) {
  if (x.length !== y.length || x.length < MIN_LEN || x.some((v) => v <= 0) || y.some((v) => v <= 0)) return 0;
  const tpl = x.map((v) => Math.pow(v, exp));
  let s = 0; for (let i = 0; i < y.length; i++) s += y[i] / (tpl[i] || EPS); s /= (y.length || 1);
  return _coh(y, tpl.map((t) => s * t));
}
function _recursiveCoh(y, a, b) {
  if (y.length < 4) return 0;
  const pred = [y[0], y[1]];
  for (let i = 2; i < y.length; i++) pred.push(a * pred[i - 1] + b * pred[i - 2]);
  return _coh(y, pred);
}
// harmonic: fixed period T=n/cycles; solve [sin,cos,1] by 3×3 normal equations
function _harmonicCoh(y, cycles) {
  const n = y.length; if (n < 6) return 0;
  const T = n / (cycles || 1);
  const w = (2 * Math.PI) / (T || 1);   // guarded angular step; T>=2 by construction
  const S = y.map((_, i) => Math.sin(w * i));
  const C = y.map((_, i) => Math.cos(w * i));
  // normal equations M c = r, M = A^T A (3×3), A cols [S, C, 1]
  let m00 = 0, m01 = 0, m02 = 0, m11 = 0, m12 = 0, m22 = n, r0 = 0, r1 = 0, r2 = 0;
  for (let i = 0; i < n; i++) { m00 += S[i] * S[i]; m01 += S[i] * C[i]; m02 += S[i]; m11 += C[i] * C[i]; m12 += C[i]; r0 += S[i] * y[i]; r1 += C[i] * y[i]; r2 += y[i]; }
  // solve 3×3 (symmetric) via Cramer
  const M = [[m00, m01, m02], [m01, m11, m12], [m02, m12, m22]];
  const det = M[0][0] * (M[1][1] * M[2][2] - M[1][2] * M[2][1]) - M[0][1] * (M[1][0] * M[2][2] - M[1][2] * M[2][0]) + M[0][2] * (M[1][0] * M[2][1] - M[1][1] * M[2][0]);
  if (Math.abs(det) < EPS) return 0;
  const dn = det || 1;   // det != 0 here by the guard above
  const dcol = (rep) => { const A = [[m00, m01, m02], [m01, m11, m12], [m02, m12, m22]]; for (let i = 0; i < 3; i++) A[i][rep] = [r0, r1, r2][i]; return A[0][0] * (A[1][1] * A[2][2] - A[1][2] * A[2][1]) - A[0][1] * (A[1][0] * A[2][2] - A[1][2] * A[2][0]) + A[0][2] * (A[1][0] * A[2][1] - A[1][1] * A[2][0]); };
  const cs = dcol(0) / dn, cc = dcol(1) / dn, co = dcol(2) / dn;
  const pred = y.map((_, i) => cs * S[i] + cc * C[i] + co);
  return _coh(y, pred);
}

/**
 * L10 alignment/correspondence waveform → 29-D law-conformance fingerprint; a zero vector
 * when the input obeys no fixed law (self-gated).
 */
function toAlignmentWaveform(input) {
  const out = new Float64Array(DIM_TARGET);
  if (typeof input !== 'string' || input.length < 4) return out;
  const seqs = _sequences(input);
  if (seqs.length === 0) return out;

  const raw = new Float64Array(DIM_TARGET);
  // 0-8: single-sequence power laws (best over sequences)
  for (let e = 0; e < POWER_EXP.length; e++) { let best = 0; for (const y of seqs) best = Math.max(best, _powerCoh(y, POWER_EXP[e])); raw[e] = best; }
  // 9-11: recursive rules
  for (let k = 0; k < RECURSIVE.length; k++) { let best = 0; for (const y of seqs) best = Math.max(best, _recursiveCoh(y, RECURSIVE[k][0], RECURSIVE[k][1])); raw[9 + k] = best; }
  // 12-14: harmonic templates
  for (let k = 0; k < HARMONIC_CYC.length; k++) { let best = 0; for (const y of seqs) best = Math.max(best, _harmonicCoh(y, HARMONIC_CYC[k])); raw[12 + k] = best; }
  // 15-23: RELATIONAL power laws between field-pairs (best over all ordered pairs)
  for (let e = 0; e < POWER_EXP.length; e++) {
    let best = 0;
    for (let i = 0; i < seqs.length; i++) for (let j = 0; j < seqs.length; j++) { if (i === j || seqs[i].length !== seqs[j].length) continue; best = Math.max(best, _relPowerCoh(seqs[i], seqs[j], POWER_EXP[e])); }
    raw[15 + e] = best;
  }
  // 24-28: summaries
  let maxSingle = 0; for (let e = 0; e < 15; e++) maxSingle = Math.max(maxSingle, raw[e]);
  let maxRel = 0; for (let e = 15; e < 24; e++) maxRel = Math.max(maxRel, raw[e]);
  const overall = Math.max(maxSingle, maxRel);
  raw[24] = maxSingle; raw[25] = maxRel;
  raw[26] = Math.min(1, Math.log1p(seqs.length) / Math.log(6));
  let lawful = 0; for (const y of seqs) { let any = 0; for (const e of POWER_EXP) any = Math.max(any, _powerCoh(y, e)); if (any > 0.3) lawful++; }
  raw[27] = lawful / seqs.length;
  raw[28] = overall;

  // self-gate: overall law-conformance
  const gain = overall < 0.3 ? 0 : Math.min(1, (overall - 0.3) / 0.6 + 0.3);
  if (gain < 1e-6) return out;

  // mean-center + L2-normalize the law fingerprint, scale by gain (L7/L8/L9 convention)
  let mean = 0; for (let k = 0; k < DIM_TARGET; k++) mean += raw[k]; mean /= DIM_TARGET;
  let s = 0; const v = new Float64Array(DIM_TARGET);
  for (let k = 0; k < DIM_TARGET; k++) { v[k] = raw[k] - mean; s += v[k] * v[k]; }
  const norm = Math.sqrt(s); if (norm < 1e-9) return out;
  for (let k = 0; k < DIM_TARGET; k++) out[k] = (v[k] / norm) * gain;
  return out;
}

/** The strongest fixed-law conformance of an input in [0,1] — how "lawful" it is. */
function alignmentGain(input) {
  if (typeof input !== 'string' || input.length < 4) return 0;
  const seqs = _sequences(input); if (!seqs.length) return 0;
  let overall = 0;
  for (const y of seqs) { for (const e of POWER_EXP) overall = Math.max(overall, _powerCoh(y, e)); for (const [a, b] of RECURSIVE) overall = Math.max(overall, _recursiveCoh(y, a, b)); for (const c of HARMONIC_CYC) overall = Math.max(overall, _harmonicCoh(y, c)); }
  for (let i = 0; i < seqs.length; i++) for (let j = 0; j < seqs.length; j++) { if (i === j || seqs[i].length !== seqs[j].length) continue; for (const e of POWER_EXP) overall = Math.max(overall, _relPowerCoh(seqs[i], seqs[j], e)); }
  return overall;
}

module.exports = { DIM: DIM_TARGET, toAlignmentWaveform, alignmentGain };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
toAlignmentWaveform.atomicProperties = { charge: 1, valence: 0, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 1, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
alignmentGain.atomicProperties = { charge: 0, valence: 0, mass: "heavy", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
