/**
 * Valor Coherency Primitives — the math layer.
 *
 * Port of the oracle's coherency + resonance primitives into the cathedral.
 * Pure functions, no I/O, no framework. Same math used by src/unified/coherency.js,
 * src/atomic/temporal-projection.js, and Void-Data-Compressor/resonance_detector.py.
 *
 * The law under all of these: coherency is the geometric mean of independent
 * signals in [0, 1]. Weakest signal dominates — can't fake quality by maxing
 * one dimension. This is the Remembrance Weakest Link property.
 */

export const EPSILON = 1e-9;

/**
 * Geometric mean across [0, 1] signals.
 *
 * Returns a score in [0, 1] where a single zero zeros the whole score.
 * This is the weakest-link property: no dimension can be faked by maxing others.
 * The same operation is used in oracle/unified/coherency.js SERF layer.
 */
export function geometricMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  let logSum = 0;
  for (const v of values) {
    const clamped = clamp01(v);
    if (clamped <= EPSILON) return 0;
    logSum += Math.log(clamped);
  }
  return Math.exp(logSum / values.length);
}

/** Clamp a value into [0, 1]. */
export function clamp01(v: number): number {
  if (!Number.isFinite(v)) return 0;
  if (v <= 0) return 0;
  if (v >= 1) return 1;
  return v;
}

/**
 * Pearson correlation of two equal-length waveforms.
 * Returns r in [-1, 1]. Falls back to 0 on zero variance / mismatched length.
 */
export function pearson(a: readonly number[], b: readonly number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  const n = a.length;
  let sa = 0;
  let sb = 0;
  for (let i = 0; i < n; i++) {
    sa += a[i];
    sb += b[i];
  }
  const ma = sa / n;
  const mb = sb / n;
  let num = 0;
  let da = 0;
  let db = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] - ma;
    const y = b[i] - mb;
    num += x * y;
    da += x * x;
    db += y * y;
  }
  const denom = Math.sqrt(da * db);
  if (denom <= EPSILON) return 0;
  const r = num / denom;
  if (!Number.isFinite(r)) return 0;
  return Math.max(-1, Math.min(1, r));
}

/**
 * Resample a waveform to targetLen via linear interpolation.
 * Waveforms become comparable regardless of their native sampling rate —
 * same trick the void compressor uses before lstsq fit.
 */
export function resample(wave: readonly number[], targetLen: number): number[] {
  if (wave.length === 0 || targetLen <= 0) return new Array(targetLen).fill(0);
  if (wave.length === targetLen) return [...wave];
  const out = new Array<number>(targetLen);
  const scale = (wave.length - 1) / (targetLen - 1 || 1);
  for (let i = 0; i < targetLen; i++) {
    const x = i * scale;
    const lo = Math.floor(x);
    const hi = Math.min(wave.length - 1, lo + 1);
    const frac = x - lo;
    out[i] = wave[lo] * (1 - frac) + wave[hi] * frac;
  }
  return out;
}

/**
 * Min-max normalize a waveform into [0, 1]. Constant waveforms collapse to 0.5.
 * Mirrors ResonanceDetector._compute_signature so correlations are scale-invariant.
 */
export function normalize(wave: readonly number[]): number[] {
  if (wave.length === 0) return [];
  let min = Infinity;
  let max = -Infinity;
  for (const v of wave) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  const range = max - min;
  if (range <= EPSILON) return wave.map(() => 0.5);
  return wave.map((v) => (v - min) / range);
}

/**
 * Cascade: correlate a query waveform against a library of named substrates.
 * Returns per-substrate correlation + coherency (mean |r| of top-5 matches).
 * Direct port of ResonanceDetector.fast_cascade's inner loop.
 */
export interface CascadeMatch {
  readonly name: string;
  readonly r: number;
  readonly kind: 'harmonic' | 'anti-phase' | 'weak' | 'noise';
}

export interface CascadeResult {
  readonly coherency: number;
  readonly matches: readonly CascadeMatch[];
}

export function cascade(
  query: readonly number[],
  substrates: ReadonlyMap<string, readonly number[]>,
): CascadeResult {
  const targetLen = 128;
  const qNorm = normalize(resample(query, targetLen));
  const matches: CascadeMatch[] = [];
  for (const [name, sub] of substrates) {
    const sNorm = normalize(resample(sub, targetLen));
    const r = pearson(qNorm, sNorm);
    const abs = Math.abs(r);
    const kind: CascadeMatch['kind'] =
      r >= 0.5 ? 'harmonic' :
      r <= -0.5 ? 'anti-phase' :
      abs >= 0.3 ? 'weak' :
      'noise';
    matches.push({ name, r, kind });
  }
  matches.sort((a, b) => Math.abs(b.r) - Math.abs(a.r));
  const top = matches.slice(0, 5);
  const coherency = top.length > 0
    ? top.reduce((s, m) => s + Math.abs(m.r), 0) / top.length
    : 0;
  return { coherency, matches };
}

/**
 * Remembrance coherency thresholds (ported from src/core/remembrance-lexicon.js).
 * One canonical table across the ecosystem so cathedral, oracle, and void
 * agree on what "stable" or "transcendent" means.
 */
export const COHERENCY_THRESHOLDS = {
  REJECTION: 0.00,
  GATE: 0.60,
  PULL: 0.68,
  FOUNDATION: 0.70,
  STABILITY: 0.75,
  OPTIMIZATION: 0.80,
  SYNERGY: 0.85,
  INTELLIGENCE: 0.90,
  TRANSCENDENCE: 0.95,
  UNITY: 0.98,
} as const;

export type CoherencyTier =
  | 'rejection'
  | 'gate'
  | 'pull'
  | 'foundation'
  | 'stability'
  | 'optimization'
  | 'synergy'
  | 'intelligence'
  | 'transcendence'
  | 'unity';

/** Map a coherency score to its threshold tier (highest bucket it clears). */
export function tierFor(score: number): CoherencyTier {
  const t = COHERENCY_THRESHOLDS;
  if (score >= t.UNITY) return 'unity';
  if (score >= t.TRANSCENDENCE) return 'transcendence';
  if (score >= t.INTELLIGENCE) return 'intelligence';
  if (score >= t.SYNERGY) return 'synergy';
  if (score >= t.OPTIMIZATION) return 'optimization';
  if (score >= t.STABILITY) return 'stability';
  if (score >= t.FOUNDATION) return 'foundation';
  if (score >= t.PULL) return 'pull';
  if (score >= t.GATE) return 'gate';
  return 'rejection';
}
