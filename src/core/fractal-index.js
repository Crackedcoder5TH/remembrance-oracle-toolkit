'use strict';

/**
 * fractal-index.js — in-memory fractal-signature search engine.
 *
 * This is the substrate's native search at scale. It stores the
 * full 116-D composed signature for every pattern in memory and
 * answers top-K cosine queries with a tight brute-force scan —
 * exactly the same mechanism the field-tool library uses to
 * navigate its 43k-pattern corpus, just wired into oracle's
 * substrate instead of read from a static JSON.
 *
 * Why brute force, not ANN: at the dimensionality (116) and scale
 * (10k–1M patterns) the substrate actually carries, a tight loop
 * over Float64Arrays beats every approximate index until well past
 * the million mark, and it's deterministic — same query, same top-K,
 * always. ANN can be slotted in later as a drop-in `search` override.
 *
 * Encoder parity: by default this uses the field-tool's published
 * encoder so that any external caller using @crackedcoder5th/
 * remembrance-field gets identical signatures to the substrate.
 * The cross-implementation determinism gate proves these byte-match
 * oracle's internal copy across 2k+ adversarial inputs.
 */

const { toFractalWaveform } = require('../../packages/field-tool/src/fractal-waveform');
const { toLexicalWaveform } = require('./lexical-waveform');
const { toNumericalWaveform } = require('./numerical-waveform');
const { toSpectralWaveform } = require('./spectral-waveform');
const { toRedundancyWaveform } = require('./redundancy-waveform');
const { toContentProjection } = require('./content-projection');
const { toDimensionalWaveform } = require('./dimensional-waveform');

const LAYER_DIM = 29;
// Depth-agnostic since the L5 migration, extended to depth 7 on the L6+L7
// activation: vectors are stored zero-padded to MAX_DEPTH blocks. Zero-padding
// is mathematically clean for cosine (adds nothing to dot products or norms),
// and the composition gate's salience term floors any zero block automatically
// — so v1 (116-D), v2 (145-D), and v3/v4 (174/203-D) signatures coexist in one
// index without bias. A legacy 116-D vector padded to 203 has zero energy in
// L5-L7, so it compares cleanly at its shared depth against a full 203-D query
// (nothing must be re-encoded for correctness — only for deep discrimination).
const MAX_DEPTH = 7;
const COMPOSED_DIM = LAYER_DIM * MAX_DEPTH;   // 203

function _compose(text) {
  const out = new Float64Array(COMPOSED_DIM);
  const layers = [
    toFractalWaveform(text), toLexicalWaveform(text), toNumericalWaveform(text),
    toSpectralWaveform(text), toRedundancyWaveform(text),
    toContentProjection(text), toDimensionalWaveform(text),
  ];
  for (let l = 0; l < layers.length; l++) {
    for (let i = 0; i < LAYER_DIM; i++) out[l * LAYER_DIM + i] = layers[l][i];
  }
  return out;
}

/** Zero-pad any whole-block vector (116-D v1, 145-D v2, or a future
 *  deeper stack truncated) up to COMPOSED_DIM. Returns null when the
 *  length is not a positive multiple of LAYER_DIM. */
function _padToMax(vec) {
  if (!vec || vec.length === 0 || vec.length % LAYER_DIM !== 0) return null;
  if (vec.length === COMPOSED_DIM) return vec instanceof Float64Array ? vec : Float64Array.from(vec);
  if (vec.length > COMPOSED_DIM) return null;
  const out = new Float64Array(COMPOSED_DIM);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i];
  return out;
}

/**
 * Precompute the L2 norm of a signature so the cosine inner loop
 * only does one dot product per query — `cos = dot / (||q|| × ||p||)`
 * and ||p|| is fixed per pattern, ||q|| is fixed per query.
 */
function _norm(vec) {
  let s = 0;
  for (let i = 0; i < vec.length; i++) s += vec[i] * vec[i];
  return Math.sqrt(s);
}

/**
 * Cosine over the first `dims` elements of two Float64Arrays.
 * Hot loop — kept tight on purpose. No allocations, no branches
 * inside the loop body.
 */
function _cosineAt(q, qn, p, pn, dims) {
  if (qn === 0 || pn === 0) return 0;
  let dot = 0;
  for (let i = 0; i < dims; i++) dot += q[i] * p[i];
  return dot / (qn * pn);
}

class FractalIndex {
  /**
   * @param {Object} opts
   * @param {Function} [opts.encoder]  text → Float64Array(116). Defaults
   *   to the field-tool encoder stack. Override only for tests.
   */
  constructor(opts = {}) {
    this._encode = opts.encoder || _compose;
    this._ids = [];                              // parallel arrays — packed
    this._vecs = [];                             // Float64Array(116) per pattern
    this._norms = new Float64Array(0);           // precomputed ||p|| per pattern
    this._normsByDepth = new Array(MAX_DEPTH).fill(null); // ||p|| at depths 1..MAX_DEPTH
    this._idIndex = new Map();                   // id → array position
  }

