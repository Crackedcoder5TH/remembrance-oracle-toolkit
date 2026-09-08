'use strict';

/**
 * void-library.js — reader for Void-Data-Compressor's canonical
 * pattern library at the ONE representation: the 232-D fractal decoder
 * at its active depth.
 *
 * AGENTS: patterns here are COMPRESSED, not text. Each entry is one
 * `composed` vector (232-D) — there is NO source text. The library was
 * built by running input through the void compressor once; the encoder
 * layers on the compressed waveform to catch residual. Never assume you
 * need (or that the substrate retained) the raw text. See
 * Void-Data-Compressor's AGENTS.md "READ THIS FIRST" block.
 *
 * Retired representations, never read here: the 256-D byte-stretch (any
 * text scored ~0.9 against any text-derived library — the encoder's noise
 * floor) and the 29-D L1 carried as a vector of its own (it is the first
 * block of the one vector and is read FROM it, never beside it). The
 * depth checkpoints (composed_v1 116-D, composed_v2 145-D, composed_v4
 * 203-D) are never read as a fallback either: an entry without the one
 * vector is not compared at all, and census() says how many there are.
 *
 * THE LIBRARY IS THE INDEX PLUS THE STORE. The substrate index holds the
 * witnessed files (~2.6k). The pattern library itself — 45,547 patterns as
 * 232-D vectors in Void's data/ store — is loaded beside it through
 * src/core/store-export.js (numpy exports it once per store version; node
 * reads the float32 rows). Rows are named `store/<stem>#<row>`.
 *
 * What this module does:
 *   - Load the composed map lazily on the first scoring call — index
 *     entries and store rows alike — and build ONE FractalIndex over it
 *   - scoreWithFlow(): the read — cosine FLOW across every active depth
 *     per match, plus a shape label; d4 carries the deepest reading
 *   - score(): the same read in the single-score shape older callers use
 *
 * What this module does NOT do:
 *   - Read any retired representation
 *   - Encode inputs (callers pre-encode via decoder-stack / codeToWaveform)
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
// One decoder, one cosine (ECOSYSTEM §7). This module used to compute its
// own checkpoints; tests/one-cosine-guard.test.js now fails CI if any
// module outside decoder-stack does.
const { currentDepth } = require('./decoder-stack');

const DEFAULT_VOID_ROOT = process.env.VOID_ROOT
  || '/home/user/Void-Data-Compressor';

const LAYER_DIM = 29; // one decoder layer; the canonical width is currentDepth() layers — asked for, never written down
function _canonicalWidth() { return currentDepth() * LAYER_DIM; }

class VoidLibrary {
  constructor(opts = {}) {
    this.voidRoot = opts.voidRoot || DEFAULT_VOID_ROOT;
    this.indexPath = path.join(this.voidRoot, 'pattern_index_fractal.json');
    this._fractals = null;     // loaded marker — the composed map below (ONE width; the 29-D L1 map is gone)
    this._composed = null;     // Map<name, Float64Array(232)> — the canonical `composed` (232-D decoder) per entry
    this._fractalIndex = null; // FractalIndex over the composed vectors (the search engine)
    this._loadError = null;
    this._loadAttempted = false;
    this._meta = null;
    this._store = null;        // { rows, width, sha } | { rows: 0, error } once loaded
  }

  /**
   * Number of fractal-encoded patterns loaded. Triggers warmup.
   */
  size() {
    const m = this._ensureLoaded();
    return m ? m.size : 0;
  }

  /**
   * The substrate's memory of one index entry (stored reading, its source,
   * width, witnessed-at), or null when the substrate has never seen it.
   * @param {string} name — the index key, e.g. `oracle/src/core/x.js`
   */
  entryMeta(name) {
    this._ensureLoaded();
    return (this._entryMeta && this._entryMeta.get(name)) || null;
  }

  /**
   * Census of the library: index entries (and how many carry a compressor
   * reading), store rows, and the store this came from. Triggers warmup.
   */
  census() {
    this._ensureLoaded();
    const entries = this._entryMeta ? this._entryMeta.size : 0;
    let withReading = 0, fromCompressor = 0;
    for (const m of (this._entryMeta ? this._entryMeta.values() : [])) {
      if (typeof m.coherence === 'number') withReading++;
      if (m.coherenceSource && String(m.coherenceSource).startsWith('void:')) fromCompressor++;
    }
    return { entries, withReading, fromCompressor, store: this._store || { rows: 0 }, loadError: this._loadError };
  }

  /**
   * Score a pre-encoded canonical vector against the library — the same
   * flow read as scoreWithFlow, published in the single-score shape older
   * callers read (`score`, `bestMatch` as a number, `topMatches[].score`).
   * This used to be a separate 29-D L1-only cosine; ONE width now.
   *
   * @param {Float64Array|number[]} vec — the 232-D decoder vector
   * @param {object} [opts]
   * @returns top-K result or null (no library, or not a canonical vector)
   */
  score(vec, opts = {}) {
    const r = this.scoreWithFlow(vec, opts);
    if (!r) return null;
    return {
      ...r,
      score: r.meanTopK,
      bestMatch: r.bestMatch ? r.bestMatch.d4 : 0,
      filteredSize: r.topMatches.length,
    };
  }

  /**
   * Score with FULL coherency flow at every active depth. For each top
   * match, returns {d1, d2, d3, d4, shape} rather than a single cosine —
   * d4 carries the DEEPEST reading (232-D today), not the fourth checkpoint.
   * This is the flow-aware default, and the only read.
   *
   * ONE width: the caller provides the canonical vector — the 232-D decoder
   * at its active depth. The L1 is its first 29 dims and is read FROM it
   * (FractalIndex.searchFlow), never handed in beside it. The old call
   * shape (inputL1, inputComposed, opts) is still accepted; the L1 argument
   * is dropped. A vector that is not canonical is not a reading → null.
   * There is no L1-only fallback loop any more: no index → null.
   *
   * @param {Float64Array|number[]} vec — the canonical 232-D decoder vector
   * @param {object} [opts]
   *   k?: number = 5
   *   filter?: (name) => boolean
   * @returns {{
   *   bestMatch: {name, d1, d2, d3, d4, shape, score} | null,
   *   meanTopK: number,
   *   topMatches: Array<{name, d1, d2, d3, d4, shape, score}>,
   *   librarySize: number,
   *   composedCoverage: number,   // every loaded entry carries the canonical vector: 1
   * }} | null
   */
  scoreWithFlow(vec, opts = {}, legacyOpts) {
    // Legacy call shape (inputL1, inputComposed, opts): the composed vector
    // is the reading; the L1 handed in beside it is dropped.
    if (opts && typeof opts.length === 'number' && (Array.isArray(opts) || ArrayBuffer.isView(opts))) {
      vec = opts; opts = legacyOpts || {};
    }
    const m = this._ensureLoaded();
    if (!m || m.size === 0) return null;
    if (!vec || vec.length !== _canonicalWidth()) return null;

    const k = Math.max(1, opts.k || 5);
    const filter = typeof opts.filter === 'function' ? opts.filter : null;

    // Served from the FractalIndex (precomputed-norm engine), so the whole
    // substrate runs ONE search engine — the same one oracle's substrate
    // search uses — instead of a per-comparison loop here.
    const fi = this._ensureFractalIndex();
    if (!fi || fi.size() === 0) return null;
    const raw = fi.searchFlow(vec, { k, filter });
    if (raw.length === 0) {
      return { bestMatch: null, meanTopK: 0, topMatches: [], librarySize: m.size, composedCoverage: 1 };
    }
    const top = raw.map((r) => ({
      name: r.id, d1: r.d1, d2: r.d2, d3: r.d3, d4: r.d4,
      shape: _classifyFlow(r), score: r.d4,
    }));
    const meanTopK = top.reduce((s, mt) => s + mt.d4, 0) / top.length;
    return { bestMatch: top[0], meanTopK, topMatches: top, librarySize: m.size, composedCoverage: 1 };
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
      const composed = new Map();
      // What the substrate REMEMBERS about each entry besides its vectors: the
      // compressor's stored reading and where it came from, the stored width,
      // when it was witnessed. The goggles' STATE line reads this per file.
      const meta = new Map();
      for (const [name, entry] of Object.entries(data.index)) {
        if (entry) {
          meta.set(name, {
            coherence: typeof entry.coherence === 'number' ? entry.coherence : null,
            coherenceSource: entry.coherence_source || null,
            width: entry.composed_width || (Array.isArray(entry.composed) ? entry.composed.length : null),
            ingestedAt: (entry.ledger && entry.ledger.ingested_at) || entry.ingested_at || null,
          });
        }
        // ONE WIDTH. Only the canonical vector under its own name — `composed`,
        // the 232-D decoder at the active depth (redecode / harvest write it;
        // `--do redecode all` measured every entry canonical on 2026-09-07) —
        // enters the library. The old checkpoints (composed_v1 116-D,
        // composed_v2 145-D, composed_v4 203-D) are never read as a fallback:
        // an entry without the one vector is not compared at all, and the
        // census below says how many there are.
        const deep = entry && Array.isArray(entry.composed) && entry.composed.length % 29 === 0 && entry.composed.length >= 116 && entry.composed;
        if (deep) composed.set(name, Float64Array.from(deep));
      }
      // The pattern library proper: every store row, at the canonical width.
      const { loadStore } = require('./store-export');
      const store = loadStore();
      if (store.error) {
        this._store = { rows: 0, error: store.error };
      } else {
        const { rows, width, data, stems } = store;
        for (let i = 0; i < rows; i++) {
          const row = data.subarray(i * width, (i + 1) * width);
          const name = `store/${stems[i] || 'unknown'}#${i}`;
          composed.set(name, row);
        }
        this._store = { rows, width, sha: store.sha };
      }
      this._fractals = composed; // the loaded marker holds the ONE map
      this._composed = composed;
      this._entryMeta = meta;
      return composed;
    } catch (err) {
      this._loadError = err && err.message ? err.message : 'unknown';
      return null;
    }
  }

  /**
   * Lazily build the FractalIndex over the canonical vectors and cache it
   * for the process lifetime. This is the same precomputed-norm search
   * engine oracle's substrate uses — wiring the field-tool library onto it
   * means the WHOLE instrument runs one search engine, not two parallel
   * implementations that can drift. The vectors are already encoded, so
   * they are handed to FractalIndex pre-encoded via `vec` — no re-encode.
   * Returns null when there is nothing to index (the caller reads null:
   * no resonance, never a narrower one).
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
_canonicalWidth.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "even", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };


// Shape of the coherency flow across the four depths.
// Mirrors classifyFlow in coherency-mapper to keep void-library
// standalone (so a fresh consumer can read flow without pulling in
// the mapper).
function _classifyFlow(f) {
  // Accepts the canonical flow array (one reading per active layer) or
  // the legacy {d1..d4} object that fractal-index.searchFlow publishes by
  // design. Naming a fixed four here would re-truncate whatever the
  // caller went to the trouble of measuring.
  const values = Array.isArray(f)
    ? f.filter((x) => typeof x === 'number' && isFinite(x))
    : [f.d1, f.d2, f.d3, f.d4];
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
_classifyFlow.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 2, period: 3, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

const _default = new VoidLibrary();

module.exports = {
  VoidLibrary,
  /** The flow read in the single-score shape (backward-compat). */
  score: (fractalVec, opts) => _default.score(fractalVec, opts),
  /** Flow-aware score across every active depth over the canonical vector. The read. */
  scoreWithFlow: (vec, opts, legacyOpts) => _default.scoreWithFlow(vec, opts, legacyOpts),
  /** Current library size (triggers lazy warmup). */
  size: () => _default.size(),
  /** Load status + diagnostics (does not trigger warmup). */
  status: () => _default.status(),
};
