'use strict';

/**
 * Temporal Projection — future-projected retro-causal pull.
 *
 * For any pattern carrying a complete time ledger
 * (observed_start / observed_end / cadence), extrapolate its waveform from
 * observed_end forward to a "now" timestamp using the pattern's own
 * structure. Then compute alignment between the projected position and the
 * historical / previous state — this is the retro-causal pull multiplier:
 * a future state pulling the present forward.
 *
 * Used by reflection-serf's r_eff augmentation when context.timeAwareMode
 * is true. Default behaviour is identity (alignment = 1.0) whenever the
 * ledger is missing, malformed, the projection fails the covenant gate,
 * or the projection confidence is zero. This module never raises — every
 * failure mode degrades toward "historical path".
 */

const SCHEMA_VERSION = 1;
const IDENTITY_ALIGNMENT = 1.0;
const ALIGNMENT_BETA = 0.3;
const ALIGNMENT_CLAMP = [0.7, 1.3];
const PROJECTION_HORIZON_MAX_DEFAULT = 10;
const PERIODIC_AC_THRESHOLD = 0.6;
const TREND_R2_THRESHOLD = 0.85;
const DISTRIBUTION_CV_THRESHOLD = 0.5;
const COVENANT_SIGMA_LIMIT = 4;

const CADENCE_UNITS_MS = {
  ms: 1,
  s: 1e3,
  min: 60e3,
  h: 3.6e6,
  d: 86.4e6,
  y: 31_557_600_000,
  kyr: 31_557_600_000_000,
};

