'use strict';

/**
 * temporal-signature.js — the TIME dimension for market flows.
 *
 * The instrument reported that market families are near-degenerate as value-
 * shapes (~0.03 separation) and that the harvested waveforms weren't time-
 * aligned, so their eigenshapes came out as noise. This adds the missing axis:
 * a per-flow temporal signature (how the series moves through time, not just
 * what values it takes) and a real time ledger so the retro-causal projector
 * can act on it.
 *
 * The temporal features are read with the SAME primitives the retro-causal
 * module already uses (trend regression, unbiased autocorrelation), so the time
 * dimension the encoder contrasts against and the dimension the projector acts
 * on are one and the same — no second, divergent notion of "time".
 *
 * signature(closes) -> Float64Array (fixed-length temporal coordinate):
 *   [ trendSlope*, trendR2, acLag/maxLag, acRatio, ret1 (return autocorr@1;
 *     +momentum / −mean-reversion), realizedVol, driftSign, |drift| ]
 * ledgerFromCandles(candles, interval) -> { observed_start, observed_end, cadence }
 */

// interval string (crawler) -> cadence string the retro-causal module parses
const INTERVAL_CADENCE = { '1m': '1min', '5m': '5min', '15m': '15min', '1h': '1h', '6h': '6h', '1d': '1d', '1wk': '7d', '1mo': '30d' };

function ledgerFromCandles(candles, interval = '1d') {
  if (!Array.isArray(candles) || candles.length < 2) return null;
  const toISO = (sec) => new Date(sec * 1000).toISOString();
  return {
    observed_start: toISO(candles[0].t),
    observed_end: toISO(candles[candles.length - 1].t),
    cadence: INTERVAL_CADENCE[interval] || '1d',
  };
}

// return autocorrelation at lag 1 — sign separates momentum (+) from mean-reversion (−)
function retAutocorr1(closes) {
  const r = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log((closes[i] || 1e-9) / (closes[i - 1] || 1e-9)));
  if (r.length < 3) return 0;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  let num = 0, den = 0;
  for (let i = 0; i < r.length; i++) { den += (r[i] - m) ** 2; if (i) num += (r[i] - m) * (r[i - 1] - m); }
  return den > 1e-12 ? num / den : 0;
}

// dominant autocorrelation peak — mirrors temporal-projection._autocorrPeak
// (unbiased, normalized by pair count, skips the trivial lag-1 peak) but WITHOUT
// its field-coupling side effect, so a measurement call never writes to the field.
function autocorrPeak(w) {
  const n = w.length;
  if (n < 4) return { lag: 0, ratio: 0 };
  const mean = w.reduce((s, v) => s + v, 0) / n;
  const c = w.map((v) => v - mean);
  const var0 = c.reduce((s, v) => s + v * v, 0);
  if (var0 === 0) return { lag: 0, ratio: 0 };
  let bestLag = 0, bestRatio = 0;
  for (let lag = 2; lag < Math.floor(n / 2); lag++) {
    let acc = 0;
    for (let i = 0; i + lag < n; i++) acc += c[i] * c[i + lag];
    const r = (acc / (n - lag)) / (var0 / n);
    if (r > bestRatio) { bestRatio = r; bestLag = lag; }
  }
  return { lag: bestLag, ratio: bestRatio };
}

function realizedVol(closes) {
  const r = [];
  for (let i = 1; i < closes.length; i++) r.push(Math.log((closes[i] || 1e-9) / (closes[i - 1] || 1e-9)));
  if (!r.length) return 0;
  const m = r.reduce((a, b) => a + b, 0) / r.length;
  return Math.sqrt(r.reduce((s, v) => s + (v - m) ** 2, 0) / r.length);
}

/**
 * signature(closes) — the fixed-length temporal coordinate for a close-series.
 * Scale-free where it can be: slope is normalized by the series mean level so a
 * $300 index and a $15 VIX are comparable; vol and autocorrelations are already
 * scale-free.
 */
function signature(closes) {
  if (!Array.isArray(closes) || closes.length < 8) return new Float64Array(8);
  // trend via least-squares regression (slope + r2); autocorrelation via the
  // retro-causal module's own primitive so both notions of "time" agree.
  const n = closes.length;
  let sX = 0, sY = 0, sXY = 0, sX2 = 0;
  for (let i = 0; i < n; i++) { sX += i; sY += closes[i]; sXY += i * closes[i]; sX2 += i * i; }
  const denom = n * sX2 - sX * sX;
  const slope = denom ? (n * sXY - sX * sY) / denom : 0;
  const meanLevel = sY / n || 1;
  // r2
  const intercept = (sY - slope * sX) / n;
  let ssRes = 0, ssTot = 0; const meanY = sY / n;
  for (let i = 0; i < n; i++) { ssRes += (closes[i] - (slope * i + intercept)) ** 2; ssTot += (closes[i] - meanY) ** 2; }
  const r2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;
  // autocorrelation peak (dominant period + strength)
  const ac = autocorrPeak(closes);
  const maxLag = Math.max(2, Math.floor(n / 2));
  const drift = (closes[n - 1] - closes[0]) / (Math.abs(closes[0]) + 1e-9);
  return new Float64Array([
    Math.tanh(slope / (Math.abs(meanLevel) + 1e-9) * n),  // normalized total trend, squashed
    r2,
    Math.min(1, ac.lag / maxLag),
    Math.max(-1, Math.min(1, ac.ratio)),
    Math.max(-1, Math.min(1, retAutocorr1(closes))),
    Math.tanh(realizedVol(closes) * 20),
    Math.sign(drift),
    Math.tanh(Math.abs(drift)),
  ]);
}

module.exports = { signature, ledgerFromCandles, retAutocorr1, realizedVol, INTERVAL_CADENCE };

// ── Periodic-table declarations (covenant fractal, atomic scale) ──
// Each element's 13-dimension atomic identity, computed by the substrate's
// own extractAtomicProperties over the function body.
ledgerFromCandles.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
retAutocorr1.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
autocorrPeak.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 4, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
realizedVol.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 13, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
signature.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 1, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };
