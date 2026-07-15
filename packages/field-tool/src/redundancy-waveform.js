'use strict';

/**
 * redundancy-waveform.js — L5 encoder, designed from the residual
 * L1–L4 leave against an EXTERNAL reference instrument.
 *
 * Every earlier layer was designed from internal residual (the
 * monitor catching false-equivalences). L5 is the first layer with
 * an outside supervisor: the four-telescope convergence experiment
 * (scripts/convergence-experiment.cjs, telescope-4-minilm.mjs)
 * showed gzip's Normalized Compression Distance — a working
 * approximation of Kolmogorov complexity — orders "what is like
 * what" at Spearman 0.731 against the depth-4 stack, and SEES DOMAIN
 * STRUCTURE BETTER (kNN purity 0.774 vs 0.528). The gap is the map.
 *
 * What NCD sees that L1–L4 are blind to by design:
 *
 *   1. REDUNDANCY CHARACTER — how compressible a pattern is, how its
 *      internal repetition is distributed. L1 counts constructs, L2
 *      counts style fractions, L3/L4 read numeric series; none ask
 *      "how much of this pattern is repetition of itself?" — which is
 *      the single quantity a dictionary compressor is built to answer.
 *
 *   2. CONTENT IDENTITY — WHICH tokens, not just what kinds. The
 *      stack is deliberately content-blind (structure/style/dynamics/
 *      spectrum), so two files sharing an entire vocabulary read as
 *      unrelated unless their shapes agree. gzip literally compresses
 *      shared vocabulary; the stack needed a sketch of it.
 *
 * So L5 = "let the compressor itself be a sensor":
 *   dims 0..7   deflate-derived redundancy features (whole, halves,
 *               internal NCD between halves, level spread)
 *   dims 8..12  n-gram repetition structure + byte entropy
 *   dims 13..28 16-bucket hashed token histogram — the content sketch
 *
 * Output: 29-D Float64Array, values bounded in [0, 1].
 * Deterministic. Pure. Only stdlib (node:zlib) — no dependencies.
 *
 * Registered in encoder-stack.js with active:false — reachable via
 * composedAtDepth(input, 5) for experiments, but NOT part of the
 * default 116-D composition until it proves itself and the 116-D
 * consumers (Void parity, field-tool round-trip, classifier DIM map)
 * are deliberately migrated. Covenant before persistence.
 */

const zlib = require('node:zlib');

const LAYER_DIM = 29;
const SAMPLE_CHARS = 4000;   // deflate + n-gram window; keeps encode O(1)

function _clip(x) {
  if (!Number.isFinite(x)) return 0;
  if (x < 0) return 0;
  if (x > 1) return 1;
  return x;
}

function _deflateLen(buf, level) {
  try { return zlib.deflateSync(buf, { level }).length; }
  catch (_) { return buf.length; }
}

/** Compression ratio in [0,1]: 0 = incompressible, →1 = pure repetition. */
function _ratio(buf, level) {
  if (buf.length === 0) return 0;
  return _clip(1 - _deflateLen(buf, level) / buf.length);
}

function _ngramStats(input, n) {
  const total = Math.max(0, input.length - n + 1);
  if (total === 0) return { distinctFrac: 0, topRepeatFrac: 0 };
  const seen = new Map();
  for (let i = 0; i < total; i++) {
    const g = input.slice(i, i + n);
    seen.set(g, (seen.get(g) || 0) + 1);
  }
  let maxCount = 0;
  for (const c of seen.values()) if (c > maxCount) maxCount = c;
  return {
    distinctFrac: seen.size / total,
    topRepeatFrac: maxCount / total,
  };
}

function _byteEntropy(input) {
  const len = input.length;
  if (len === 0) return 0;
  const counts = new Map();
  for (let i = 0; i < len; i++) {
    const c = input.charCodeAt(i);
    counts.set(c, (counts.get(c) || 0) + 1);
  }
  let h = 0;
  for (const n of counts.values()) {
    const p = n / len;
    h -= p * Math.log2(p);
  }
  return Math.min(1, h / 8);
}

const _TOKEN_RE = /[A-Za-z_$][A-Za-z0-9_$]*/g;
const _VOCAB_BUCKETS = 16;

