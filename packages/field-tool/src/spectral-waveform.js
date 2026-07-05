'use strict';

/**
 * spectral-waveform.js — L4 encoder, designed from the residual L3
 * left on within-numerical-domain patterns.
 *
 * The depth-3 analysis surfaced specifically: cascade/* patterns
 * (19,315 entries) collapse into one L3 signature (autocorrelated
 * smooth bounded series). Weather, crypto, economic, geophysical
 * time-series all read as "the same kind of sequence" at L3 because
 * L3 captures shape statistics that ignore *frequency content*.
 *
 * L4 extracts the FREQUENCY-DOMAIN character of an input's numerical
 * sequence:
 *   - FFT-derived energy distribution across log-frequency bins
 *     (which timescales dominate?)
 *   - Spectral shape (centroid, spread, flatness, roll-off)
 *   - Multi-lag autocorrelation (periodicity at different scales)
 *   - Non-stationarity hints (variance windows, detrended residual,
 *     piecewise heterogeneity)
 *   - 1/f-noise-likeness, white-noise-likeness, daily/weekly periods
 *
 * Output: 29-D Float64Array, values bounded in [0, 1].
 *
 * For non-numerical inputs (code, prose): falls back to character-
 * level FFT on the byte stream, which still produces a signature
 * but is less discriminating. The L4 contribution to non-numerical
 * patterns is small; the discriminating work happens within the
 * cascade/* and covid/* numerical-dominant namespaces.
 */

const LAYER_DIM = 29;
const FFT_SIZE = 256;        // power of 2 for radix-2 Cooley-Tukey

const _NUM_RE = /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;

