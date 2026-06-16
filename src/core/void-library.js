'use strict';

/**
 * void-library.js — reader for Void-Data-Compressor's canonical
 * pattern library at the composed fractal layer.
 *
 * The 256-D byte-stretch layer is deprecated. It gave false positives
 * (any text input scored ~0.9 against any text-derived library, the
 * encoder's known noise floor). The canonical encoder is the composed
 * fractal stack: 116-D = L1-structural + L2-lexical + L3-numerical +
 * L4-spectral (4 × 29-D depths; see encoder-stack.js). The 29-D L1
 * fractal is the base layer and the JS↔Python parity anchor (contract
 * C-71, verified against to_fractal_waveform.py). The index
 * (pattern_index_fractal.json) stores BOTH per pattern: `fractal`
 * (29-D L1) and `composed_v1` (116-D).
 *
 * What this module does:
 *   - Load both the 29-D L1 map and the 116-D composed map lazily on
 *     the first scoring call
 *   - scoreWithFlow(): the default — cosine FLOW across all four depths
 *     (d1=29, d2=58, d3=87, d4=116) per match, plus a shape label
 *   - score(): backward-compat single-cosine at L1 (29-D) only
 *
 * What this module does NOT do:
 *   - Read the deprecated 256-D byte library at all
 *   - Encode inputs (callers pre-encode via the encoder stack)
 *   - Mutate the library (growth happens when Void compresses new
 *     patterns and the fractal index is re-encoded)
 *
 * Memory: ~10MB after warmup. Lazy-loaded, cached for process lifetime.
 *
 * Pointing at a non-default Void path: set VOID_ROOT in the environment
 * or pass `voidRoot` to the constructor.
 */

const fs = require('node:fs');
const path = require('node:path');
const { FractalIndex } = require('./fractal-index');

const DEFAULT_VOID_ROOT = process.env.VOID_ROOT
  || '/home/user/Void-Data-Compressor';

class VoidLibrary {
  constructor(opts = {}) {
    this.voidRoot = opts.voidRoot || DEFAULT_VOID_ROOT;
    this.indexPath = path.join(this.voidRoot, 'pattern_index_fractal.json');
    this._fractals = null;     // Map<name, Float64Array(29)>
    this._composed = null;     // Map<name, Float64Array(116)> (composed_v1 when present)
    this._fractalIndex = null; // FractalIndex over the composed vectors (the search engine)
    this._loadError = null;
    this._loadAttempted = false;
    this._meta = null;
  }

  /**
   * Number of fractal-encoded patterns loaded. Triggers warmup.
   */
  size() {
    const m = this._ensureLoaded();
    return m ? m.size : 0;
  }

  /**
   * Score a pre-encoded 29-D fractal vector against the library.
   * Backward-compatible — returns single-cosine matches at L1.
   *
   * @param {Float64Array|number[]} inputFractal — 29-D fractal vector
   * @param {object} [opts]
   * @returns single-cosine top-K result
   */
  score(inputFractal, opts = {}) {
    const m = this._ensureLoaded();
    if (!m || m.size === 0) return null;
    if (!inputFractal || inputFractal.length === 0) return null;
    if (inputFractal.length !== 29) return null;

    const k = Math.max(1, opts.k || 5);
    const filter = typeof opts.filter === 'function' ? opts.filter : null;

    const scores = [];
    for (const [name, vec] of m) {
      if (filter && !filter(name)) continue;
      const cos = _cosine29(inputFractal, vec);
      if (Number.isFinite(cos)) {
        scores.push({ name, score: cos });
      }
    }
    if (scores.length === 0) {
      return {
        score: 0, meanTopK: 0, bestMatch: 0,
        topMatches: [], librarySize: m.size, filteredSize: 0,
      };
    }
    scores.sort((a, b) => b.score - a.score);
    const topMatches = scores.slice(0, k);
    const meanTopK = topMatches.reduce((s, mt) => s + mt.score, 0) / topMatches.length;
    return {
      score: meanTopK,
      meanTopK,
      bestMatch: topMatches[0].score,
      topMatches,
      librarySize: m.size,
      filteredSize: scores.length,
    };
  }

