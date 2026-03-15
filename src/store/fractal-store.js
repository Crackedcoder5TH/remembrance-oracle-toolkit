'use strict';

/**
 * FractalStore — Storage middleware that wraps SQLiteStore with automatic
 * fractal embedding and family management.
 *
 * Instead of the bridge being a connector between two systems, FractalStore
 * owns the invariant: "every pattern has an embedding, every family has
 * correct member counts."
 *
 * All pattern mutations go through FractalStore:
 *   add()    → SQLite + auto-embed + auto-family
 *   update() → SQLite + re-embed if code changed + re-family if structure changed
 *   remove() → archive + cascade cleanup (deltas, embeddings, template counts)
 *   search() → holo-first, fallback to keyword
 *
 * Read methods delegate directly to the underlying SQLiteStore.
 */

// Lazy-load compression modules to avoid circular deps and graceful degradation
let _holoEmbed, _structuralFingerprint, _holoSearchPatterns;
function _loadCompression() {
  if (!_holoEmbed) {
    try {
      const holo = require('../compression/holographic');
      _holoEmbed = holo.holoEmbed;
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[FractalStore] holographic not available:', e?.message);
    }
  }
  if (!_structuralFingerprint) {
    try {
      const fractal = require('../compression/fractal');
      _structuralFingerprint = fractal.structuralFingerprint;
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[FractalStore] fractal not available:', e?.message);
    }
  }
  if (!_holoSearchPatterns) {
    try {
      const compression = require('../compression/index');
      _holoSearchPatterns = compression.holoSearchPatterns;
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[FractalStore] compression index not available:', e?.message);
    }
  }
}

class FractalStore {
  /**
   * @param {import('./sqlite').SQLiteStore} sqlite - The underlying SQLiteStore
   */
  constructor(sqlite) {
    if (!sqlite) throw new Error('FractalStore requires a SQLiteStore instance');
    this._sqlite = sqlite;

    // Proxy: delegate any property access not defined on FractalStore to SQLiteStore.
    // This ensures FractalStore is a drop-in replacement — callers can access
    // db, storeDir, fractalStats(), getAllTemplates(), etc. transparently.
    return new Proxy(this, {
      get(target, prop, receiver) {
        // Own methods and properties take priority
        if (prop in target || typeof prop === 'symbol') {
          return Reflect.get(target, prop, receiver);
        }
        // Delegate to SQLiteStore
        const val = target._sqlite[prop];
        if (typeof val === 'function') {
          return val.bind(target._sqlite);
        }
        return val;
      },
    });
  }

  // ─── Reads (direct delegation) ───────────────────────────────────────

  getPattern(id) { return this._sqlite.getPattern(id); }
  getPatternByName(name) { return this._sqlite.getPatternByName(name); }
  getAllPatterns(filters) { return this._sqlite.getAllPatterns(filters); }

  // ─── Writes (with fractal integration) ───────────────────────────────

  /**
   * Add a pattern with automatic fractal integration.
   * Dedup-safe: skips or updates if (name, language) already exists.
   *
   * @param {object} pattern - Pattern data
   * @returns {object|null} The stored pattern record, or null if duplicate with equal/higher coherency
   */
  addPatternIfNotExists(pattern) {
    const record = this._sqlite.addPatternIfNotExists(pattern);
    if (record && record.id) {
      this._integratePattern(record);
    }
    return record;
  }

  /**
   * Alias used by some internal code paths.
   */
  addPattern(pattern) {
    return this.addPatternIfNotExists(pattern);
  }

  /**
   * Update a pattern's fields. If code changes, re-integrates fractal data.
   *
   * @param {string} id - Pattern ID
   * @param {object} updates - Fields to update
   * @returns {object|null} Updated pattern or null if not found
   */
  updatePattern(id, updates) {
    const codeChanging = 'code' in updates || 'testCode' in updates;

    // If code is changing, clean up old fractal data first
    if (codeChanging) {
      this._cleanupFractalData(id);
    }

    const result = this._sqlite.updatePattern(id, updates);

    // Re-integrate if code changed
    if (result && codeChanging) {
      this._integratePattern(result);
    }

    return result;
  }

