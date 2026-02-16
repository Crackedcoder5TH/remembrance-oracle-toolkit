/**
 * Oracle Core — Feedback and auto-heal.
 * Records usage feedback and triggers automatic healing for failing patterns.
 */

module.exports = {
  /**
   * Records usage feedback for a verified history entry.
   */
  feedback(id, succeeded) {
    const updated = this.store.recordUsage(id, succeeded);
    if (!updated) {
      return { success: false, error: `Entry ${id} not found` };
    }
    this._emit({ type: 'feedback', id, succeeded, newReliability: updated.reliability.historicalScore });

    let healResult = null;
    if (!succeeded) {
      try {
        const { needsAutoHeal, autoHeal } = require('../evolution/evolution');
        const pattern = this.patterns.getAll().find(p => p.id === id);
        if (pattern && needsAutoHeal(pattern)) {
          const healed = autoHeal(pattern);
          if (healed && healed.improvement > 0) {
            this.patterns.update(id, { code: healed.code, coherencyScore: healed.coherencyScore });
            healResult = { healed: true, improvement: healed.improvement, newCoherency: healed.newCoherency };
            this._emit({ type: 'auto_heal', id, improvement: healed.improvement, newCoherency: healed.newCoherency });
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:feedback] auto-heal failed:', e.message);
      }
    }

    return { success: true, newReliability: updated.reliability.historicalScore, healResult };
  },

  /**
   * Records usage feedback for a pattern, updating usage stats and triggering auto-heal.
   */
  patternFeedback(id, succeeded) {
    const updated = this.patterns.recordUsage(id, succeeded);
    if (!updated) return { success: false, error: `Pattern ${id} not found` };

    const sqliteStore = this.patterns._sqlite;
    if (sqliteStore) {
      try { sqliteStore.updateVoterReputation(id, succeeded); } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:patternFeedback] voter reputation update failed:', e.message);
      }
    }

    let healResult = null;
    if (!succeeded) {
      try {
        const { needsAutoHeal, autoHeal } = require('../evolution/evolution');
        if (needsAutoHeal(updated)) {
          const healed = autoHeal(updated);
          if (healed && healed.improvement > 0) {
            this.patterns.update(id, { code: healed.code, coherencyScore: healed.coherencyScore });
            healResult = { healed: true, improvement: healed.improvement, newCoherency: healed.newCoherency };
            this._emit({ type: 'auto_heal', id, improvement: healed.improvement });
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:patternFeedback] auto-heal failed:', e.message);
      }
    }

    return { success: true, usageCount: updated.usageCount, successCount: updated.successCount, healResult };
  },
};
