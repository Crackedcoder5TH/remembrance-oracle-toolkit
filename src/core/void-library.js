'use strict';

/**
 * void-library.js — reader for Void-Data-Compressor's canonical
 * pattern library, the substrate against which field measurements
 * are scored.
 *
 * The library is the master pattern_index.json (~43k unique names /
 * ~79k total entries) backed by ~103 substrate JSON files in the
 * Void repo's root and `archive/legacy_pattern_files/` directory.
 * Each pattern is a `{name, waveform: number[256]}` tuple — the
 * LEGACY 256-D byte-stretch encoding (see code-to-waveform.js's
 * migration note for why). To score an input against this library,
 * encode it via `byteCodeToWaveform` (also 256-D) and compute cosine
 * similarity. Top-K mean is the resonance signal.
 *
 * What this module does NOT do:
 *   - Encode inputs (callers pre-encode and pass the waveform in).
 *   - Mutate the library (growing the library happens through Void's
 *     own compress pipeline; this is a read-side adapter).
 *   - Cross-encode (29-D fractal vs 256-D byte are not comparable;
 *     callers pick the right encoder for what they're measuring).
 *
 * Memory: ~88MB after first warmup (43k waveforms × 256 float64).
 * Lazy-loaded on first scoring call, cached for process lifetime.
 *
 * Pointing at a non-default Void path: set VOID_ROOT in the
 * environment, or pass `voidRoot` to the constructor.
 */

const fs = require('node:fs');
const path = require('node:path');

const DEFAULT_VOID_ROOT = process.env.VOID_ROOT
  || '/home/user/Void-Data-Compressor';

class VoidLibrary {
  constructor(opts = {}) {
    this.voidRoot = opts.voidRoot || DEFAULT_VOID_ROOT;
    this.archiveDir = path.join(this.voidRoot, 'archive', 'legacy_pattern_files');
    this.indexPath = path.join(this.voidRoot, 'pattern_index.json');
    this._index = null;
    this._waveforms = null;
    this._loadError = null;
    this._loadAttempted = false;
  }

  /**
   * Number of unique-named waveforms loaded. Triggers warmup.
   * Returns 0 if the library is unreachable.
   */
  size() {
    const wf = this._ensureLoaded();
    return wf ? wf.size : 0;
  }

  /**
   * Score a pre-encoded 256-D byte waveform against the library.
   *
   * @param {Float64Array|number[]} inputWaveform — 256-D byte-encoded
   * @param {object} [opts]
   *   k:        number of top matches to keep (default 5)
   *   filter?:  (name) => boolean — restrict to matching names (e.g. domain prefix)
   * @returns {{
   *   score: number,        // alias for meanTopK
   *   meanTopK: number,
   *   bestMatch: number,
   *   topMatches: Array<{name: string, score: number}>,
   *   librarySize: number,
   *   filteredSize: number,
   * } | null}
   */
  score(inputWaveform, opts = {}) {
    const wf = this._ensureLoaded();
    if (!wf || wf.size === 0) return null;
    if (!inputWaveform || inputWaveform.length === 0) return null;

    const k = Math.max(1, opts.k || 5);
    const filter = typeof opts.filter === 'function' ? opts.filter : null;

    const scores = [];
    for (const [name, vec] of wf) {
      if (filter && !filter(name)) continue;
      const cos = _cosine(inputWaveform, vec);
      if (Number.isFinite(cos)) {
        scores.push({ name, score: cos });
      }
    }
    if (scores.length === 0) {
      return {
        score: 0, meanTopK: 0, bestMatch: 0,
        topMatches: [], librarySize: wf.size, filteredSize: 0,
      };
    }
    scores.sort((a, b) => b.score - a.score);
    const topMatches = scores.slice(0, k);
    const meanTopK = topMatches.reduce((s, m) => s + m.score, 0) / topMatches.length;
    const bestMatch = topMatches[0].score;
    return {
      score: meanTopK,
      meanTopK,
      bestMatch,
      topMatches,
      librarySize: wf.size,
      filteredSize: scores.length,
    };
  }

  /**
   * Diagnostics: load status + per-source counts. Useful in tests and
   * scan-summary reports to confirm the substrate actually loaded.
   */
  status() {
    const loaded = this._waveforms != null;
    return {
      loaded,
      loadError: this._loadError,
      voidRoot: this.voidRoot,
      size: loaded ? this._waveforms.size : 0,
      indexPresent: fs.existsSync(this.indexPath),
    };
  }

  // ── internals ───────────────────────────────────────────────────

  _ensureLoaded() {
    if (this._waveforms) return this._waveforms;
    if (this._loadAttempted) return null;
    this._loadAttempted = true;

    try {
      const index = this._loadIndex();
      if (!index || !index.index) {
        this._loadError = 'pattern_index missing or malformed';
        return null;
      }

      // Group by substrate file to minimize disk reads.
      const byFile = new Map();
      for (const [name, refs] of Object.entries(index.index)) {
        if (!Array.isArray(refs)) continue;
        for (const ref of refs) {
          if (!ref || !ref.file) continue;
          if (!byFile.has(ref.file)) byFile.set(ref.file, []);
          byFile.get(ref.file).push({ name, i: ref.i });
        }
      }

      const waveforms = new Map();
      let filesRead = 0, filesMissing = 0;

      for (const [file, entries] of byFile) {
        const fp = this._resolveSubstrate(file);
        if (!fp) { filesMissing++; continue; }
        let data;
        try {
          data = JSON.parse(fs.readFileSync(fp, 'utf8'));
        } catch (_) { filesMissing++; continue; }
        filesRead++;
        const patterns = Array.isArray(data)
          ? data
          : (Array.isArray(data.patterns) ? data.patterns
             : (Array.isArray(data.index) ? data.index : []));
        for (const { name, i } of entries) {
          const p = patterns[i];
          if (!p) continue;
          const wf = p.waveform;
          if (!Array.isArray(wf) || wf.length !== 256) continue;
          if (!waveforms.has(name)) {
            waveforms.set(name, Float64Array.from(wf));
          }
        }
      }

      this._waveforms = waveforms;
      this._loadStats = { filesRead, filesMissing, totalIndexEntries: Object.keys(index.index).length };
      return waveforms;
    } catch (err) {
      this._loadError = err && err.message ? err.message : 'unknown';
      return null;
    }
  }

  _loadIndex() {
    if (this._index) return this._index;
    if (!fs.existsSync(this.indexPath)) return null;
    this._index = JSON.parse(fs.readFileSync(this.indexPath, 'utf8'));
    return this._index;
  }

  _resolveSubstrate(file) {
    const a = path.join(this.voidRoot, file);
    if (fs.existsSync(a)) return a;
    const b = path.join(this.archiveDir, file);
    if (fs.existsSync(b)) return b;
    return null;
  }
}

function _cosine(a, b) {
  const len = Math.min(a.length, b.length);
  if (len === 0) return 0;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// Module-level singleton so the 88MB warmup happens at most once
// per process. Callers that need isolation can instantiate their own.
const _default = new VoidLibrary();

module.exports = {
  VoidLibrary,
  /** Score a pre-encoded 256-D byte waveform against Void's library. */
  score: (waveform, opts) => _default.score(waveform, opts),
  /** Current library size (triggers lazy warmup). */
  size: () => _default.size(),
  /** Load status + diagnostics (does not trigger warmup). */
  status: () => _default.status(),
};
