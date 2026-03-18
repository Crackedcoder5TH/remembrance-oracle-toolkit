/**
 * Oracle Core — Feedback, auto-heal, and compounding growth.
 * Records usage feedback, triggers automatic healing for failing patterns,
 * and spawns new candidates from successful patterns (compounding).
 */

const { auditLog } = require('../core/audit-logger');
const { captureFeedbackDebug } = require('../ci/auto-debug');

/**
 * Trigger compounding: spawn new candidates from a pattern that just succeeded.
 * Only compounds when the pattern has enough successful uses to prove reliability.
 * @param {object} oracle - The oracle instance (this)
 * @param {string} id - Pattern ID
 * @param {object} updated - Updated pattern/entry with usage stats
 * @param {string} source - 'feedback' or 'pattern-feedback'
 */
function _tryCompound(oracle, id, updated, source) {
  try {
    const { COMPOUND } = require('../constants/thresholds');
    const successCount = updated?.successCount ?? updated?.reliability?.successCount ?? 0;
    const usageCount = updated?.usageCount ?? updated?.reliability?.usageCount ?? 0;
    const reliability = updated?.reliability?.historicalScore ?? (usageCount > 0 ? successCount / usageCount : 0);

    // Only compound if pattern has enough successful uses and high reliability
    if (successCount < COMPOUND.MIN_SUCCESSES || reliability < COMPOUND.MIN_RELIABILITY) return null;

    // Only compound on every Nth success to avoid flooding
    if (successCount % COMPOUND.COMPOUND_EVERY !== 0) return null;

    const { PatternRecycler } = require('../evolution/recycler');
    const recycler = new PatternRecycler(oracle);

    // Resolve the full pattern object
    let pattern = null;
    if (oracle.patterns._sqlite) {
      pattern = oracle.patterns._sqlite.getPattern(id);
    }
    if (!pattern) {
      pattern = oracle.patterns.getAll().find(p => p.id === id);
    }
    if (!pattern || !pattern.code) return null;

    const report = recycler.generateFromPattern(pattern, {
      methods: ['variant', 'iterative-refine'],
    });

    if (report.stored > 0) {
      oracle._emit?.({ type: 'compound_growth', id, source, stored: report.stored, successCount });
      auditLog('compound_growth', { id, source, stored: report.stored, successCount });
    }

    return report;
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn(`[oracle:feedback] compounding failed for ${id}:`, e?.message || e);
    return null;
  }
}

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
        const pattern = this.store.get(id)
          || (this.patterns._sqlite ? this.patterns._sqlite.getPattern(id) : null)
          || this.patterns.getAll().find(p => p.id === id);
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

    // Compounding: spawn new candidates from patterns that keep succeeding
    let compoundResult = null;
    if (succeeded) {
      compoundResult = _tryCompound(this, id, updated, 'feedback');
    }

    auditLog('feedback', { id, success: succeeded, meta: { newReliability: updated?.reliability?.historicalScore ?? null, healed: !!healResult?.healed, compounded: compoundResult?.stored ?? 0 } });
    return { success: true, newReliability: updated?.reliability?.historicalScore ?? null, healResult, compoundResult };
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

    // Compounding: spawn new candidates from patterns that keep succeeding
    let compoundResult = null;
    if (succeeded) {
      compoundResult = _tryCompound(this, id, updated, 'pattern-feedback');
    }

    auditLog('pattern_feedback', { id, success: succeeded, meta: { usageCount: updated.usageCount, healed: !!healResult?.healed, compounded: compoundResult?.stored ?? 0 } });
    return { success: true, usageCount: updated.usageCount, successCount: updated.successCount, healResult, compoundResult };
  },
};