function _clip(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function _extractNumbers(text) {
  const out = [];
  let m;
  _NUM_RE.lastIndex = 0;
  while ((m = _NUM_RE.exec(text)) !== null) {
    const v = parseFloat(m[0]);
    if (Number.isFinite(v)) out.push(v);
  }
  return out;
}

// ── Cooley-Tukey radix-2 FFT (in-place, length must be power of 2) ─
function _fftInPlace(real, imag) {
  const n = real.length;
  // Bit-reversal permutation
  let j = 0;
  for (let i = 1; i < n; i++) {
    let bit = n >> 1;
    while (j & bit) { j ^= bit; bit >>= 1; }
    j ^= bit;
    if (i < j) {
      [real[i], real[j]] = [real[j], real[i]];
      [imag[i], imag[j]] = [imag[j], imag[i]];
    }
  }
  // Iterative butterfly
  for (let size = 2; size <= n; size <<= 1) {
    const half = size >> 1;
    const angle = -2 * Math.PI / size;
    for (let start = 0; start < n; start += size) {
      for (let k = 0; k < half; k++) {
        const tReal = Math.cos(angle * k);
        const tImag = Math.sin(angle * k);
        const idxA = start + k;
        const idxB = start + k + half;
        const aReal = real[idxA], aImag = imag[idxA];
        const bReal = real[idxB] * tReal - imag[idxB] * tImag;
        const bImag = real[idxB] * tImag + imag[idxB] * tReal;
        real[idxA] = aReal + bReal;
        imag[idxA] = aImag + bImag;
        real[idxB] = aReal - bReal;
        imag[idxB] = aImag - bImag;
      }
    }
  }
}

function _powerSpectrum(samples) {
  // Pad or truncate to FFT_SIZE, then mean-center
  const real = new Float64Array(FFT_SIZE);
  const imag = new Float64Array(FFT_SIZE);
  const n = Math.min(samples.length, FFT_SIZE);
  if (n === 0) return null;
  let sum = 0;
  for (let i = 0; i < n; i++) sum += samples[i];
  const mean = sum / n;
  for (let i = 0; i < n; i++) real[i] = samples[i] - mean;
  // (real already zero-padded for i ≥ n)
  _fftInPlace(real, imag);
  // Power spectrum: magnitude squared, keep first half (Nyquist)
  const half = FFT_SIZE >> 1;
  const power = new Float64Array(half);
  for (let k = 0; k < half; k++) {
    power[k] = real[k] * real[k] + imag[k] * imag[k];
  }
  return power;
}

function _normalize(power) {
  let sum = 0;
  for (let i = 0; i < power.length; i++) sum += power[i];
  if (sum < 1e-12) return power;
  const out = new Float64Array(power.length);
  for (let i = 0; i < power.length; i++) out[i] = power[i] / sum;
  return out;
}

function _logFreqBins(power, nBins) {
  // Log-spaced bin assignment over [1, half]
  const half = power.length;
  const bins = new Float64Array(nBins);
  const counts = new Int32Array(nBins);
  for (let k = 1; k < half; k++) {
    const t = Math.log(k) / Math.log(half);
    const b = Math.min(nBins - 1, Math.floor(t * nBins));
    bins[b] += power[k];
    counts[b]++;
  }
  // Average per bin (handle empty bins as 0)
  for (let b = 0; b < nBins; b++) {
    if (counts[b] > 0) bins[b] /= counts[b];
  }
  // Normalize across bins to [0, 1]
  let maxBin = 0;
  for (let b = 0; b < nBins; b++) if (bins[b] > maxBin) maxBin = bins[b];
  if (maxBin > 0) for (let b = 0; b < nBins; b++) bins[b] /= maxBin;
  return bins;
}

function _spectralShape(power) {
  const half = power.length;
  let sum = 0, weightSum = 0;
  for (let k = 0; k < half; k++) {
    sum += power[k];
    weightSum += k * power[k];
  }
  if (sum < 1e-12) {
    return { centroid: 0, spread: 0, skew: 0, rolloff: 0, flatness: 0 };
  }
  const centroid = weightSum / sum;
  let varSum = 0, skewSum = 0;
  for (let k = 0; k < half; k++) {
    const d = k - centroid;
    varSum += d * d * power[k];
    skewSum += d * d * d * power[k];
  }
  const variance = varSum / sum;
  const std = Math.sqrt(Math.max(0, variance));
  const skew = std > 1e-9 ? (skewSum / sum) / (std ** 3) : 0;
  // Roll-off: frequency below which 85% of total energy lies
  let cum = 0; let rolloff = half - 1;
  for (let k = 0; k < half; k++) {
    cum += power[k];
    if (cum >= 0.85 * sum) { rolloff = k; break; }
  }
  // Flatness: geom mean / arith mean
  let logSum = 0, arSum = 0, cnt = 0;
  for (let k = 1; k < half; k++) {
    if (power[k] > 1e-15) { logSum += Math.log(power[k]); arSum += power[k]; cnt++; }
  }
  let flatness = 0;
  if (cnt > 0 && arSum > 1e-12) {
    flatness = Math.exp(logSum / cnt) / (arSum / cnt);
  }
  return {
    centroid: centroid / half,
    spread: std / half,
    skew: 0.5 + Math.tanh(skew / 5) * 0.5,
    rolloff: rolloff / half,
    flatness,
  };
}

function _spectralEntropy(power) {
  let sum = 0;
  for (let i = 0; i < power.length; i++) sum += power[i];
  if (sum < 1e-12) return 0;
  let h = 0;
  for (let i = 0; i < power.length; i++) {
    if (power[i] > 1e-15) {
      const p = power[i] / sum;
      h -= p * Math.log2(p);
    }
  }
  // Normalize by max entropy (log2 of bin count)
  return Math.min(1, h / Math.log2(power.length));
}

function _multiLagAutocorr(samples) {
  const n = samples.length;
  if (n < 64) return new Float64Array(5);
  const lags = [2, 4, 8, 16, 32];
  const out = new Float64Array(5);
  const mean = samples.reduce((s, x) => s + x, 0) / n;
  let denom = 0;
  for (let i = 0; i < n; i++) denom += (samples[i] - mean) * (samples[i] - mean);
  if (denom < 1e-12) return out;
  for (let li = 0; li < lags.length; li++) {
    const lag = lags[li];
    if (lag >= n) break;
    let num = 0;
    for (let i = 0; i < n - lag; i++) {
      num += (samples[i] - mean) * (samples[i + lag] - mean);
    }
    out[li] = _clip(0.5 + (num / denom) * 0.5);
  }
  return out;
}

function _nonStationarity(samples) {
  const n = samples.length;
  if (n < 4) {
    return { varRatio: 0, trendStrength: 0, detrendedVar: 0, pieceHet: 0, largestGap: 0 };
  }
  // Variance ratio between halves
  const half = Math.floor(n / 2);
  let s1 = 0, s2 = 0;
  for (let i = 0; i < half; i++) s1 += samples[i];
  for (let i = half; i < n; i++) s2 += samples[i];
  const m1 = s1 / half, m2 = s2 / (n - half);
  let v1 = 0, v2 = 0;
  for (let i = 0; i < half; i++) v1 += (samples[i] - m1) ** 2;
  for (let i = half; i < n; i++) v2 += (samples[i] - m2) ** 2;
  v1 /= half; v2 /= (n - half);
  const varRatio = (v1 + v2 > 1e-12) ? Math.abs(v1 - v2) / (v1 + v2) : 0;
  // Trend strength via R² of linear fit
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0, sumYY = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += samples[i];
    sumXY += i * samples[i]; sumXX += i * i; sumYY += samples[i] * samples[i];
  }
  const den = (n * sumXX - sumX * sumX) * (n * sumYY - sumY * sumY);
  const num = n * sumXY - sumX * sumY;
  const r2 = den > 1e-12 ? (num * num) / den : 0;
  const trendStrength = _clip(r2);
  // Detrended residual variance fraction
  const slope = (n * sumXX - sumX * sumX) > 1e-12 ? (n * sumXY - sumX * sumY) / (n * sumXX - sumX * sumX) : 0;
  const intercept = (sumY - slope * sumX) / n;
  let totalVar = 0, residVar = 0;
  const mean = sumY / n;
  for (let i = 0; i < n; i++) {
    const fit = slope * i + intercept;
    residVar += (samples[i] - fit) ** 2;
    totalVar += (samples[i] - mean) ** 2;
  }
  const detrendedVar = totalVar > 1e-12 ? residVar / totalVar : 0;
  // Piecewise heterogeneity (4 segments)
  const segLen = Math.floor(n / 4);
  const segVars = [];
  for (let s = 0; s < 4; s++) {
    const start = s * segLen;
    const end = Math.min(n, start + segLen);
    let sm = 0; for (let i = start; i < end; i++) sm += samples[i];
    const mn = sm / (end - start);
    let v = 0; for (let i = start; i < end; i++) v += (samples[i] - mn) ** 2;
    segVars.push(v / (end - start));
  }
  const segMean = segVars.reduce((s, x) => s + x, 0) / 4;
  let segVar = 0; for (const v of segVars) segVar += (v - segMean) ** 2; segVar /= 4;
  const pieceHet = segMean > 1e-12 ? Math.sqrt(segVar) / segMean : 0;
  // Largest gap (sorted)
  const sorted = [...samples].sort((a, b) => a - b);
  let maxGap = 0;
  for (let i = 1; i < sorted.length; i++) {
    const g = sorted[i] - sorted[i - 1];
    if (g > maxGap) maxGap = g;
  }
  const range = sorted[sorted.length - 1] - sorted[0];
  const largestGap = range > 1e-12 ? maxGap / range : 0;
  return {
    varRatio: _clip(varRatio),
    trendStrength,
    detrendedVar: _clip(detrendedVar),
    pieceHet: _clip(Math.min(1, pieceHet)),
    largestGap: _clip(largestGap),
  };
}