  /**
   * Remove a pattern with cascade cleanup of all fractal data.
   *
   * @param {string} id - Pattern ID
   * @param {string} [reason='removed'] - Reason for removal (for archive)
   * @returns {boolean} Whether the pattern was found and removed
   */
  removePattern(id, reason = 'removed') {
    const row = this._sqlite.db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
    if (!row) return false;

    this._sqlite.db.exec('BEGIN');
    try {
      this._sqlite._archivePattern(row, reason);
      this._cleanupFractalData(id);
      this._sqlite.db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
      this._sqlite.db.exec('COMMIT');
      return true;
    } catch (e) {
      this._sqlite.db.exec('ROLLBACK');
      throw e;
    }
  }

  /**
   * Deduplicate patterns with automatic fractal cleanup.
   * Overrides SQLiteStore.deduplicatePatterns to ensure cleanup goes through us.
   */
  deduplicatePatterns(options = {}) {
    return this._sqlite.deduplicatePatterns(options);
  }

  /**
   * Retire low-scoring patterns with fractal cleanup.
   * Delegates to SQLiteStore which already calls _cleanupFractalData internally.
   */
  retirePatterns(minScore) {
    return this._sqlite.retirePatterns(minScore);
  }

  /**
   * Record pattern usage (delegates — no code change, no re-embed needed).
   */
  recordPatternUsage(id, succeeded) {
    return this._sqlite.recordPatternUsage(id, succeeded);
  }

  // ─── Search (holo-first with fallback) ───────────────────────────────

  /**
   * Holographic search across stored pages.
   * Returns results sorted by embedding similarity.
   *
   * @param {string} query - Search query text
   * @param {object} [options] - { topK, minScore }
   * @returns {Array<{ patternId: string, score: number, pageId: string }>}
   */
  holoSearch(query, options = {}) {
    _loadCompression();
    if (!_holoSearchPatterns) return [];
    try {
      return _holoSearchPatterns(this._sqlite, query, options);
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[FractalStore:holoSearch]', e?.message);
      return [];
    }
  }

  // ─── Fractal Integration (private) ───────────────────────────────────

  /**
   * Integrate a pattern into the fractal compression and holographic systems.
   * Computes and stores its 128D embedding, and joins an existing family if
   * its structural fingerprint matches a known template.
   *
   * @param {object} pattern - Pattern record with id, code, language, etc.
   * @returns {{ embedded: boolean, familyMatch: string|null }}
   */
  _integratePattern(pattern) {
    if (!pattern || !pattern.id) return { embedded: false, familyMatch: null };

    _loadCompression();
    let embedded = false;
    let familyMatch = null;

    try {
      // Step 1: Compute and store holographic embedding
      if (_holoEmbed && this._sqlite.storeHoloEmbedding) {
        const embedding = _holoEmbed(pattern);
        this._sqlite.storeHoloEmbedding(pattern.id, embedding);
        embedded = true;
      }

      // Step 2: Fingerprint and check for existing family membership
      if (_structuralFingerprint && pattern.code) {
        const fp = _structuralFingerprint(pattern.code, pattern.language);

        if (fp.hash && this._sqlite.getTemplate && this._sqlite.storeDelta) {
          const existingTemplate = this._sqlite.getTemplate(fp.hash);
          if (existingTemplate) {
            // Join the existing family
            this._sqlite.storeDelta({
              patternId: pattern.id,
              templateId: fp.hash,
              delta: fp.placeholders,
              originalSize: (pattern.code || '').length,
              deltaSize: JSON.stringify(fp.placeholders).length,
            });
            // Update template member count and avg coherency
            const newCount = (existingTemplate.memberCount || 0) + 1;
            const coherency = pattern.coherencyScore?.total ?? pattern.coherencyScore ?? 0;
            const newAvg = existingTemplate.memberCount > 0
              ? (existingTemplate.avgCoherency * existingTemplate.memberCount + coherency) / newCount
              : coherency;
            this._sqlite.storeTemplate({
              id: fp.hash,
              skeleton: existingTemplate.skeleton,
              language: existingTemplate.language,
              memberCount: newCount,
              avgCoherency: newAvg,
            });
            familyMatch = fp.hash;
          }
        }
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[FractalStore:_integratePattern]', e?.message);
    }

    return { embedded, familyMatch };
  }

  /**
   * Clean up fractal deltas, holographic embeddings, and update template
   * member counts when a pattern is removed or its code changes.
   *
   * @param {string} patternId
   */
  _cleanupFractalData(patternId) {
    this._sqlite._cleanupFractalData(patternId);
  }
}

module.exports = { FractalStore };
