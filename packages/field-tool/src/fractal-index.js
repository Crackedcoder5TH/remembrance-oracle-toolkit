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
const COMPOSED_DIM = 116;

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
    this._normsByDepth = [null, null, null, null];
    this._idIndex = new Map();
  }

  size() { return this._ids.length; }

  memoryBytes() {
    let s = this._ids.length * COMPOSED_DIM * 8;
    s += this._ids.length * 8 * 4;
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
      if (it.vec.length !== COMPOSED_DIM) continue;
      const v = new Float64Array(COMPOSED_DIM);
      for (let i = 0; i < COMPOSED_DIM; i++) v[i] = it.vec[i];
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
    if (!vec || vec.length !== COMPOSED_DIM) {
      throw new Error(`FractalIndex.addVec: expected ${COMPOSED_DIM}-D vector, got ${vec ? vec.length : 'none'}`);
    }
    const v = vec instanceof Float64Array ? vec : Float64Array.from(vec);
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
    for (let d = 0; d < 4; d++) this._normsByDepth[d] = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const v = this._vecs[i];
      for (let d = 1; d <= 4; d++) {
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
    const depth = Math.max(1, Math.min(4, opts.depth || 1));
    return this.searchVec(_l1Padded(text), { ...opts, depth });
  }

  /**
   * Search with a precomputed 116-D query vector. This is the
   * round-trip path: oracle encodes at depth 4, hands the vector
   * over, field-tool returns top-K against its loaded substrate.
   */
  searchVec(qVec, opts = {}) {
    const topK = opts.topK || 10;
    const depth = Math.max(1, Math.min(4, opts.depth || 4));
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
  LAYER_DIM,
  FractalIndex,
};