function _spectralDomainMarkers(power, samples) {
  // 1/f noise likeness — slope of log power vs log frequency
  const half = power.length;
  let sumLF = 0, sumLP = 0, sumLFLP = 0, sumLFsq = 0, cnt = 0;
  for (let k = 1; k < half; k++) {
    if (power[k] > 1e-15) {
      const lf = Math.log(k);
      const lp = Math.log(power[k]);
      sumLF += lf; sumLP += lp;
      sumLFLP += lf * lp; sumLFsq += lf * lf;
      cnt++;
    }
  }
  let slope = 0;
  if (cnt > 2) {
    const den = cnt * sumLFsq - sumLF * sumLF;
    if (Math.abs(den) > 1e-12) slope = (cnt * sumLFLP - sumLF * sumLP) / den;
  }
  // slope ≈ -1 means 1/f noise; map to [0, 1] where 1 = 1/f
  const onefLike = _clip(1 - Math.abs(slope + 1) / 2);
  // White-noise-likeness: how flat is the spectrum
  const meanPow = (sumLP > 0 || cnt > 0) ? Math.exp(sumLP / Math.max(1, cnt)) : 0;
  let sumDev = 0;
  for (let k = 1; k < half; k++) {
    if (power[k] > 1e-15) sumDev += Math.abs(Math.log(power[k]) - Math.log(meanPow));
  }
  const flatScore = cnt > 0 ? Math.exp(-(sumDev / cnt) / 2) : 0;
  const whiteLike = _clip(flatScore);
  // Period detection — look for spike at lag ~ 24 (daily-ish at hourly sampling)
  const targetLag24 = Math.min(half - 1, 24);
  const targetLag7 = Math.min(half - 1, 7);
  const peak24 = power[targetLag24];
  const peak7 = power[targetLag7];
  let maxNoise = 0;
  for (let k = 1; k < half; k++) {
    if (k !== targetLag24 && k !== targetLag7 && power[k] > maxNoise) maxNoise = power[k];
  }
  const period24 = maxNoise > 1e-12 ? _clip(peak24 / maxNoise / 3) : 0;
  const period7 = maxNoise > 1e-12 ? _clip(peak7 / maxNoise / 3) : 0;
  return { onefLike, whiteLike, period24, period7 };
}