function parseTimestamp(t) {
  if (t == null) return null;
  if (typeof t === 'number') return Number.isFinite(t) ? t : null;
  if (typeof t === 'string') {
    const n = Date.parse(t);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function cadenceToMs(cadence) {
  if (cadence == null || typeof cadence !== 'string') return null;
  if (cadence === 'variable') return null;
  const m = cadence.match(/^(\d+(?:\.\d+)?)\s*(ms|s|min|h|d|y|kyr)$/i);
  if (!m) return null;
  const n = parseFloat(m[1]);
  const unit = m[2].toLowerCase();
  return CADENCE_UNITS_MS[unit] != null ? n * CADENCE_UNITS_MS[unit] : null;
}

function isTimeAligned(pattern) {
  if (!pattern || !pattern.ledger) return false;
  const { observed_start, observed_end, cadence } = pattern.ledger;
  return observed_start != null && observed_end != null && cadence != null;
}

// ─── Shape classification ───────────────────────────────────────

function _autocorrPeak(w) {
  const n = w.length;
  if (n < 4) return { lag: 0, ratio: 0 };
  const mean = w.reduce((s, v) => s + v, 0) / n;
  const c = w.map(v => v - mean);
  const var0 = c.reduce((s, v) => s + v * v, 0);
  if (var0 === 0) return { lag: 0, ratio: 0 };
  // Unbiased autocorrelation: normalise by pair count (n - lag), not raw sum.
  // This makes lag=1 and lag=period/2 comparable; otherwise lag=1 always wins
  // on a smooth signal just because it has more sample pairs.
  // Also skip lag=1 (trivial smoothness peak) — periods we care about are >= 2.
  let bestLag = 0;
  let bestRatio = 0;
  for (let lag = 2; lag < Math.floor(n / 2); lag++) {
    let acc = 0;
    for (let i = 0; i + lag < n; i++) acc += c[i] * c[i + lag];
    const pairs = n - lag;
    const r = (acc / pairs) / (var0 / n);
    if (r > bestRatio) {
      bestRatio = r;
      bestLag = lag;
    }
  }
  return { lag: bestLag, ratio: bestRatio };
}

function _trendStrength(w) {
  const n = w.length;
  let sX = 0, sY = 0, sXY = 0, sX2 = 0;
  for (let i = 0; i < n; i++) {
    sX += i;
    sY += w[i];
    sXY += i * w[i];
    sX2 += i * i;
  }
  const denom = n * sX2 - sX * sX;
  if (denom === 0) return { slope: 0, intercept: w[0] || 0, r2: 0 };
  const slope = (n * sXY - sX * sY) / denom;
  const intercept = (sY - slope * sX) / n;
  const meanY = sY / n;
  let ssRes = 0, ssTot = 0;
  for (let i = 0; i < n; i++) {
    const pred = slope * i + intercept;
    ssRes += (w[i] - pred) ** 2;
    ssTot += (w[i] - meanY) ** 2;
  }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, r2 };
}

function classifyWaveform(w) {
  if (!Array.isArray(w) || w.length < 8) return 'unknown';
  if (w.some(v => !Number.isFinite(v))) return 'unknown';
  // Order matters: trend has the sharpest signal (linear regression r²),
  // so check it first. Otherwise a monotonic line autocorrelates strongly
  // at every lag and is misclassified as periodic.
  const t = _trendStrength(w);
  if (t.r2 > TREND_R2_THRESHOLD) return 'trend';
  // Periodic requires a non-trivial peak (lag >= 2) above the threshold.
  const ac = _autocorrPeak(w);
  if (ac.ratio > PERIODIC_AC_THRESHOLD && ac.lag >= 2) return 'periodic';
  const mean = w.reduce((s, v) => s + v, 0) / w.length;
  const std = Math.sqrt(w.reduce((s, v) => s + (v - mean) ** 2, 0) / w.length);
  if (Math.abs(mean) > 1e-9 && std / Math.abs(mean) < DISTRIBUTION_CV_THRESHOLD) return 'distribution';
  return 'unknown';
}

// ─── Future projection ──────────────────────────────────────────

function projectForward(pattern, tNow) {
  if (!isTimeAligned(pattern)) return (pattern && pattern.waveform) ? pattern.waveform.slice() : [];
  const w = pattern.waveform;
  if (!Array.isArray(w) || w.length < 8) return Array.isArray(w) ? w.slice() : [];
  const tEnd = parseTimestamp(pattern.ledger.observed_end);
  const tStart = parseTimestamp(pattern.ledger.observed_start);
  const cadMs = cadenceToMs(pattern.ledger.cadence);
  if (tEnd == null || tStart == null || cadMs == null || cadMs <= 0) return w.slice();
  const dtMs = tNow - tEnd;
  if (dtMs <= 0) return w.slice();
  const windowMs = Math.max(tEnd - tStart, cadMs);
  const horizonMs = windowMs * PROJECTION_HORIZON_MAX_DEFAULT;
  const dtClamped = Math.min(dtMs, horizonMs);
  const stepsAhead = dtClamped / cadMs;
  const cls = classifyWaveform(w);
  if (cls === 'unknown' || cls === 'distribution') return w.slice();
  if (cls === 'trend') {
    const t = _trendStrength(w);
    const shift = t.slope * stepsAhead;
    const projected = w.map(v => v + shift);
    const mean = w.reduce((s, v) => s + v, 0) / w.length;
    const std = Math.sqrt(w.reduce((s, v) => s + (v - mean) ** 2, 0) / w.length);
    const lo = Math.min.apply(null, w) - 2 * std;
    const hi = Math.max.apply(null, w) + 2 * std;
    return projected.map(v => Math.max(lo, Math.min(hi, v)));
  }
  if (cls === 'periodic') {
    const period = _autocorrPeak(w).lag;
    if (period <= 0) return w.slice();
    const shift = ((Math.round(stepsAhead) % w.length) + w.length) % w.length;
    return w.map((_, i) => w[(i + shift) % w.length]);
  }
  return w.slice();
}

// ─── Confidence ─────────────────────────────────────────────────

function projectionConfidence(pattern, tNow) {
  if (!isTimeAligned(pattern)) return 0;
  const tEnd = parseTimestamp(pattern.ledger.observed_end);
  const tStart = parseTimestamp(pattern.ledger.observed_start);
  if (tEnd == null || tStart == null) return 0;
  const dtMs = tNow - tEnd;
  if (dtMs <= 0) return 0;
  const windowMs = tEnd - tStart;
  if (windowMs <= 0) return 0;
  const cls = classifyWaveform(pattern.waveform);
  if (cls === 'unknown' || cls === 'distribution') return 0;
  const horizonRatio = dtMs / (windowMs * PROJECTION_HORIZON_MAX_DEFAULT);
  return Math.max(0, Math.min(1, 1 - horizonRatio));
}

// ─── Lightweight covenant gate on the projection ────────────────

function gateProjection(projected, original) {
  if (!Array.isArray(projected) || projected.length === 0) return false;
  if (!Array.isArray(original) || projected.length !== original.length) return false;
  for (let i = 0; i < projected.length; i++) {
    if (!Number.isFinite(projected[i])) return false;
  }
  const om = original.reduce((s, v) => s + v, 0) / original.length;
  const os = Math.sqrt(original.reduce((s, v) => s + (v - om) ** 2, 0) / original.length);
  if (os === 0) return true;
  const pm = projected.reduce((s, v) => s + v, 0) / projected.length;
  return Math.abs(pm - om) < COVENANT_SIGMA_LIMIT * os;
}

// ─── Pearson on equal-length arrays ─────────────────────────────

function pearson(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b) || a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  let sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { sa += a[i]; sb += b[i]; }
  const ma = sa / n, mb = sb / n;
  let num = 0, da = 0, db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma, y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  return (da === 0 || db === 0) ? 0 : num / Math.sqrt(da * db);
}