  /**
   * Score with FULL coherency flow at every depth (L1, L1+L2, L1+L2+L3,
   * L1+L2+L3+L4). For each top match, returns {d1, d2, d3, d4, shape}
   * rather than a single cosine. This is the flow-aware default.
   *
   * Caller provides the input encoded at both L1 (29-D fractal) and
   * composed (up to 116-D). If the library doesn't have composed
   * vectors for a match, the flow falls back to d1 at every depth.
   *
   * @param {Float64Array|number[]} inputL1        — 29-D L1 vector
   * @param {Float64Array|number[]} inputComposed  — full composed vector (up to 116-D)
   * @param {object} [opts]
   *   k?: number = 5
   *   filter?: (name) => boolean
   * @returns {{
   *   bestMatch: {name, d1, d2, d3, d4, shape, score} | null,
   *   meanTopK: number,
   *   topMatches: Array<{name, d1, d2, d3, d4, shape, score}>,
   *   librarySize: number,
   *   composedCoverage: number,   // fraction of matches with composed vectors
   * }}
   */
  scoreWithFlow(inputL1, inputComposed, opts = {}) {
    const m = this._ensureLoaded();
    if (!m || m.size === 0) return null;
    if (!inputL1 || inputL1.length !== 29) return null;

    const k = Math.max(1, opts.k || 5);
    const filter = typeof opts.filter === 'function' ? opts.filter : null;

    // Primary path — the field-tool default carries a composed query vector.
    // Serve it from the FractalIndex (precomputed-norm engine), so the whole
    // substrate runs ONE search engine instead of a second per-comparison loop
    // here. Identical cosines (composed[:29] == the L1 fractal), just without
    // recomputing both norms on every comparison.
    const fi = (inputComposed && inputComposed.length >= 116) ? this._ensureFractalIndex() : null;
    if (fi && fi.size() > 0) {
      const raw = fi.searchFlow(inputComposed, { k, filter });
      if (raw.length === 0) {
        return { bestMatch: null, meanTopK: 0, topMatches: [], librarySize: m.size, composedCoverage: 0 };
      }
      const top = raw.map((r) => ({
        name: r.id, d1: r.d1, d2: r.d2, d3: r.d3, d4: r.d4,
        shape: _classifyFlow(r), score: r.d4,
      }));
      const meanTopK = top.reduce((s, mt) => s + mt.d4, 0) / top.length;
      const composedCoverage = this._composed ? this._composed.size / m.size : 0;
      return { bestMatch: top[0], meanTopK, topMatches: top, librarySize: m.size, composedCoverage };
    }

    // Fallback — no composed query vector (L1-only callers): single cosine at L1.
    const composed = this._composed;
    const scored = [];
    let composedHits = 0, composedMisses = 0;
    for (const [name, l1Vec] of m) {
      if (filter && !filter(name)) continue;
      const d1 = _cosine29(inputL1, l1Vec);
      if (!Number.isFinite(d1)) continue;
      let d2 = d1, d3 = d1, d4 = d1;
      const cVec = composed ? composed.get(name) : null;
      if (cVec && inputComposed && inputComposed.length > 29) {
        composedHits++;
        const lenA = Math.min(inputComposed.length, cVec.length);
        if (lenA >= 58) d2 = _cosineN(inputComposed, cVec, 58);
        if (lenA >= 87) d3 = _cosineN(inputComposed, cVec, 87);
        if (lenA >= 116) d4 = _cosineN(inputComposed, cVec, 116);
      } else {
        composedMisses++;
      }
      const shape = _classifyFlow({ d1, d2, d3, d4 });
      scored.push({ name, d1, d2, d3, d4, shape, score: d4 });
    }
    if (scored.length === 0) {
      return { bestMatch: null, meanTopK: 0, topMatches: [], librarySize: m.size, composedCoverage: 0 };
    }
    scored.sort((a, b) => b.d4 - a.d4);
    const top = scored.slice(0, k);
    const meanTopK = top.reduce((s, mt) => s + mt.d4, 0) / top.length;
    const total = composedHits + composedMisses;
    return {
      bestMatch: top[0],
      meanTopK,
      topMatches: top,
      librarySize: m.size,
      composedCoverage: total > 0 ? composedHits / total : 0,
    };
  }

  /**
   * Diagnostics — load status + metadata from the fractal index.
   */
  status() {
    const loaded = this._fractals != null;
    return {
      loaded,
      loadError: this._loadError,
      voidRoot: this.voidRoot,
      indexPath: this.indexPath,
      indexPresent: fs.existsSync(this.indexPath),
      size: loaded ? this._fractals.size : 0,
      composedSize: this._composed ? this._composed.size : 0,
      meta: this._meta,
    };
  }

