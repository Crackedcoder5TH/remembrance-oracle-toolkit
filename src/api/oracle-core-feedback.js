/**
 * Oracle Core — Feedback and auto-heal.
 * Records usage feedback and triggers automatic healing for failing patterns.
 */

const { auditLog } = require('../core/audit-logger');
const { captureFeedbackDebug } = require('../ci/auto-debug');

module.exports = {
  /**
   * Records usage feedback for a verified history entry.
   */
  feedback(id, succeeded) {
    const updated = this.store.recordUsage(id, succeeded);
    if (!updated) {
      return { success: false, error: `Entry ${id} not found` };
    }
    this._emit({ type: 'feedback', id, succeeded, newReliability: updated?.reliability?.historicalScore ?? null });

    // Record in temporal memory for health tracking
    try {
      const tm = this.getTemporalMemory?.();
      if (tm) {
        tm.record(id, succeeded ? 'success' : 'failure', {
          context: 'feedback',
          successRate: updated?.reliability?.historicalScore ?? null,
        });
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[oracle-core-feedback:feedback] temporal memory not available:', e?.message || e);
    }

    let healResult = null;
    if (!succeeded) {
      try {
        const { needsAutoHeal, autoHeal } = require('../evolution/evolution');
        const { covenantCheck } = require('../core/covenant');
        const pattern = this.patterns._sqlite
          ? this.patterns._sqlite.getPattern(id)
          : this.patterns.getAll().find(p => p.id === id);
        if (pattern && needsAutoHeal(pattern)) {
          const healed = autoHeal(pattern);
          if (healed && healed.improvement > 0) {
            // Re-validate healed code against the Covenant before storing
            const check = covenantCheck(healed.code, { description: `auto-heal:${id}`, trusted: false });
            if (check.sealed) {
              this.patterns.update(id, { code: healed.code, coherencyScore: healed.coherencyScore });
              healResult = { healed: true, improvement: healed.improvement, newCoherency: healed.newCoherency };
              this._emit({ type: 'auto_heal', id, improvement: healed.improvement, newCoherency: healed.newCoherency });
            } else if (process.env.ORACLE_DEBUG) {
              console.warn(`[oracle:feedback] auto-heal rejected by covenant for ${id}`);
            }
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:feedback] auto-heal failed:', e.message);
      }
    }

    // Auto-capture debug patterns from failed feedback and forward healed code
    if (!succeeded) {
      try {
        const entry = this.store.get(id);
        captureFeedbackDebug(this, id, entry, healResult);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[feedback] auto-debug capture failed:', e?.message || e);
      }
    }

    auditLog('feedback', { id, success: succeeded, meta: { newReliability: updated?.reliability?.historicalScore ?? null, healed: !!healResult?.healed } });
    return { success: true, newReliability: updated?.reliability?.historicalScore ?? null, healResult };
  },

  /**
   * Records usage feedback for a pattern, updating usage stats and triggering auto-heal.
   */
  patternFeedback(id, succeeded) {
    const updated = this.patterns.recordUsage(id, succeeded);
    if (!updated) return { success: false, error: `Pattern ${id} not found` };

    // Record in temporal memory
    try {
      const tm = this.getTemporalMemory?.();
      if (tm) {
        tm.record(id, succeeded ? 'success' : 'failure', { context: 'pattern-feedback' });
      }
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[oracle-core-feedback:patternFeedback] temporal memory not available:', e?.message || e);
    }

    let healResult = null;
    if (!succeeded) {
      try {
        const { needsAutoHeal, autoHeal } = require('../evolution/evolution');
        const { covenantCheck } = require('../core/covenant');
        if (needsAutoHeal(updated)) {
          const healed = autoHeal(updated);
          if (healed && healed.improvement > 0) {
            // Re-validate healed code against the Covenant before storing
            const check = covenantCheck(healed.code, { description: `auto-heal:${id}`, trusted: false });
            if (check.sealed) {
              this.patterns.update(id, { code: healed.code, coherencyScore: healed.coherencyScore });
              healResult = { healed: true, improvement: healed.improvement, newCoherency: healed.newCoherency };
              this._emit({ type: 'auto_heal', id, improvement: healed.improvement });
            } else if (process.env.ORACLE_DEBUG) {
              console.warn(`[oracle:patternFeedback] auto-heal rejected by covenant for ${id}`);
            }
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[oracle:patternFeedback] auto-heal failed:', e.message);
      }
    }

    // Auto-capture debug patterns from failed pattern feedback
    if (!succeeded) {
      try {
        captureFeedbackDebug(this, id, updated, healResult);
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[patternFeedback] auto-debug capture failed:', e?.message || e);
      }
    }

    auditLog('pattern_feedback', { id, success: succeeded, meta: { usageCount: updated.usageCount, healed: !!healResult?.healed } });
    return { success: true, usageCount: updated.usageCount, successCount: updated.successCount, healResult };
  },
};
