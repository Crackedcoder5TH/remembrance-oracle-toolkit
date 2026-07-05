'use strict';

/**
 * fractal-index.js — field-tool's mirror of oracle's FractalIndex.
 *
 * Same algorithm as src/core/fractal-index.js in the oracle package.
 * Two trusted reference implementations of the same in-memory cosine
 * index, just like the dual fractal-waveform.js encoders. Either can
 * load signatures produced by the other and serve identical top-K
 * results — the parity round-trip test in the oracle repo proves it.
 *
 * Use this when you want the substrate's pattern memory inside a
 * standalone process that doesn't import the oracle package. Load
 * signatures with loadSignatures(), then call search().
 *
 * Zero dependencies. Same minus-one rules as the rest of the field
 * tool: nothing requires the network, nothing requires disk.
 */

const { toFractalWaveform } = require('./fractal-waveform');
// L2/L3/L4 encoders are NOT part of the field-tool package — when
// callers want full 116-D queries, they hand the index a vector
// produced upstream (e.g. by the oracle's exportSignatures). For
// search() with a raw text query inside field-tool, we encode only
// L1 and zero-pad the remainder; depth=1 search remains exact.
// Callers wanting depth-4 query encoding should compose externally
// and pass the vector to searchVec().

const LAYER_DIM = 29;
// Depth-agnostic since the L5 migration. Signatures are stored zero-
// padded to MAX_DEPTH blocks: v1 (116-D) and v2 (145-D) coexist in one
// index — zero-padding is cosine-clean and the composition gate floors
// zero blocks by salience.
const MAX_DEPTH = 5;
const COMPOSED_DIM = LAYER_DIM * MAX_DEPTH;   // 145
const LEGACY_DIM = 116;                        // composed_v1

function _padToMax(vec) {
  if (!vec || vec.length === 0 || vec.length % LAYER_DIM !== 0 || vec.length > COMPOSED_DIM) return null;
  const out = new Float64Array(COMPOSED_DIM);
  for (let i = 0; i < vec.length; i++) out[i] = vec[i];
  return out;
}

function _l1Padded(text) {
  const out = new Float64Array(COMPOSED_DIM);
  const l1 = toFractalWaveform(text);
  for (let i = 0; i < LAYER_DIM; i++) out[i] = l1[i];
  return out;
}

function _norm(vec, dims) {
  let s = 0;
  for (let i = 0; i < dims; i++) s += vec[i] * vec[i];
  return Math.sqrt(s);
}

function _cosineAt(q, qn, p, pn, dims) {
  if (qn === 0 || pn === 0) return 0;
  let dot = 0;
  for (let i = 0; i < dims; i++) dot += q[i] * p[i];
  return dot / (qn * pn);
}

class FractalIndex {
  constructor() {
    this._ids = [];
    this._vecs = [];
    this._normsByDepth = new Array(MAX_DEPTH).fill(null);
    this._idIndex = new Map();
  }

  size() { return this._ids.length; }

  memoryBytes() {
    let s = this._ids.length * COMPOSED_DIM * 8;
    s += this._ids.length * 8 * MAX_DEPTH;
    for (const id of this._ids) s += id.length * 2;
    return s;
  }

  /**
   * Ingest signatures exported by the oracle's exportSignatures().
   * Accepts the JSON-safe form: [{ id, vec: number[] }]. Replaces any
   * existing index contents.
   */
  loadSignatures(items) {
    this._ids = [];
    this._vecs = [];
    this._idIndex = new Map();
    for (const it of items || []) {
      if (!it || it.id == null || !Array.isArray(it.vec)) continue;
      // Accept composed_v1 (116-D) and composed_v2 (145-D) — v1 is
      // zero-padded so both generations live in one index.
      const v = _padToMax(it.vec);
      if (!v) continue;
      this._idIndex.set(String(it.id), this._ids.length);
      this._ids.push(String(it.id));
      this._vecs.push(v);
    }
    this._rebuildNorms();
    return this.size();
  }

  /**
   * Add an L1-encoded entry (29-D in the first slot, zeros after).
   * For full 116-D entries, prefer loadSignatures() or addVec().
   */
  add(id, text) {
    const vec = _l1Padded(text);
    return this._insert(String(id), vec);
  }

  /**
   * Add a precomputed 116-D vector — the path the oracle uses to
   * push new patterns into a remote field-tool index.
   */
  addVec(id, vec) {
    const v = _padToMax(vec);
    if (!v) {
      throw new Error(`FractalIndex.addVec: expected a whole-block vector of at most ${COMPOSED_DIM} dims, got ${vec ? vec.length : 'none'}`);
    }
    return this._insert(String(id), v);
  }

  _insert(id, vec) {
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

  remove(id) {
    const sid = String(id);
    const idx = this._idIndex.get(sid);
    if (idx === undefined) return false;
    const last = this._ids.length - 1;
    if (idx !== last) {
      this._ids[idx] = this._ids[last];
      this._vecs[idx] = this._vecs[last];
      this._idIndex.set(this._ids[idx], idx);
    }
    this._ids.pop();
    this._vecs.pop();
    this._idIndex.delete(sid);
    this._rebuildNorms();
    return true;
  }

  _rebuildNorms() {
    const n = this._ids.length;
    for (let d = 0; d < MAX_DEPTH; d++) this._normsByDepth[d] = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const v = this._vecs[i];
      for (let d = 1; d <= MAX_DEPTH; d++) {
        this._normsByDepth[d - 1][i] = _norm(v, d * LAYER_DIM);
      }
    }
  }

  /**
   * Search with a raw text query. Field-tool can only encode L1, so
   * this defaults to depth=1. For depth-4 queries, encode upstream
   * and call searchVec().
   */
  search(text, opts = {}) {
    const depth = Math.max(1, Math.min(MAX_DEPTH, opts.depth || 1));
    return this.searchVec(_l1Padded(text), { ...opts, depth });
  }

  /**
   * Search with a precomputed 116-D query vector. This is the
   * round-trip path: oracle encodes at depth 4, hands the vector
   * over, field-tool returns top-K against its loaded substrate.
   */
  searchVec(qVec, opts = {}) {
    const topK = opts.topK || 10;
    const depth = Math.max(1, Math.min(MAX_DEPTH, opts.depth || 4));
    const minScore = opts.minScore || 0;
    const dims = depth * LAYER_DIM;
    if (!qVec || qVec.length < dims) return [];

    let qNorm = 0;
    for (let i = 0; i < dims; i++) qNorm += qVec[i] * qVec[i];
    qNorm = Math.sqrt(qNorm);
    if (qNorm === 0) return [];

    const pNorms = this._normsByDepth[depth - 1];
    const n = this._ids.length;
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
}

module.exports = {
  COMPOSED_DIM,
  LEGACY_DIM,
  MAX_DEPTH,
  LAYER_DIM,
  FractalIndex,
};
