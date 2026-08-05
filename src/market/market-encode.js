'use strict';

/**
 * market-encode.js — the bridge from a market flow to the substrate.
 *
 * The substrate encoder reads a normalized numeric series (compression, not
 * comprehension of text). This module serializes an OHLCV flow into the exact
 * form the encoder consumes, and encodes it at the current stack depth. It also
 * serializes the DERIVED flows a trader actually watches — returns, body,
 * range, and the candlestick-pattern occurrence stream — so the substrate sees
 * both the raw price flow and its shape vocabulary.
 *
 * The serialization matches the benchmarks' convention exactly: values scaled
 * by peak magnitude, fixed 5-dp, comma-joined — so a market flow lands in the
 * same representation space as every other series the substrate has witnessed.
 */

const { composedAtDepth, currentDepth } = require('../core/decoder-stack');
const { detectAll } = require('./candlestick');

// scale to peak magnitude, 5-dp, comma-join — the encoder's canonical series form
function ser(ys) {
  const finite = ys.filter(Number.isFinite);
  const m = Math.max(...finite.map(Math.abs)) || 1;
  return finite.map((y) => (y / m).toFixed(5)).join(',');
}

// the flows a market instrument exposes, each a 1-D series over the bars
function flows(candles) {
  const close = candles.map((k) => k.c);
  const ret = [];   // log returns
  for (let i = 1; i < candles.length; i++) ret.push(Math.log((candles[i].c || 1e-9) / (candles[i - 1].c || 1e-9)));
  const body = candles.map((k) => k.c - k.o);
  const range = candles.map((k) => k.h - k.l);
  const upper = candles.map((k) => k.h - Math.max(k.o, k.c));
  const lower = candles.map((k) => Math.min(k.o, k.c) - k.l);
  const vol = candles.map((k) => k.v || 0);
  return { close, ret, body, range, upper, lower, vol };
}

// candlestick occurrences as a numeric stream: per bar, count of patterns present
// (bullish tags +1, bearish tags -1, neutral 0) — a signed "shape pressure" flow
const BULL = /bull|hammer|piercing|morning|dragonfly|white_soldiers|tweezer_bottom|inverted_hammer/;
const BEAR = /bear|hanging|dark_cloud|evening|gravestone|black_crows|tweezer_top|shooting_star/;
function patternFlow(candles) {
  const { perBar } = detectAll(candles);
  return perBar.map((b) => {
    let s = 0;
    for (const n of [...b.single, ...b.formations]) s += BULL.test(n) ? 1 : BEAR.test(n) ? -1 : 0;
    return s;
  });
}

/**
 * encodeFlow(feed) — encode a single crawled instrument.
 * feed = { symbol, source, candles, ... }
 * Returns { symbol, source, bars, depth, vectors, patterns }
 *   vectors : one substrate vector per flow (close/ret/body/range/patternPressure)
 *   patterns: candlestick detection summary (perBar + counts)
 */
function encodeFlow(feed, { depth = currentDepth() } = {}) {
  const candles = feed.candles || [];
  if (candles.length < 3) return { symbol: feed.symbol, source: feed.source, bars: candles.length, depth, vectors: {}, patterns: { perBar: [], counts: {} }, error: feed.error || 'too few bars' };
  const f = flows(candles);
  const pf = patternFlow(candles);
  const enc = (ys) => Array.from(composedAtDepth(ser(ys), depth));
  const vectors = {
    close: enc(f.close),
    ret: enc(f.ret),
    body: enc(f.body),
    range: enc(f.range),
    patternPressure: enc(pf),
  };
  return { symbol: feed.symbol, source: feed.source, bars: candles.length, depth,
    vectors, patterns: detectAll(candles) };
}

// cosine over two equal-length vectors (for resonance between instruments/flows)
function cosine(a, b) {
  let d = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { d += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i]; }
  return (na > 1e-12 && nb > 1e-12) ? d / Math.sqrt(na * nb) : 0;
}

module.exports = { ser, flows, patternFlow, encodeFlow, cosine };
