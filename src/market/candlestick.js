'use strict';

/**
 * candlestick.js — the standard candlestick vocabulary, computed from an OHLCV
 * stream. Each detector reads the raw geometry of a bar (or a short run of bars)
 * and reports where the named pattern occurs. This is the classic technical-
 * analysis lexicon every trader loads; here it is just a labelling of the flow's
 * shape, so the substrate can consume named patterns alongside the raw numbers.
 *
 * Two layers:
 *   1. bar anatomy   — body, upper/lower shadow, range, direction, per-bar tags
 *      (doji, marubozu, hammer, shooting-star, spinning-top, ...): single-bar shape.
 *   2. formations    — engulfing, harami, piercing, dark-cloud, morning/evening
 *      star, three-white-soldiers, three-black-crows, tweezers: multi-bar shape.
 *
 * detectAll(candles) returns, per bar index, the list of pattern names that
 * complete AT that bar (multi-bar patterns are tagged on their final bar).
 * No signal, no scoring, no prediction — just the named shape as it presents.
 */

const EPS = 1e-9;

// --- single-bar anatomy -----------------------------------------------------
function anatomy(k) {
  const range = k.h - k.l;
  const body = Math.abs(k.c - k.o);
  const upper = k.h - Math.max(k.o, k.c);
  const lower = Math.min(k.o, k.c) - k.l;
  const bull = k.c > k.o;
  const bear = k.c < k.o;
  const mid = (k.h + k.l) / 2;
  return { range, body, upper, lower, bull, bear, mid,
    bodyFrac: range > EPS ? body / range : 0,
    upperFrac: range > EPS ? upper / range : 0,
    lowerFrac: range > EPS ? lower / range : 0 };
}

// per-bar single-candle tags. `avgBody` is the local mean body (for relative size)
function barTags(k, avgBody) {
  const a = anatomy(k);
  const tags = [];
  const big = a.body > 1.3 * avgBody;
  const small = a.body < 0.5 * avgBody;

  // doji family: negligible body relative to range
  if (a.bodyFrac < 0.08 && a.range > EPS) {
    if (a.upperFrac > 0.45 && a.lowerFrac > 0.45) tags.push('doji');
    else if (a.lowerFrac > 0.66 && a.upperFrac < 0.12) tags.push('dragonfly_doji');
    else if (a.upperFrac > 0.66 && a.lowerFrac < 0.12) tags.push('gravestone_doji');
    else tags.push('doji');
  }
  // marubozu: body is nearly the whole range (no shadows)
  if (a.bodyFrac > 0.92) tags.push(a.bull ? 'bullish_marubozu' : 'bearish_marubozu');
  // hammer / hanging man: small body up top, long lower shadow >=2x body, tiny upper
  if (a.bodyFrac > 0.08 && a.bodyFrac < 0.5 && a.lower >= 2 * a.body && a.upperFrac < 0.15)
    tags.push('hammer_shape');   // hanging-man vs hammer is context (trend), added in formations
  // shooting star / inverted hammer: long upper shadow >=2x body, tiny lower
  if (a.bodyFrac > 0.08 && a.bodyFrac < 0.5 && a.upper >= 2 * a.body && a.lowerFrac < 0.15)
    tags.push('star_shape');
  // spinning top: small body, shadows on both sides, not a doji
  if (a.bodyFrac >= 0.08 && a.bodyFrac < 0.35 && a.upperFrac > 0.25 && a.lowerFrac > 0.25)
    tags.push('spinning_top');
  if (big) tags.push(a.bull ? 'long_bull' : 'long_bear');
  if (small && !tags.includes('doji')) tags.push('small_body');
  return tags;
}

// local trend from the closes of the `look` bars before index i (sign of slope)
function trendBefore(candles, i, look = 5) {
  const s = Math.max(0, i - look), seg = candles.slice(s, i);
  if (seg.length < 2) return 0;
  const first = seg[0].c, last = seg[seg.length - 1].c;
  const d = (last - first) / (Math.abs(first) + EPS);
  return d > 0.005 ? 1 : d < -0.005 ? -1 : 0;
}

