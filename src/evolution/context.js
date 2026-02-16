/**
 * OracleContext — Narrow interface for evolution modules.
 *
 * Instead of passing raw RemembranceOracle instances (tight coupling),
 * evolution modules receive an OracleContext that exposes only the
 * methods they actually need. This makes dependencies explicit,
 * testing easier (mock just the interface), and lets us swap
 * implementations without touching evolution code.
 *
 * Usage:
 *   const ctx = createOracleContext(oracle);
 *   evolve(ctx, options);
 *   selfImprove(ctx, options);
 *
 * For testing:
 *   const ctx = createOracleContext(mockOracle);
 *   // or build manually:
 *   const ctx = { getPatterns, updatePattern, emit, ... };
 */

/**
 * Create an OracleContext from a RemembranceOracle instance.
 *
 * @param {object} oracle - RemembranceOracle instance (or any object with compatible methods)
 * @returns {OracleContext} Narrow interface for evolution modules
 */
function createOracleContext(oracle) {
  return {
    // ─── Pattern access ───
    getPatterns: () => oracle.patterns.getAll(),
    updatePattern: (id, updates) => oracle.patterns.update(id, updates),
    getCandidates: () => (oracle.patterns.getCandidates ? oracle.patterns.getCandidates() : []),

    // ─── Oracle operations (best-effort, may not exist on all oracles) ───
    autoPromote: () => {
      if (typeof oracle.autoPromote === 'function') return oracle.autoPromote();
      return { promoted: 0, skipped: 0, vetoed: 0, total: 0 };
    },
    deepClean: (opts) => {
      if (typeof oracle.deepClean === 'function') return oracle.deepClean(opts);
      return { removed: 0 };
    },
    retagAll: (opts) => {
      if (typeof oracle.retagAll === 'function') return oracle.retagAll(opts);
      return { enriched: 0 };
    },
    recycle: (opts) => {
      if (typeof oracle.recycle === 'function') return oracle.recycle(opts);
      return { healed: 0 };
    },
    debugGrow: (opts) => {
      if (typeof oracle.debugGrow === 'function') return oracle.debugGrow(opts);
      return { processed: 0, generated: 0 };
    },

    // ─── Event emission ───
    emit: (event) => {
      if (typeof oracle._emit === 'function') oracle._emit(event);
    },

    // ─── Event subscription ───
    on: (callback) => {
      if (typeof oracle.on === 'function') return oracle.on(callback);
      return () => {}; // no-op unsubscribe
    },

    // ─── Direct DB access (for pruning — kept narrow) ───
    deletePattern: (id) => {
      try {
        const db = oracle.patterns._sqlite?.db || oracle.store?.db;
        if (db) {
          db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
        }
      } catch { /* skip if delete not supported */ }
    },
    pruneCandidates: (minCoherency) => {
      const sqliteStore = oracle.patterns._sqlite;
      if (sqliteStore && typeof sqliteStore.pruneCandidates === 'function') {
        sqliteStore.pruneCandidates(minCoherency);
        return true;
      }
      return false;
    },
    deleteCandidate: (id) => {
      try {
        const sqliteStore = oracle.patterns._sqlite;
        if (sqliteStore && typeof sqliteStore.deleteCandidate === 'function') {
          sqliteStore.deleteCandidate(id);
        }
      } catch { /* best effort */ }
    },

    // ─── Sync ───
    syncToGlobal: (opts) => {
      try {
        const { syncToGlobal } = require('../core/persistence');
        const sqliteStore = oracle.store?.getSQLiteStore?.();
        if (sqliteStore) {
          syncToGlobal(sqliteStore, opts);
          return { synced: true };
        }
      } catch { /* best effort */ }
      return { synced: false };
    },

    // ─── Insights ───
    actOnInsights: (opts) => {
      try {
        const { actOnInsights } = require('../analytics/actionable-insights');
        return actOnInsights(oracle, opts);
      } catch { /* best effort */ }
      return null;
    },

    // ─── Raw oracle reference (escape hatch for backward compat) ───
    _oracle: oracle,
  };
}

module.exports = { createOracleContext };