// ── Main encoder ──────────────────────────────────────────────────

function toSpectralWaveform(text) {
  const out = new Float64Array(LAYER_DIM);
  if (typeof text !== 'string' || text.length === 0) return out;

  let samples = _extractNumbers(text);
  if (samples.length < 16) {
    // Fall back to character codes for inputs without enough numbers
    samples = [];
    const lim = Math.min(text.length, FFT_SIZE);
    for (let i = 0; i < lim; i++) samples.push(text.charCodeAt(i));
  }

  const power = _powerSpectrum(samples);
  if (!power) return out;

  const normPower = _normalize(power);
  const bins = _logFreqBins(normPower, 8);
  const shape = _spectralShape(normPower);
  const entropy = _spectralEntropy(normPower);
  const autocorrs = _multiLagAutocorr(samples);
  const ns = _nonStationarity(samples);
  const dm = _spectralDomainMarkers(normPower, samples);

  // ── 8 log-frequency bins (dims 0..7) ──────────────────────────
  for (let i = 0; i < 8; i++) out[i] = _clip(bins[i]);

  // ── Dominant frequency + spectral entropy (dims 8..9) ─────────
  let domIdx = 0, domVal = 0;
  for (let k = 1; k < normPower.length; k++) {
    if (normPower[k] > domVal) { domVal = normPower[k]; domIdx = k; }
  }
  out[8] = _clip(domIdx / normPower.length);
  out[9] = _clip(entropy);

  // ── Spectral shape (dims 10..14) ──────────────────────────────
  out[10] = _clip(shape.centroid);
  out[11] = _clip(shape.spread);
  out[12] = _clip(shape.skew);
  out[13] = _clip(shape.rolloff);
  out[14] = _clip(shape.flatness);

  // ── Multi-lag autocorrelation (dims 15..19) ───────────────────
  for (let i = 0; i < 5; i++) out[15 + i] = _clip(autocorrs[i]);

  // ── Non-stationarity (dims 20..24) ────────────────────────────
  out[20] = _clip(ns.varRatio);
  out[21] = _clip(ns.trendStrength);
  out[22] = _clip(ns.detrendedVar);
  out[23] = _clip(ns.pieceHet);
  out[24] = _clip(ns.largestGap);

  // ── Spectral domain markers (dims 25..28) ─────────────────────
  out[25] = _clip(dm.onefLike);
  out[26] = _clip(dm.whiteLike);
  out[27] = _clip(dm.period24);
  out[28] = _clip(dm.period7);

  return out;
}

function spectralCoherency(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function inspectSpectralWaveform(text) {
  const v = toSpectralWaveform(text);
  return {
    bins: { f0: v[0], f1: v[1], f2: v[2], f3: v[3], f4: v[4], f5: v[5], f6: v[6], f7: v[7] },
    summary: { dominantFreq: v[8], spectralEntropy: v[9] },
    shape: { centroid: v[10], spread: v[11], skew: v[12], rolloff: v[13], flatness: v[14] },
    autocorr: { lag2: v[15], lag4: v[16], lag8: v[17], lag16: v[18], lag32: v[19] },
    nonStat: { varRatio: v[20], trend: v[21], detrendedVar: v[22], pieceHet: v[23], largestGap: v[24] },
    domain: { onef: v[25], whiteNoise: v[26], daily: v[27], weekly: v[28] },
  };
}

module.exports = {
  LAYER_DIM,
  FFT_SIZE,
  toSpectralWaveform,
  spectralCoherency,
  inspectSpectralWaveform,
};
