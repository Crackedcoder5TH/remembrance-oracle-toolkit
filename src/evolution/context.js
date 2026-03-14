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
          // Archive before delete for recovery safety
          const row = db.prepare('SELECT * FROM patterns WHERE id = ?').get(id);
          if (row) {
            // SAFETY: Refuse to delete high-coherency patterns or those with tests
            const coherency = row.coherency_total || 0;
            if (coherency >= 0.8) {
              if (process.env.ORACLE_DEBUG) console.warn(`[context:deletePattern] BLOCKED deletion of high-coherency pattern ${id} (${coherency})`);
              return;
            }
            if (row.test_code && row.test_code.trim().length > 20) {
              if (process.env.ORACLE_DEBUG) console.warn(`[context:deletePattern] BLOCKED deletion of tested pattern ${id}`);
              return;
            }
            const now = new Date().toISOString();
            try {
              db.prepare(`
                INSERT OR IGNORE INTO pattern_archive
                  (id, name, code, language, pattern_type, coherency_total, coherency_json,
                   test_code, tags, deleted_reason, deleted_at, original_created_at, full_row_json)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
              `).run(
                row.id, row.name, row.code, row.language || 'unknown',
                row.pattern_type || 'utility', row.coherency_total || 0,
                row.coherency_json || '{}', row.test_code || null,
                row.tags || '[]', 'evolution-context-delete', now, row.created_at || null,
                JSON.stringify(row)
              );
            } catch (e) {
              if (process.env.ORACLE_DEBUG) console.warn('[context:deletePattern] archive table may not exist:', e?.message || e);
              // Archive failed — abort deletion to prevent data loss
              return;
            }
          }
          db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[context:deletePattern] skip if delete not supported:', e?.message || e);
      }
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
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[context:deleteCandidate] best effort:', e?.message || e);
      }
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
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[context:syncToGlobal] best effort:', e?.message || e);
      }
      return { synced: false };
    },

    // ─── Insights ───
    actOnInsights: (opts) => {
      try {
        const { actOnInsights } = require('../analytics/actionable-insights');
        return actOnInsights(oracle, opts);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[context:actOnInsights] best effort:', e?.message || e);
      }
      return null;
    },

    // ─── Raw oracle reference (escape hatch for backward compat) ───
    _oracle: oracle,
  };
}

module.exports = { createOracleContext };