/** FNV-1a over a token — same hash family the trigram telescope used. */
function _fnv(tok) {
  let h = 2166136261;
  for (let i = 0; i < tok.length; i++) {
    h ^= tok.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function toRedundancyWaveform(input) {
  const out = new Float64Array(LAYER_DIM);
  if (typeof input !== 'string' || input.length === 0) return out;

  const sample = input.slice(0, SAMPLE_CHARS);
  const buf = Buffer.from(sample, 'utf8');
  const mid = buf.length >> 1;
  const a = buf.subarray(0, mid);
  const b = buf.subarray(mid);

  // ── Deflate-derived redundancy (dims 0..7) ─────────────────────
  const r9 = _ratio(buf, 9);
  const r1 = _ratio(buf, 1);
  out[0] = r9;                                  // deep redundancy
  out[1] = r1;                                  // shallow/greedy redundancy
  out[2] = _clip(r9 - r1);                      // structure only deep search finds
  const rA = _ratio(a, 9);
  const rB = _ratio(b, 9);
  out[3] = rA;
  out[4] = rB;
  out[5] = _clip(Math.abs(rA - rB));            // redundancy asymmetry
  if (a.length > 0 && b.length > 0) {
    const ca = _deflateLen(a, 9);
    const cb = _deflateLen(b, 9);
    const cab = _deflateLen(buf, 9);
    // Internal NCD between the halves: 0 = second half is pure echo of
    // the first, 1 = the halves share nothing a compressor can use.
    out[6] = _clip((cab - Math.min(ca, cb)) / Math.max(1, Math.max(ca, cb)));
    // Shared-information gain: how much smaller together than apart.
    out[7] = _clip((ca + cb - cab) / Math.max(1, Math.min(ca, cb)));
  }

  // ── Repetition structure + entropy (dims 8..12) ────────────────
  const g4 = _ngramStats(sample, 4);
  const g8 = _ngramStats(sample, 8);
  out[8] = _clip(1 - g4.distinctFrac);          // 4-gram repetitiveness
  out[9] = _clip(1 - g8.distinctFrac);          // 8-gram repetitiveness
  out[10] = _clip(g8.topRepeatFrac * 8);        // dominant-motif pressure
  out[11] = _byteEntropy(sample);
  // Token-level repetition: 1 - unique/total over word-ish tokens.
  const tokens = sample.match(_TOKEN_RE) || [];
  out[12] = tokens.length > 0
    ? _clip(1 - new Set(tokens).size / tokens.length)
    : 0;

  // ── Content sketch (dims 13..28) ───────────────────────────────
  // 16-bucket hashed histogram over lowercased tokens. This is the
  // layer's content-identity signal: two patterns sharing vocabulary
  // land mass in the same buckets even when their shapes differ.
  // L1-normalized so the sketch reads as a distribution.
  if (tokens.length > 0) {
    const buckets = new Float64Array(_VOCAB_BUCKETS);
    for (const t of tokens) buckets[_fnv(t.toLowerCase()) % _VOCAB_BUCKETS] += 1;
    for (let k = 0; k < _VOCAB_BUCKETS; k++) {
      out[13 + k] = _clip(buckets[k] / tokens.length);
    }
  }

  return out;
}

function redundancyCoherency(x, y) {
  if (!x || !y || x.length !== y.length) return 0;
  let dot = 0, nx = 0, ny = 0;
  for (let i = 0; i < x.length; i++) {
    dot += x[i] * y[i]; nx += x[i] * x[i]; ny += y[i] * y[i];
  }
  if (nx < 1e-12 || ny < 1e-12) return 0;
  return dot / (Math.sqrt(nx) * Math.sqrt(ny));
}

function inspectRedundancyWaveform(input) {
  const v = toRedundancyWaveform(input);
  return {
    deflate: {
      deepRatio: v[0], shallowRatio: v[1], levelSpread: v[2],
      firstHalf: v[3], secondHalf: v[4], asymmetry: v[5],
      internalNCD: v[6], sharedGain: v[7],
    },
    repetition: {
      gram4: v[8], gram8: v[9], dominantMotif: v[10],
      byteEntropy: v[11], tokenRepetition: v[12],
    },
    contentSketch: Array.from(v.slice(13, 29)),
  };
}

module.exports = {
  LAYER_DIM,
  toRedundancyWaveform,
  redundancyCoherency,
  inspectRedundancyWaveform,
};
