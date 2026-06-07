'use strict';

/**
 * numerical-waveform.js — L3 encoder, designed from the residual L1+L2
 * left behind on the live 46,534-pattern substrate.
 *
 * The residual monitor surfaced specific blind spots:
 *
 *   validation/inverse_square_scale0.5 ↔ scale1.0   (cosine 1.0)
 *   cascade/weather_london_wind_direction ↔ cascade/crypto_polkadot
 *   cascade/econ_usd_eur_(t_A) ↔ cascade/econ_usd_eur_(t_B)
 *
 * All collapse because the input was a JSON-serialized number array
 * (cascade/* and validation/* dominant) where L1's structural-code
 * histograms and L2's lexical/stylistic features both flatline.
 *
 * L3 extracts the **numerical sequence character** of the input. For
 * any text, find all numeric literals and compute:
 *   - distribution statistics (mean, variance, skew, kurtosis, range)
 *   - sequence dynamics (autocorrelation, zero-crossings, trend,
 *     monotonicity, change magnitudes)
 *   - distribution shape (median/mean asymmetry, log-scale, tail
 *     heaviness, unique-vs-total)
 *   - structural-sequence (positional entropy, line-length entropy,
 *     run-length compression hint)
 *   - domain markers (timestamp-shape, ratio-shape, coordinate-shape)
 *
 * Output: 29-D Float64Array, values bounded in [0, 1].
 *
 * On text-only inputs (no numbers): most numerical dims output 0;
 * structural-sequence + entropy dims still contribute. So L3 stays
 * additive in the composed signature even when its primary signal
 * is absent.
 */

const LAYER_DIM = 29;

const _NUM_RE = /-?\b\d+(?:\.\d+)?(?:[eE][+-]?\d+)?\b/g;

