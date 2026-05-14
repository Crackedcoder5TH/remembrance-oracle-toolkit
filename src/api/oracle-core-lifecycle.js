/**
 * Oracle Core — Lifecycle, Events, and Quantum Field Operations.
 *
 * Manages the Oracle's lifecycle including quantum field maintenance:
 *   - Decoherence sweeps (decay unobserved patterns)
 *   - Field statistics (quantum state distribution)
 *   - Re-excitation (recover decohered patterns)
 *   - Entanglement graph traversal
 */

module.exports = {
  /**
   * Retrieves a specific entry from the verified history store by ID.
   */
  inspect(id) {
    if (id == null || typeof id !== 'string') return null;
    return this.store.get(id);
  },

  /**
   * Returns summary statistics for the verified history store.
   */
  stats() {
    return this.store.summary();
  },

  /**
   * Removes entries below the minimum coherency threshold.
   */
  prune(minCoherency = 0.4) {
    return this.store.prune(minCoherency);
  },

  pruneUntested() {
    return this.store.pruneUntested();
  },

  /**
   * Registers an event listener. Returns an unsubscribe function.
   */
  on(listener) {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter(l => l !== listener); };
  },

  _emit(event) {
    const snapshot = [...this._listeners];
    for (const listener of snapshot) {
      try { listener(event); } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:emit] listener error:', e.message);
      }
    }
  },

  /**
   * Auto-generate candidates from a proven pattern and sync to personal store.
   */
  _autoGrowFrom(pattern) {
    const report = { candidates: 0, synced: false };

    if (this.autoGrow && pattern) {
      try {
        const growth = this.recycler.generateFromPattern(pattern);
        report.candidates = growth.stored;
        report.candidateNames = growth.candidates;
        this._emit({
          type: 'auto_grow', pattern: pattern.name,
          candidatesGenerated: growth.stored, candidates: growth.candidates,
        });
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:autoGrow] candidate generation failed:', e.message);
      }
    }

    if (this.autoSync) {
      try {
        const { syncToGlobal } = require('../core/persistence');
        const sqliteStore = this.store.getSQLiteStore();
        if (sqliteStore) {
          syncToGlobal(sqliteStore, { minCoherency: 0.0 });
          report.synced = true;
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:autoSync] sync to personal store failed:', e.message);
      }
    }

    return report;
  },

  /**
   * Returns summary statistics for the pattern library.
   */
  patternStats() {
    return this.patterns.summary();
  },

  /**
   * Retires patterns below the minimum reliability score.
   */
  retirePatterns(minScore) {
    return this.patterns.retire(minScore);
  },

  // ─── Quantum Field Operations ───

  /**
   * Returns comprehensive quantum field statistics across all pattern tables.
   * This is the quantum equivalent of stats() — shows the state of the entire field.
   */
  quantumFieldStats() {
    if (!this._quantumField) {
      return { available: false, reason: 'Quantum field not initialized' };
    }
    return this._quantumField.stats();
  },

  /**
   * Run a decoherence sweep — decay unobserved patterns across all tables.
   * Should be run periodically to maintain field integrity.
   *
   * @param {object} [options] - { maxDays, minAmplitude }
   * @returns {object} Sweep report per table
   */
  decoherenceSweep(options = {}) {
    if (!this._quantumField) {
      return { available: false, reason: 'Quantum field not initialized' };
    }
    const report = this._quantumField.decoherenceSweep(options);
    this._emit({ type: 'decoherence_sweep', ...report });
    return report;
  },

  /**
   * Re-excite decohered patterns — bring them back from decoherence.
   * Like injecting energy into the quantum field to restore coherence.
   *
   * @param {string} [table] - Specific table, or null for all
   * @param {object} [options] - { boostAmount }
   * @returns {{ reexcited: number }}
   */
  reexciteField(table, options = {}) {
    if (!this._quantumField) {
      return { available: false, reason: 'Quantum field not initialized' };
    }
    const report = this._quantumField.reexcite(table, options);
    this._emit({ type: 'field_reexcited', ...report });
    return report;
  },

  /**
   * Get the entanglement graph for a pattern — all patterns it's linked to.
   *
   * @param {string} id - Pattern ID
   * @param {number} [depth] - Max traversal depth (default: 2)
   * @returns {{ nodes: Array, edges: Array }}
   */
  getEntanglementGraph(id, depth = 2) {
    if (!this._quantumField) {
      return { nodes: [], edges: [] };
    }
    return this._quantumField.getEntanglementGraph(id, depth);
  },

  /**
   * Manually entangle two patterns across any tables.
   *
   * @param {string} table - Table name (patterns, entries, candidates, debug_patterns)
   * @param {string} idA - First pattern ID
   * @param {string} idB - Second pattern ID
   */
  entangle(table, idA, idB) {
    if (!this._quantumField) return;
    this._quantumField.entangle(table, idA, idB);
    this._emit({ type: 'entangled', table, idA, idB });
  },
};
