'use strict';

/**
 * substrate-ledger.js — the substrate's TIME DIMENSION.
 *
 * Until now a pattern entered the substrate as a coherency vector with no sense
 * of WHEN it arrived. The retro-causal projector (atomic/temporal-projection)
 * therefore had nothing to stand on — with no ledger it returns identity (1.0)
 * every call, so it looked inert. It was not inert; it was unfed.
 *
 * This module gives every datum a time coordinate at the moment it is added:
 *   ledger.ingested_at   — wall-clock ISO of when it entered the substrate
 *   ledger.sequence      — the substrate's own monotonic clock (0,1,2,…)
 *   ledger.observed_start / observed_end / cadence — the data's OWN time window
 *                          (real timestamps for a market flow; the ingest instant
 *                          for a static artifact), the exact triple projectForward
 *                          reads to extrapolate a pattern past observed_end.
 * alongside the two readings the user asked to travel with it:
 *   coherence            — the coherency reading (0..1)
 *   tokens               — the token count of the compressed datum
 *
 * Every ingest path stamps through here, so the whole substrate shares one
 * clock and the retro-causal module always has a ledger to work off of.
 */

const clamp01 = (x) => (Number.isFinite(x) ? Math.max(0, Math.min(1, x)) : 0);

// the substrate's monotonic clock: one past the highest sequence already stored.
// Self-contained (derived from the index itself), so there is no separate clock
// file to drift from the data it orders.
function nextSequence(index) {
  let max = -1;
  for (const k of Object.keys(index)) {
    const s = index[k] && index[k].ledger && index[k].ledger.sequence;
    if (Number.isFinite(s) && s > max) max = s;
  }
  return max + 1;
}

// series-native coherency reading in [0,1]: how much temporal STRUCTURE a raw
// numeric series carries — geometric mean of |lag-1 autocorrelation| (smoothness)
// and the stronger of trend-fit / dominant-autocorrelation (deterministic shape).
// Noise → ~0; a clean trend or cycle → ~1.
function seriesCoherence(series) {
  if (!Array.isArray(series) || series.length < 4) return 0;
  const n = series.length;
  const m = series.reduce((a, b) => a + b, 0) / n;
  let v0 = 0, v1 = 0;
  for (let i = 0; i < n; i++) { v0 += (series[i] - m) ** 2; if (i) v1 += (series[i] - m) * (series[i - 1] - m); }
  const lag1 = v0 > 1e-12 ? Math.abs(v1 / v0) : 0;
  // trend fit (r²)
  let sX = 0, sY = 0, sXY = 0, sX2 = 0;
  for (let i = 0; i < n; i++) { sX += i; sY += series[i]; sXY += i * series[i]; sX2 += i * i; }
  const den = n * sX2 - sX * sX;
  const slope = den ? (n * sXY - sX * sY) / den : 0;
  const inter = (sY - slope * sX) / n;
  let ssr = 0; for (let i = 0; i < n; i++) ssr += (series[i] - (slope * i + inter)) ** 2;
  const r2 = v0 > 1e-12 ? Math.max(0, 1 - ssr / v0) : 0;
  // dominant autocorrelation strength (unbiased, skip lag 1)
  let acr = 0;
  for (let lag = 2; lag < Math.floor(n / 2); lag++) {
    let acc = 0; for (let i = 0; i + lag < n; i++) acc += (series[i] - m) * (series[i + lag] - m);
    const r = (acc / (n - lag)) / (v0 / n); if (r > acr) acr = r;
  }
  const structure = Math.max(r2, clamp01(acr));
  return clamp01(Math.sqrt(clamp01(lag1) * structure));
}

// token count of a compressed datum: samples for a numeric series, else a coarse
// token estimate for text/content (~4 chars/token).
function tokenCount({ series, content } = {}) {
  if (Array.isArray(series)) return series.length;
  if (typeof content === 'string') return Math.max(1, Math.round(content.length / 4));
  return 0;
}

/**
 * stamp(entry, opts) — attach the time dimension to a substrate entry in place.
 *   opts.sequence       (required) monotonic clock value from nextSequence(index)
 *   opts.now            ISO string; defaults to now
 *   opts.series         raw numeric series (market flow) → real observed window + coherence + tokens
 *   opts.content        raw text/content (code artifact) → ingest-instant window + token estimate
 *   opts.observedStart / opts.observedEnd  ISO — the data's own window (overrides)
 *   opts.cadence        e.g. '1d','1h','event' (default 'event')
 *   opts.coherence      explicit coherency reading (else derived from series/content)
 * Returns the same entry, now carrying { ledger, coherence, tokens }.
 */
function stamp(entry, opts = {}) {
  const now = opts.now || new Date().toISOString();
  const cadence = opts.cadence || (Array.isArray(opts.series) ? '1d' : 'event');
  const ledger = {
    ingested_at: now,
    sequence: Number.isFinite(opts.sequence) ? opts.sequence : 0,
    observed_start: opts.observedStart || now,
    observed_end: opts.observedEnd || now,
    cadence,
  };
  // UNMEASURED IS NOT ZERO.
  //
  // This used to fall back to `0` whenever no reading was available, which
  // writes "perfectly incoherent" into the substrate for a file nobody
  // measured — the strongest possible claim, made from no evidence. It also
  // drags every mean that includes it toward 0. When there is no reading, the
  // entry carries no `coherence` key at all, and consumers already gate on
  // `typeof c === 'number'` (see audit/repo-audit.js:153).
  //
  // seriesCoherence is still the fallback for an actual numeric SERIES, which
  // is the one input it is valid on. It is not applied to anything else.
  let coherence = opts.coherence;
  if (!Number.isFinite(coherence) && Array.isArray(opts.series)) {
    coherence = seriesCoherence(opts.series);
  }
  entry.ledger = ledger;
  if (Number.isFinite(coherence)) entry.coherence = clamp01(coherence);
  else delete entry.coherence;
  entry.tokens = tokenCount({ series: opts.series, content: opts.content });
  return entry;
}

// true when an entry carries enough of the time dimension for projectForward to act
// (a complete window ledger AND a raw waveform to extrapolate).
function isProjectable(entry) {
  const L = entry && entry.ledger;
  return !!(L && L.observed_start && L.observed_end && L.cadence && L.cadence !== 'event'
    && Array.isArray(entry.waveform) && entry.waveform.length >= 8);
}

module.exports = { stamp, nextSequence, seriesCoherence, tokenCount, isProjectable, clamp01 };
