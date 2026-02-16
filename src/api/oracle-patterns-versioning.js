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

  _trackHealingSuccess(patternId, succeeded) {
    if (!this._healingStats) this._healingStats = new Map();
    const stats = this._healingStats.get(patternId) || { attempts: 0, successes: 0 };
    stats.attempts++;
    if (succeeded) stats.successes++;
    this._healingStats.set(patternId, stats);
  },

  getHealingSuccessRate(patternId) {
    if (!this._healingStats) return 1.0;
    const stats = this._healingStats.get(patternId);
    if (!stats || stats.attempts === 0) return 1.0;
    return stats.successes / stats.attempts;
  },

  healingStats() {
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
};