function _clip(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function _safe(x, fallback = 0) {
  return Number.isFinite(x) ? x : fallback;
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

function _stats(nums) {
  const n = nums.length;
  if (n === 0) return null;
  let sum = 0, sumSq = 0, min = Infinity, max = -Infinity;
  let pos = 0, ints = 0;
  for (const v of nums) {
    sum += v; sumSq += v * v;
    if (v < min) min = v;
    if (v > max) max = v;
    if (v > 0) pos++;
    if (Math.abs(v - Math.round(v)) < 1e-9) ints++;
  }
  const mean = sum / n;
  const variance = sumSq / n - mean * mean;
  const std = Math.sqrt(Math.max(0, variance));
  // Skew/kurtosis: only meaningful with std > 0
  let skew = 0, kurt = 0;
  if (std > 1e-9) {
    let sk3 = 0, sk4 = 0;
    for (const v of nums) {
      const z = (v - mean) / std;
      sk3 += z * z * z;
      sk4 += z * z * z * z;
    }
    skew = sk3 / n;
    kurt = sk4 / n;   // raw, not excess
  }
  return {
    n, sum, mean, variance, std, min, max,
    range: max - min,
    skew, kurt,
    posFrac: pos / n,
    intFrac: ints / n,
  };
}

function _sequenceDynamics(nums) {
  const n = nums.length;
  if (n < 2) {
    return {
      autocorr: 0, zeroCross: 0, slope: 0,
      monotone: 0, meanAbsChange: 0, maxAbsChange: 0,
      incFrac: 0, decFrac: 0,
    };
  }
  // Mean-centered autocorrelation at lag 1
  const mean = nums.reduce((s, x) => s + x, 0) / n;
  let dot = 0, denom = 0;
  for (let i = 0; i < n - 1; i++) {
    dot += (nums[i] - mean) * (nums[i + 1] - mean);
    denom += (nums[i] - mean) * (nums[i] - mean);
  }
  denom += (nums[n - 1] - mean) * (nums[n - 1] - mean);
  const autocorr = denom > 1e-9 ? dot / denom : 0;

  // Zero-crossings of (x - mean)
  let zc = 0;
  for (let i = 0; i < n - 1; i++) {
    if ((nums[i] - mean) * (nums[i + 1] - mean) < 0) zc++;
  }
  const zeroCross = zc / Math.max(1, n - 1);

  // Linear regression slope (LSQ over index)
  let sumX = 0, sumY = 0, sumXY = 0, sumXX = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += nums[i];
    sumXY += i * nums[i]; sumXX += i * i;
  }
  const num = n * sumXY - sumX * sumY;
  const den = n * sumXX - sumX * sumX;
  const slope = Math.abs(den) > 1e-9 ? num / den : 0;

  // Monotonicity: longest run of consistent sign of diff
  let curRun = 1, longestRun = 1;
  let lastDir = 0;
  let inc = 0, dec = 0;
  let sumAbs = 0, maxAbs = 0;
  for (let i = 1; i < n; i++) {
    const d = nums[i] - nums[i - 1];
    const dir = d > 1e-12 ? 1 : d < -1e-12 ? -1 : 0;
    if (dir > 0) inc++;
    if (dir < 0) dec++;
    const a = Math.abs(d);
    sumAbs += a;
    if (a > maxAbs) maxAbs = a;
    if (dir !== 0 && dir === lastDir) {
      curRun++; if (curRun > longestRun) longestRun = curRun;
    } else {
      curRun = 1;
    }
    lastDir = dir;
  }
  const monotone = longestRun / (n - 1);
  const meanAbsChange = sumAbs / (n - 1);
  return {
    autocorr, zeroCross, slope,
    monotone,
    meanAbsChange, maxAbsChange: maxAbs,
    incFrac: inc / (n - 1),
    decFrac: dec / (n - 1),
  };
}

function _distributionShape(nums, st) {
  const n = nums.length;
  if (n === 0) return { medRatio: 0, logScale: 0, dominantBin: 0, tailHeavy: 0, uniqueFrac: 0 };
  const sorted = [...nums].sort((a, b) => a - b);
  const median = sorted[Math.floor(n / 2)];
  const meanAbs = Math.max(1e-9, Math.abs(st.mean));
  const medRatio = Math.abs(median) / meanAbs;
  // Log-scale character: average log10(|x|+1) / log10(max+1)
  const maxAbs = Math.max(1e-9, ...nums.map(v => Math.abs(v)));
  let logSum = 0;
  for (const v of nums) logSum += Math.log10(Math.abs(v) + 1);
  const logScale = logSum / n / Math.log10(maxAbs + 1);
  // Dominant magnitude bin: which order-of-magnitude has the most values
  const bins = new Map();
  for (const v of nums) {
    const b = Math.floor(Math.log10(Math.abs(v) + 1e-9));
    bins.set(b, (bins.get(b) || 0) + 1);
  }
  let maxBinCount = 0;
  for (const c of bins.values()) if (c > maxBinCount) maxBinCount = c;
  const dominantBin = maxBinCount / n;
  // Tail heaviness: top-5% sum vs total
  const top5n = Math.max(1, Math.floor(n * 0.05));
  const top5 = sorted.slice(-top5n);
  const top5Sum = top5.reduce((s, x) => s + Math.abs(x), 0);
  const totalAbs = nums.reduce((s, x) => s + Math.abs(x), 0);
  const tailHeavy = totalAbs > 1e-9 ? top5Sum / totalAbs : 0;
  // Unique-vs-total
  const unique = new Set(nums.map(v => v.toFixed(6))).size;
  const uniqueFrac = unique / n;
  return { medRatio, logScale, dominantBin, tailHeavy, uniqueFrac };
}

function _structuralSequence(text) {
  // Positional structure on text characters
  const len = text.length;
  if (len === 0) {
    return { charEntropy: 0, firstNonWS: 0, lineLenEntropy: 0, periodic: 0, runlen: 0 };
  }
  // Character entropy
  const charCount = new Map();
  for (let i = 0; i < len; i++) {
    const c = text.charCodeAt(i);
    charCount.set(c, (charCount.get(c) || 0) + 1);
  }
  let cE = 0;
  for (const n of charCount.values()) {
    const p = n / len;
    cE -= p * Math.log2(p);
  }
  // Normalize by max possible entropy (~8 bits for byte chars)
  const charEntropy = Math.min(1, cE / 8);
  // Position of first non-whitespace (normalized)
  const firstNS = text.search(/\S/);
  const firstNonWS = firstNS < 0 ? 0 : Math.min(1, firstNS / Math.max(1, len));
  // Line-length entropy
  const lines = text.split('\n');
  const lineLens = lines.map(l => l.length);
  const lenCount = new Map();
  for (const l of lineLens) lenCount.set(l, (lenCount.get(l) || 0) + 1);
  let llE = 0;
  for (const n of lenCount.values()) {
    const p = n / lines.length;
    llE -= p * Math.log2(p);
  }
  const lineLenEntropy = Math.min(1, llE / 8);
  // Periodic pattern: fraction of length that repeats with stride 4..32
  let bestPeriod = 0;
  const sampleLen = Math.min(len, 1000);
  const sample = text.slice(0, sampleLen);
  for (const stride of [4, 8, 16, 32]) {
    if (sampleLen <= stride) break;
    let matches = 0;
    for (let i = 0; i < sampleLen - stride; i++) {
      if (sample[i] === sample[i + stride]) matches++;
    }
    const rate = matches / (sampleLen - stride);
    if (rate > bestPeriod) bestPeriod = rate;
  }
  // Run-length compression hint: how much is consecutive-duplicate
  let runs = 0;
  let prev = -1;
  for (let i = 0; i < len; i++) {
    if (text.charCodeAt(i) !== prev) runs++;
    prev = text.charCodeAt(i);
  }
  const runlen = 1 - runs / len;
  return { charEntropy, firstNonWS, lineLenEntropy, periodic: bestPeriod, runlen };
}

function _domainMarkers(nums) {
  const n = nums.length;
  if (n === 0) return { timestamp: 0, ratio: 0, coordinate: 0 };
  // Timestamp markers: numbers near unix-epoch magnitude (>= 1e9, < 1e11)
  let ts = 0;
  for (const v of nums) {
    if (v >= 1e9 && v < 1e11) ts++;
  }
  const timestamp = ts / n;
  // Ratio markers: numbers in [-1, 1] excluding 0
  let r = 0;
  for (const v of nums) {
    if (v !== 0 && Math.abs(v) <= 1) r++;
  }
  const ratio = r / n;
  // Coordinate-shape markers: numbers in [-180, 180] (lat/lon)
  let coord = 0;
  for (const v of nums) {
    if (v >= -180 && v <= 180 && Math.abs(v) > 1) coord++;
  }
  const coordinate = coord / n;
  return { timestamp, ratio, coordinate };
}

function toNumericalWaveform(text) {
  const out = new Float64Array(LAYER_DIM);
  if (typeof text !== 'string' || text.length === 0) return out;

  const nums = _extractNumbers(text);
  const st = _stats(nums);
  const seq = _sequenceDynamics(nums);
  const dist = st ? _distributionShape(nums, st) : { medRatio: 0, logScale: 0, dominantBin: 0, tailHeavy: 0, uniqueFrac: 0 };
  const strct = _structuralSequence(text);
  const dom = _domainMarkers(nums);

  // ── Numeric statistics (dims 0..7) ───────────────────────────
  if (st) {
    const range = Math.max(1e-9, st.range);
    out[0] = _clip(0.5 + Math.tanh(st.mean / 1e6) * 0.5);          // normalized mean
    out[1] = _clip(st.std / Math.max(1, Math.abs(st.mean) + range));// CV-like
    out[2] = _clip(0.5 + Math.tanh(st.skew / 5) * 0.5);            // skew → [0,1]
    out[3] = _clip(Math.min(1, st.kurt / 20));                     // kurtosis (raw)
    out[4] = _clip(range / Math.max(1, Math.abs(st.mean) + range));// relative spread
    out[5] = _clip(st.posFrac);                                    // positive fraction
    out[6] = _clip(st.intFrac);                                    // integer fraction
    out[7] = _clip(Math.min(1, st.n / 256));                       // number density (per 256-cap)
  }

  // ── Sequence dynamics (dims 8..15) ───────────────────────────
  out[8] = _clip(0.5 + seq.autocorr * 0.5);                        // autocorr → [0,1]
  out[9] = _clip(seq.zeroCross);
  out[10] = _clip(0.5 + Math.tanh(seq.slope) * 0.5);
  out[11] = _clip(seq.monotone);
  out[12] = _clip(Math.min(1, seq.meanAbsChange / Math.max(1, st ? Math.abs(st.mean) + st.range : 1)));
  out[13] = _clip(Math.min(1, seq.maxAbsChange / Math.max(1, st ? st.range : 1)));
  out[14] = _clip(seq.incFrac);
  out[15] = _clip(seq.decFrac);

  // ── Distribution shape (dims 16..20) ─────────────────────────
  out[16] = _clip(Math.min(1, dist.medRatio));
  out[17] = _clip(dist.logScale);
  out[18] = _clip(dist.dominantBin);
  out[19] = _clip(dist.tailHeavy);
  out[20] = _clip(dist.uniqueFrac);

  // ── Structural sequence (dims 21..25) ────────────────────────
  out[21] = _clip(strct.charEntropy);
  out[22] = _clip(strct.firstNonWS);
  out[23] = _clip(strct.lineLenEntropy);
  out[24] = _clip(strct.periodic);
  out[25] = _clip(strct.runlen);

  // ── Domain markers (dims 26..28) ─────────────────────────────
  out[26] = _clip(dom.timestamp);
  out[27] = _clip(dom.ratio);
  out[28] = _clip(dom.coordinate);

  return out;
}

function numericalCoherency(a, b) {
  if (!a || !b || a.length !== b.length) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na < 1e-12 || nb < 1e-12) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

function inspectNumericalWaveform(text) {
  const v = toNumericalWaveform(text);
  return {
    stats: {
      mean: v[0], cv: v[1], skew: v[2], kurt: v[3],
      relSpread: v[4], posFrac: v[5], intFrac: v[6], density: v[7],
    },
    sequence: {
      autocorr: v[8], zeroCross: v[9], slope: v[10], monotone: v[11],
      meanAbsChange: v[12], maxAbsChange: v[13], incFrac: v[14], decFrac: v[15],
    },
    distribution: {
      medRatio: v[16], logScale: v[17], dominantBin: v[18],
      tailHeavy: v[19], uniqueFrac: v[20],
    },
    structural: {
      charEntropy: v[21], firstNonWS: v[22], lineLenEntropy: v[23],
      periodic: v[24], runlen: v[25],
    },
    domain: {
      timestamp: v[26], ratio: v[27], coordinate: v[28],
    },
  };
}

module.exports = {
  LAYER_DIM,
  toNumericalWaveform,
  numericalCoherency,
  inspectNumericalWaveform,
};