// --- multi-bar formations, tagged on their FINAL bar ------------------------
function formationsAt(candles, i, avgBody) {
  const out = [];
  const k = candles[i], p = candles[i - 1], a = anatomy(k);
  if (!p) return out;
  const ap = anatomy(p);
  const tr = trendBefore(candles, i);

  // engulfing: current body fully engulfs prior body, opposite colour
  if (a.bull && ap.bear && k.c >= p.o && k.o <= p.c && a.body > ap.body) out.push('bullish_engulfing');
  if (a.bear && ap.bull && k.o >= p.c && k.c <= p.o && a.body > ap.body) out.push('bearish_engulfing');

  // harami: current small body inside prior large body, opposite colour
  if (ap.body > 1.2 * avgBody && a.body < ap.body * 0.6) {
    const hi = Math.max(p.o, p.c), lo = Math.min(p.o, p.c);
    if (Math.max(k.o, k.c) <= hi && Math.min(k.o, k.c) >= lo)
      out.push(a.bull ? 'bullish_harami' : 'bearish_harami');
  }

  // piercing line / dark cloud cover: opposite colour, close pierces past prior midpoint
  if (a.bull && ap.bear && k.o < p.l && k.c > ap.mid && k.c < p.o) out.push('piercing_line');
  if (a.bear && ap.bull && k.o > p.h && k.c < ap.mid && k.c > p.o) out.push('dark_cloud_cover');

  // hammer / hanging man disambiguation by trend
  const kt = barTags(k, avgBody);
  if (kt.includes('hammer_shape')) out.push(tr < 0 ? 'hammer' : tr > 0 ? 'hanging_man' : 'hammer');
  if (kt.includes('star_shape')) out.push(tr > 0 ? 'shooting_star' : 'inverted_hammer');

  // tweezers: two bars sharing near-equal high (top) or low (bottom)
  const tol = 0.0015 * ((k.h + k.l) / 2 + EPS);
  if (Math.abs(k.h - p.h) < tol && ap.bull && a.bear) out.push('tweezer_top');
  if (Math.abs(k.l - p.l) < tol && ap.bear && a.bull) out.push('tweezer_bottom');

  // three-bar formations
  const q = candles[i - 2];
  if (q) {
    const aq = anatomy(q);
    // morning star: long bear, small-body gap-down star, long bull closing into first body
    if (aq.bear && aq.body > avgBody && Math.max(p.o, p.c) < q.c
        && ap.body < 0.5 * aq.body && a.bull && k.c > (q.o + q.c) / 2)
      out.push('morning_star');
    // evening star: mirror
    if (aq.bull && aq.body > avgBody && Math.min(p.o, p.c) > q.c
        && ap.body < 0.5 * aq.body && a.bear && k.c < (q.o + q.c) / 2)
      out.push('evening_star');
    // three white soldiers: three rising bulls, each opening within prior body
    if (aq.bull && ap.bull && a.bull && q.c < p.c && p.c < k.c
        && p.o > q.o && p.o < q.c && k.o > p.o && k.o < p.c)
      out.push('three_white_soldiers');
    // three black crows: mirror
    if (aq.bear && ap.bear && a.bear && q.c > p.c && p.c > k.c
        && p.o < q.o && p.o > q.c && k.o < p.o && k.o > p.c)
      out.push('three_black_crows');
  }
  return out;
}

/**
 * detectAll(candles) — annotate every bar with the patterns present.
 * Returns { perBar: [{ i, t, single:[...], formations:[...] }], counts: {name:n} }.
 * avgBody is a trailing 14-bar mean so "long"/"small" is relative to recent flow.
 */
function detectAll(candles) {
  const perBar = [];
  const counts = {};
  const bump = (n) => { counts[n] = (counts[n] || 0) + 1; };
  for (let i = 0; i < candles.length; i++) {
    const s = Math.max(0, i - 14);
    const win = candles.slice(s, i + 1);
    const avgBody = win.reduce((acc, c) => acc + Math.abs(c.c - c.o), 0) / win.length || EPS;
    const single = barTags(candles[i], avgBody).filter((t) => t !== 'hammer_shape' && t !== 'star_shape');
    const formations = formationsAt(candles, i, avgBody);
    single.forEach(bump); formations.forEach(bump);
    perBar.push({ i, t: candles[i].t, single, formations });
  }
  return { perBar, counts };
}

module.exports = { anatomy, barTags, trendBefore, formationsAt, detectAll };