  _ensureLoaded() {
    if (this._fractals) return this._fractals;
    if (this._loadAttempted) return null;
    this._loadAttempted = true;

    try {
      if (!fs.existsSync(this.indexPath)) {
        this._loadError = 'pattern_index_fractal.json missing — run /tmp/encode-void-fractal.js to build it';
        return null;
      }
      const data = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
      if (!data || !data.index) {
        this._loadError = 'fractal index malformed';
        return null;
      }
      this._meta = {
        spec_version: data.spec_version,
        encoder: data.encoder,
        generated_at: data.generated_at,
        total_patterns: data.total_patterns,
        patterns_translated: data.patterns_translated,
        composed_v1_meta: data.composed_v1_meta || null,
      };
      const fractals = new Map();
      const composed = new Map();
      for (const [name, entry] of Object.entries(data.index)) {
        if (entry && Array.isArray(entry.fractal) && entry.fractal.length === 29) {
          fractals.set(name, Float64Array.from(entry.fractal));
        }
        if (entry && Array.isArray(entry.composed_v1) && entry.composed_v1.length >= 29) {
          composed.set(name, Float64Array.from(entry.composed_v1));
        }
      }
      this._fractals = fractals;
      this._composed = composed;
      return fractals;
    } catch (err) {
      this._loadError = err && err.message ? err.message : 'unknown';
      return null;
    }
  }

  /**
   * Lazily build the FractalIndex over the composed (116-D) vectors and
   * cache it for the process lifetime. This is the same precomputed-norm
   * search engine oracle's substrate uses — wiring the field-tool library
   * onto it means the WHOLE instrument runs one search engine, not two
   * parallel implementations that can drift.
   *
   * The vectors are already encoded (loaded from pattern_index_fractal.json),
   * so we hand them to FractalIndex pre-encoded via `vec` — no re-encode,
   * no encoder dependency, byte-identical to what scoreWithFlow read before.
   * The 5 L1-only entries that carry no composed_v1 are simply absent from
   * the index (46,529 of 46,534 have composed); they were never reachable by
   * the composed flow path anyway.
   *
   * Returns null when there is nothing composed to index, so the caller
   * falls back to the L1-only loop.
   */
  _ensureFractalIndex() {
    if (this._fractalIndex) return this._fractalIndex;
    this._ensureLoaded();
    if (!this._composed || this._composed.size === 0) return null;
    const fi = new FractalIndex();
    const items = [];
    for (const [name, vec] of this._composed) items.push({ id: name, vec });
    fi.rebuild(items);
    this._fractalIndex = fi;
    return fi;
  }
}

function _cosine29(a, b) {
  // Specialized for 29-D — branchless tight loop, no length checks
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < 29; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Cosine over the first N dims of two (possibly longer) vectors.
// Used for depth-aware reads (29 = d1, 58 = d2, 87 = d3, 116 = d4).
function _cosineN(a, b, n) {
  if (a.length < n || b.length < n) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < n; i++) {
    const x = a[i] || 0, y = b[i] || 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Shape of the coherency flow across the four depths.
// Mirrors classifyFlow in coherency-mapper to keep void-library
// standalone (so a fresh consumer can read flow without pulling in
// the mapper).
function _classifyFlow(f) {
  const values = [f.d1, f.d2, f.d3, f.d4];
  const max = Math.max(...values), min = Math.min(...values);
  const range = max - min;
  if (range < 0.05) {
    if (max > 0.90) return 'STABLE-HIGH';
    if (max < 0.50) return 'STABLE-LOW';
    return 'STABLE-MID';
  }
  let inc = 0, dec = 0;
  for (let i = 1; i < values.length; i++) {
    if (values[i] > values[i-1] + 0.01) inc++;
    if (values[i] < values[i-1] - 0.01) dec++;
  }
  if (dec >= 2 && inc <= 1) return 'DECAY';
  if (inc >= 2 && dec <= 1) return 'ASCENDING';
  return 'OSCILLATING';
}

const _default = new VoidLibrary();

module.exports = {
  VoidLibrary,
  /** L1-only score (backward-compat). */
  score: (fractalVec, opts) => _default.score(fractalVec, opts),
  /** Flow-aware score across all four depths. The default for new callers. */
  scoreWithFlow: (l1, composed, opts) => _default.scoreWithFlow(l1, composed, opts),
  /** Current library size (triggers lazy warmup). */
  size: () => _default.size(),
  /** Load status + diagnostics (does not trigger warmup). */
  status: () => _default.status(),
};