  size() { return this._ids.length; }

  /**
   * Estimated memory footprint in bytes. Useful for capacity planning
   * — at 116 dims × 8 bytes = 928 bytes/vector, plus norms + id strings.
   */
  memoryBytes() {
    let s = this._ids.length * COMPOSED_DIM * 8;     // vectors
    s += this._ids.length * 8 * (MAX_DEPTH + 1);      // full + per-depth norm arrays
    for (const id of this._ids) s += id.length * 2;   // UTF-16 id strings
    return s;
  }

  /**
   * Add (or replace) a pattern. Returns the precomputed signature so
   * callers can cache it elsewhere if they want — e.g. write it back
   * to SQLite for cold-start rebuild.
   */
  add(id, text) {
    const vec = _padToMax(this._encode(text));
    if (!vec) {
      throw new Error(`FractalIndex.add: encoder must return a whole-block vector of at most ${COMPOSED_DIM} dims (multiple of ${LAYER_DIM})`);
    }
    const existing = this._idIndex.get(id);
    if (existing !== undefined) {
      this._vecs[existing] = vec;
    } else {
      this._idIndex.set(id, this._ids.length);
      this._ids.push(id);
      this._vecs.push(vec);
    }
    this._rebuildNorms();
    return vec;
  }

  /**
   * Bulk-load. Much faster than calling add() in a loop because the
   * norm tables are rebuilt once at the end instead of per-insert.
   */
  rebuild(items) {
    this._ids = [];
    this._vecs = [];
    this._idIndex = new Map();
    for (const { id, text, vec } of items) {
      const v = _padToMax(vec || this._encode(text));
      if (!v) continue;
      this._idIndex.set(id, this._ids.length);
      this._ids.push(id);
      this._vecs.push(v);
    }
    this._rebuildNorms();
  }

  remove(id) {
    const idx = this._idIndex.get(id);
    if (idx === undefined) return false;
    // Swap-and-pop — preserves O(1) deletion.
    const last = this._ids.length - 1;
    if (idx !== last) {
      this._ids[idx] = this._ids[last];
      this._vecs[idx] = this._vecs[last];
      this._idIndex.set(this._ids[idx], idx);
    }
    this._ids.pop();
    this._vecs.pop();
    this._idIndex.delete(id);
    this._rebuildNorms();
    return true;
  }

