/**
 * Oracle Core — Lifecycle, events, and stats.
 * Inspect, prune, stats, event emitter, and auto-growth.
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

  /**
   * Registers an event listener. Returns an unsubscribe function.
   */
  on(listener) {
    this._listeners.push(listener);
    return () => { this._listeners = this._listeners.filter(l => l !== listener); };
  },

  _emit(event) {
    for (const listener of this._listeners) {
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
          syncToGlobal(sqliteStore, { minCoherency: 0.6 });
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
};
