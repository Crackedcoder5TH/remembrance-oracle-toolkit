/**
 * Oracle Patterns — Version history, rollback, and healing stats.
 */

module.exports = {
  rollback(patternId, targetVersion) {
    const { VersionManager } = require('../core/versioning');
    const vm = new VersionManager(this.patterns._sqlite);

    const history = vm.getHistory(patternId);
    if (!history || history.length === 0) {
      return { success: false, reason: 'No version history found for this pattern' };
    }

    const latest = history[0].version;
    const target = targetVersion || (latest > 1 ? latest - 1 : latest);
    const snapshot = vm.getVersion(patternId, target);
    if (!snapshot) return { success: false, reason: `Version ${target} not found` };

    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) return { success: false, reason: 'Pattern not found' };

    const previousCode = pattern.code;
    if (this.patterns._sqlite) {
      this.patterns._sqlite.updatePattern(patternId, { code: snapshot.code });
    }
    vm.saveSnapshot(patternId, snapshot.code, { action: 'rollback', restoredFrom: target });

    this._emit({ type: 'rollback', patternId, patternName: pattern.name, restoredVersion: target, previousVersion: latest });

    return { success: true, patternId, patternName: pattern.name, restoredVersion: target, previousVersion: latest, previousCode, restoredCode: snapshot.code };
  },

  verifyOrRollback(patternId) {
    const { sandboxExecute } = require('../core/sandbox');
    const pattern = this.patterns.getAll().find(p => p.id === patternId);
    if (!pattern) return { passed: false, reason: 'Pattern not found' };
    if (!pattern.testCode) return { passed: true, reason: 'No test code — skipped' };

    try {
      const result = sandboxExecute(pattern.code, pattern.testCode, { language: pattern.language });
      if (result.passed) {
        this._trackHealingSuccess(patternId, true);
        return { passed: true, patternId, patternName: pattern.name };
      }
    } catch (_) { /* fall through to rollback */ }

    this._trackHealingSuccess(patternId, false);
    const rollbackResult = this.rollback(patternId);
    return { passed: false, patternId, patternName: pattern.name, rolledBack: rollbackResult.success, restoredVersion: rollbackResult.restoredVersion };
  },

  /**
   * Track a healing attempt — persists to SQLite when available, falls back to in-memory Map.
   * Accepts optional coherency context for richer stats.
   */
  _trackHealingSuccess(patternId, succeeded, context = {}) {
    // Persist to SQLite if available
    const sqliteStore = this.patterns._sqlite;
    if (sqliteStore && typeof sqliteStore.recordHealingAttempt === 'function') {
      sqliteStore.recordHealingAttempt({
        patternId,
        succeeded,
        coherencyBefore: context.coherencyBefore || null,
        coherencyAfter: context.coherencyAfter || null,
        healingLoops: context.healingLoops || 0,
      });
    }

    // Also update in-memory Map for backward compatibility within the same session
    if (!this._healingStats) this._healingStats = new Map();
    const stats = this._healingStats.get(patternId) || { attempts: 0, successes: 0 };
    stats.attempts++;
    if (succeeded) stats.successes++;
    this._healingStats.set(patternId, stats);
  },

  /**
   * Get healing success rate — reads from SQLite if available, falls back to in-memory.
   * Uses composite boost for battle-tested patterns when DB is available.
   */
  getHealingSuccessRate(patternId) {
    // Prefer persistent DB stats with composite battle-tested boost
    const sqliteStore = this.patterns._sqlite;
    if (sqliteStore && typeof sqliteStore.getHealingCompositeBoost === 'function') {
      return sqliteStore.getHealingCompositeBoost(patternId);
    }

    // Fallback to in-memory
    if (!this._healingStats) return 1.0;
    const stats = this._healingStats.get(patternId);
    if (!stats || stats.attempts === 0) return 1.0;
    return stats.successes / stats.attempts;
  },

  /**
   * Get full healing stats — reads from SQLite if available, falls back to in-memory.
   */
  healingStats() {
    // Prefer persistent DB stats
    const sqliteStore = this.patterns._sqlite;
    if (sqliteStore && typeof sqliteStore.getAllHealingStats === 'function') {
      const dbStats = sqliteStore.getAllHealingStats();
      return {
        patterns: dbStats.patterns,
        totalAttempts: dbStats.totalAttempts,
        totalSuccesses: dbStats.totalSuccesses,
        overallRate: dbStats.totalAttempts > 0
          ? (dbStats.totalSuccesses / dbStats.totalAttempts).toFixed(3)
          : 'N/A',
        details: dbStats.details.map(d => ({
          id: d.id,
          name: d.name,
          attempts: d.attempts,
          successes: d.successes,
          rate: d.attempts > 0 ? (d.successes / d.attempts).toFixed(3) : 'N/A',
          avgDelta: d.avgDelta,
          peakCoherency: d.peakCoherency,
        })),
      };
    }

    // Fallback to in-memory
    if (!this._healingStats) return { patterns: 0, totalAttempts: 0, totalSuccesses: 0, details: [] };
    const details = [];
    let totalAttempts = 0, totalSuccesses = 0;
    for (const [id, stats] of this._healingStats) {
      const pattern = this.patterns.getAll().find(p => p.id === id);
      details.push({ id, name: pattern?.name || 'unknown', attempts: stats.attempts, successes: stats.successes, rate: stats.attempts > 0 ? (stats.successes / stats.attempts).toFixed(3) : 'N/A' });
      totalAttempts += stats.attempts;
      totalSuccesses += stats.successes;
    }
    return { patterns: this._healingStats.size, totalAttempts, totalSuccesses, overallRate: totalAttempts > 0 ? (totalSuccesses / totalAttempts).toFixed(3) : 'N/A', details };
  },

  /**
   * Query patterns that improved more than a threshold through healing.
   * Example: queryHealingImprovement(0.2) → patterns that improved 20%+
   */
  queryHealingImprovement(minDelta = 0.2) {
    const sqliteStore = this.patterns._sqlite;
    if (sqliteStore && typeof sqliteStore.queryHealingImprovement === 'function') {
      return sqliteStore.queryHealingImprovement(minDelta);
    }
    return [];
  },

  /**
   * Get healing lineage for a pattern — all healed variants with their ancestry.
   */
  getHealingLineage(patternId) {
    const sqliteStore = this.patterns._sqlite;
    if (sqliteStore && typeof sqliteStore.getHealingLineage === 'function') {
      return sqliteStore.getHealingLineage(patternId);
    }
    return { patternId, patternName: 'unknown', healingCount: 0, variants: [] };
  },
};
