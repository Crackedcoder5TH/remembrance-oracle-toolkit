'use strict';

/**
 * void-library.js — reader for Void-Data-Compressor's canonical
 * pattern library at the 29-D fractal layer.
 *
 * The 256-D byte-stretch layer is deprecated. It gave false positives
 * (any text input scored ~0.9 against any text-derived library, the
 * encoder's known noise floor). The canonical encoder is the 29-D
 * fractal one. The library is the 29-D translation:
 * pattern_index_fractal.json, produced by passing each Void pattern's
 * canonical record through toFractalWaveform (parity contract C-71,
 * verified against to_fractal_waveform.py).
 *
 * What this module does:
 *   - Load the 29-D fractal index lazily on first scoring call
 *   - Score a pre-encoded 29-D input vector against the library via
 *     cosine top-K with optional name-filter
 *
 * What this module does NOT do:
 *   - Read the deprecated 256-D byte library at all
 *   - Encode inputs (callers pre-encode via toFractalWaveform)
 *   - Mutate the library (growth happens by re-running the migration
 *     after Void compresses new patterns)
 *
 * Memory: ~10MB after warmup (42k vectors × 29 floats with overhead).
 * Lazy-loaded on first scoring call, cached for process lifetime.
 *
 * Pointing at a non-default Void path: set VOID_ROOT in the environment
 * or pass `voidRoot` to the constructor.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_VOID_ROOT = process.env.VOID_ROOT
  || '/home/user/Void-Data-Compressor';

class VoidLibrary {
  constructor(opts = {}) {
    this.voidRoot = opts.voidRoot || DEFAULT_VOID_ROOT;
    this.indexPath = path.join(this.voidRoot, 'pattern_index_fractal.json');
    this._fractals = null;     // Map<name, Float64Array(29)>
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
   *
   * @param {Float64Array|number[]} inputFractal — 29-D fractal vector
   * @param {object} [opts]
   *   k:        number of top matches to keep (default 5)
   *   filter?:  (name) => boolean — restrict to matching names
   * @returns {{
   *   score: number,
   *   meanTopK: number,
   *   bestMatch: number,
   *   topMatches: Array<{name: string, score: number}>,
   *   librarySize: number,
   *   filteredSize: number,
   * } | null}
   */
  score(inputFractal, opts = {}) {
    const m = this._ensureLoaded();
    if (!m || m.size === 0) return null;
    if (!inputFractal || inputFractal.length === 0) return null;
    if (inputFractal.length !== 29) {
      // The canonical encoder always produces 29-D. A different length
      // is a wrong-encoder mistake; refuse to score rather than silently
      // truncate (the very failure mode that motivated this rewrite).
      return null;
    }

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
      };
      const fractals = new Map();
      for (const [name, entry] of Object.entries(data.index)) {
        if (entry && Array.isArray(entry.fractal) && entry.fractal.length === 29) {
          fractals.set(name, Float64Array.from(entry.fractal));
        }
      }
      this._fractals = fractals;
      return fractals;
    } catch (err) {
      this._loadError = err && err.message ? err.message : 'unknown';
      return null;
    }
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

const _default = new VoidLibrary();

module.exports = {
  VoidLibrary,
  /** Score a pre-encoded 29-D fractal vector against Void's canonical library. */
  score: (fractalVec, opts) => _default.score(fractalVec, opts),
  /** Current library size (triggers lazy warmup). */
  size: () => _default.size(),
  /** Load status + diagnostics (does not trigger warmup). */
  status: () => _default.status(),
};