// ─── Main entry: r_eff multiplier ───────────────────────────────

/**
 * Returns a multiplier in [ALIGNMENT_CLAMP[0], ALIGNMENT_CLAMP[1]] that the
 * caller multiplies into r_eff. Returns IDENTITY_ALIGNMENT (1.0) — no change
 * to r_eff — whenever:
 *   - the candidate has no `.ledger`, OR
 *   - the ledger is incomplete (`isTimeAligned` is false), OR
 *   - the projected waveform fails the covenant gate, OR
 *   - the projection confidence is zero.
 *
 * The caller (reflection-serf) treats this as: "by default, do nothing;
 * only pull when we are confident the future-projection is honest."
 */
function computeRetrocausalAlignment(candidate, previous, context = {}) {
  if (!candidate || !candidate.ledger) return IDENTITY_ALIGNMENT;
  if (!isTimeAligned(candidate)) return IDENTITY_ALIGNMENT;
  const w = candidate.waveform;
  if (!Array.isArray(w) || w.length === 0) return IDENTITY_ALIGNMENT;
  const tNow = (context && context.tNow) || Date.now();
  const projected = projectForward(candidate, tNow);
  if (!gateProjection(projected, w)) return IDENTITY_ALIGNMENT;
  const conf = projectionConfidence(candidate, tNow);
  if (conf <= 0) return IDENTITY_ALIGNMENT;
  const prevW = previous && previous.waveform;
  let overlapDelta = 0;
  if (Array.isArray(prevW) && prevW.length === w.length) {
    overlapDelta = pearson(projected, prevW) - pearson(w, prevW);
  }
  const raw = 1 + ALIGNMENT_BETA * overlapDelta * conf;
  const [lo, hi] = ALIGNMENT_CLAMP;
  return Math.max(lo, Math.min(hi, raw));
}

module.exports = {
  SCHEMA_VERSION,
  IDENTITY_ALIGNMENT,
  ALIGNMENT_BETA,
  ALIGNMENT_CLAMP,
  PROJECTION_HORIZON_MAX_DEFAULT,
  parseTimestamp,
  cadenceToMs,
  isTimeAligned,
  classifyWaveform,
  projectForward,
  projectionConfidence,
  gateProjection,
  pearson,
  computeRetrocausalAlignment,
};

computeRetrocausalAlignment.atomicProperties = {
  charge: 1, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'oracle',
};
projectForward.atomicProperties = {
  charge: 1, valence: 0, mass: 'medium', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 11, period: 1,
  harmPotential: 'none', alignment: 'healing', intention: 'neutral',
  domain: 'oracle',
};
classifyWaveform.atomicProperties = {
  charge: 0, valence: 0, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0, group: 1, period: 3,
  harmPotential: 'none', alignment: 'neutral', intention: 'neutral',
  domain: 'oracle',
};