  _rebuildNorms() {
    const n = this._ids.length;
    this._norms = new Float64Array(n);
    for (let d = 0; d < MAX_DEPTH; d++) this._normsByDepth[d] = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const v = this._vecs[i];
      this._norms[i] = _norm(v);
      // Precompute partial norms at each depth so depth-aware queries
      // also avoid recomputing ||p|| on the fly.
      for (let d = 1; d <= MAX_DEPTH; d++) {
        let s = 0;
        const lim = d * LAYER_DIM;
        for (let k = 0; k < lim; k++) s += v[k] * v[k];
        this._normsByDepth[d - 1][i] = Math.sqrt(s);
      }
    }
  }

  /**
   * Search for the top-K most similar patterns.
   * @param {string} text          query text — encoded fresh
   * @param {Object} [opts]
   * @param {number} [opts.topK=10]
   * @param {number} [opts.depth=4]  1..MAX_DEPTH — which sub-stack to search.
   *   Depth 1 (29-D) is fastest and matches field-tool's L1 mode.
   *   Depth 4 (116-D, default) is the full stack and discriminates best.
   * @param {number} [opts.minScore=0]  drop matches below this cosine
   * @returns {Array<{id, score}>}  sorted by score descending
   */
  search(text, opts = {}) {
    const topK = opts.topK || 10;
    const depth = Math.max(1, Math.min(MAX_DEPTH, opts.depth || 4));
    const minScore = opts.minScore || 0;
    const dims = depth * LAYER_DIM;

    const qVec = this._encode(text);
    let qNorm = 0;
    for (let i = 0; i < dims; i++) qNorm += qVec[i] * qVec[i];
    qNorm = Math.sqrt(qNorm);
    if (qNorm === 0) return [];

    const pNorms = this._normsByDepth[depth - 1];
    const n = this._ids.length;

    // Heap-free top-K: maintain a small sorted array. K is small (≤100
    // in practice), so insertion-sort is faster than a real heap.
    const top = [];
    for (let i = 0; i < n; i++) {
      const score = _cosineAt(qVec, qNorm, this._vecs[i], pNorms[i], dims);
      if (score < minScore) continue;
      if (top.length < topK) {
        top.push({ id: this._ids[i], score });
        top.sort((a, b) => b.score - a.score);
      } else if (score > top[topK - 1].score) {
        top[topK - 1] = { id: this._ids[i], score };
        top.sort((a, b) => b.score - a.score);
      }
    }
    return top;
  }

  /**
   * Multi-depth flow score for a single comparison — mirrors the
   * field-tool's `scoreWithFlow()` shape. Returns cosine at each
   * depth so callers can see whether the match holds across the
   * stack or only at one layer.
   */
  flow(text, id) {
    const idx = this._idIndex.get(id);
    if (idx === undefined) return null;
    const qVec = this._encode(text);
    const pVec = this._vecs[idx];
    const out = {};
    for (let d = 1; d <= MAX_DEPTH; d++) {
      const dims = d * LAYER_DIM;
      let qn = 0, pn = 0, dot = 0;
      for (let k = 0; k < dims; k++) {
        qn += qVec[k] * qVec[k];
        pn += pVec[k] * pVec[k];
        dot += qVec[k] * pVec[k];
      }
      qn = Math.sqrt(qn); pn = Math.sqrt(pn);
      out['d' + d] = (qn === 0 || pn === 0) ? 0 : dot / (qn * pn);
    }
    return out;
  }

  /**
   * Vector-in flow search — the field-tool's scoreWithFlow path, served by
   * this precomputed-norm engine instead of a separate per-comparison loop.
   * Takes a pre-encoded composed query vector (>= 116-D) and returns the
   * top-K by d4 with the cosine at every depth. A single pass to 116 captures
   * the cumulative dot at each depth boundary; pattern norms are precomputed,
   * so the hot loop is one multiply-add per element — no per-comparison norm
   * recompute (the cost the field-tool's own loop was paying).
   *
   * @param {Float64Array|number[]} qComposed  query vector, length >= COMPOSED_DIM
   * @param {Object} [opts]  { topK|k=5, filter?(id)=>bool }
   * @returns {Array<{id, d1, d2, d3, d4}>}  sorted by d4 descending
   */
  searchFlow(qComposed, opts = {}) {
    const k = Math.max(1, opts.topK || opts.k || 5);
    const filter = typeof opts.filter === 'function' ? opts.filter : null;
    const n = this._ids.length;
    // Generation-tolerant: accept any whole-block query of at least
    // depth 4 (116-D composed_v1) up to MAX_DEPTH (145-D composed_v2).
    // The flow contract is d1..d4; d5 is reported when both sides
    // carry an L5 block, else 0 — the same zero-block convention the
    // padded store uses.
    if (!qComposed || qComposed.length < 4 * LAYER_DIM || n === 0) return [];
    const qDepth = Math.min(MAX_DEPTH, Math.floor(qComposed.length / LAYER_DIM));
    const qDims = qDepth * LAYER_DIM;

    // Query norms at each depth — computed once for the whole scan.
    const qn = new Float64Array(MAX_DEPTH);
    for (let d = 1; d <= qDepth; d++) {
      let s = 0;
      const lim = d * LAYER_DIM;
      for (let i = 0; i < lim; i++) s += qComposed[i] * qComposed[i];
      qn[d - 1] = Math.sqrt(s);
    }
    if (qn[3] === 0) return [];
    const pn = this._normsByDepth;

    const top = [];
    for (let i = 0; i < n; i++) {
      if (filter && !filter(this._ids[i])) continue;
      const p = this._vecs[i];
      // One pass to qDims, capturing the cumulative dot at each block boundary.
      // `dot` ends holding the full dot at the query's DEEPEST depth (qDims).
      let dot = 0, dot1 = 0, dot2 = 0, dot3 = 0;
      for (let kk = 0; kk < qDims; kk++) {
        dot += qComposed[kk] * p[kk];
        if (kk === LAYER_DIM - 1) dot1 = dot;
        else if (kk === 2 * LAYER_DIM - 1) dot2 = dot;
        else if (kk === 3 * LAYER_DIM - 1) dot3 = dot;
      }
      const d1 = (qn[0] && pn[0][i]) ? dot1 / (qn[0] * pn[0][i]) : 0;
      const d2 = (qn[1] && pn[1][i]) ? dot2 / (qn[1] * pn[1][i]) : 0;
      const d3 = (qn[2] && pn[2][i]) ? dot3 / (qn[2] * pn[2][i]) : 0;
      // d4 = cosine at the DEEPEST available depth (qDepth) — it consumes every
      // active layer L1..Lk. For a depth-4 query this is exactly the 116-D
      // cosine (unchanged); for a depth-7 query it folds in L5-L7. Legacy 116-D
      // patterns padded to COMPOSED_DIM carry zero energy in the deep blocks, so
      // they compare cleanly at the shared depth and top-K ranking is preserved.
      const dd = qDepth - 1;
      const d4 = (qn[dd] && pn[dd] && pn[dd][i]) ? dot / (qn[dd] * pn[dd][i]) : 0;
      if (top.length < k) {
        top.push({ id: this._ids[i], d1, d2, d3, d4 });
        top.sort((a, b) => b.d4 - a.d4);
      } else if (d4 > top[k - 1].d4) {
        top[k - 1] = { id: this._ids[i], d1, d2, d3, d4 };
        top.sort((a, b) => b.d4 - a.d4);
      }
    }
    return top;
  }
}

module.exports = {
  COMPOSED_DIM,
  LAYER_DIM,
  FractalIndex,
};
