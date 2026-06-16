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

const LAYER_DIM = 29;
const COMPOSED_DIM = 116;

function _compose(text) {
  const out = new Float64Array(COMPOSED_DIM);
  const l1 = toFractalWaveform(text);
  const l2 = toLexicalWaveform(text);
  const l3 = toNumericalWaveform(text);
  const l4 = toSpectralWaveform(text);
  for (let i = 0; i < LAYER_DIM; i++) {
    out[i] = l1[i];
    out[LAYER_DIM + i] = l2[i];
    out[2 * LAYER_DIM + i] = l3[i];
    out[3 * LAYER_DIM + i] = l4[i];
  }
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
    this._normsByDepth = [null, null, null, null]; // ||p|| at depths 1..4
    this._idIndex = new Map();                   // id → array position
  }

  size() { return this._ids.length; }

  /**
   * Estimated memory footprint in bytes. Useful for capacity planning
   * — at 116 dims × 8 bytes = 928 bytes/vector, plus norms + id strings.
   */
  memoryBytes() {
    let s = this._ids.length * COMPOSED_DIM * 8;     // vectors
    s += this._ids.length * 8 * 5;                    // 5 norm arrays
    for (const id of this._ids) s += id.length * 2;   // UTF-16 id strings
    return s;
  }

  /**
   * Add (or replace) a pattern. Returns the precomputed signature so
   * callers can cache it elsewhere if they want — e.g. write it back
   * to SQLite for cold-start rebuild.
   */
  add(id, text) {
    const vec = this._encode(text);
    if (vec.length !== COMPOSED_DIM) {
      throw new Error(`FractalIndex.add: encoder returned ${vec.length}-D vector, expected ${COMPOSED_DIM}`);
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
      const v = vec || this._encode(text);
      if (v.length !== COMPOSED_DIM) continue;
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
    for (let d = 0; d < 4; d++) this._normsByDepth[d] = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const v = this._vecs[i];
      this._norms[i] = _norm(v);
      // Precompute partial norms at each depth so depth-aware queries
      // also avoid recomputing ||p|| on the fly.
      for (let d = 1; d <= 4; d++) {
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
   * @param {number} [opts.depth=4]  1..4 — which sub-stack to search.
   *   Depth 1 (29-D) is fastest and matches field-tool's L1 mode.
   *   Depth 4 (116-D, default) is the full stack and discriminates best.
   * @param {number} [opts.minScore=0]  drop matches below this cosine
   * @returns {Array<{id, score}>}  sorted by score descending
   */
  search(text, opts = {}) {
    const topK = opts.topK || 10;
    const depth = Math.max(1, Math.min(4, opts.depth || 4));
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
    for (let d = 1; d <= 4; d++) {
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
}

module.exports = {
  COMPOSED_DIM,
  LAYER_DIM,
  FractalIndex,
};
