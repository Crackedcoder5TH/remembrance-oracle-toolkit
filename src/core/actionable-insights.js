/**
 * Actionable Insights — Insights that drive decisions, not just report.
 *
 * Bridges the gap between insights.js (read-only analytics) and
 * evolution.js (healing engine). When insights detect problems,
 * this module takes corrective action automatically.
 *
 * Actions:
 *   1. Stale patterns with low coherency → trigger auto-heal
 *   2. Low feedback rate patterns → flag for SERF healing
 *   3. Usage trends → boost search ranking for high-value patterns
 *   4. Regression detection → feed back into lifecycle
 *   5. Search failures → suggest tag improvements
 */

const { stalePatterns, feedbackRates, evolveFrequency } = require('./insights');
const { autoHeal, needsAutoHeal, detectRegressions } = require('./evolution');
const { computeCoherencyScore } = require('./coherency');

// ─── Configuration ───

const ACTIONABLE_DEFAULTS = {
  // Stale patterns: heal if coherency < this threshold
  staleHealThreshold: 0.7,
  // Days without use before considering stale
  staleDays: 90,
  // Maximum patterns to heal per action cycle
  maxHeals: 10,
  // Minimum usage count before feedback rate matters
  minUsageForAction: 5,
  // Feedback success rate below which triggers healing
  lowFeedbackThreshold: 0.4,
  // Evolve count above which triggers improvement
  overEvolvedThreshold: 3,
  // Minimum coherency improvement to keep heal result
  minImprovementToKeep: 0.01,
};

// ─── Actionable Functions ───

/**
 * Heal stale patterns that have low coherency.
 * Stale + low quality = should be improved or removed.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - Override ACTIONABLE_DEFAULTS
 * @returns {object} { healed, skipped, failed, details }
 */
function healStalePatterns(oracle, options = {}) {
  const config = { ...ACTIONABLE_DEFAULTS, ...options };
  const report = { healed: 0, skipped: 0, failed: 0, details: [] };

  const stale = stalePatterns(oracle, config.staleDays, config.maxHeals * 2);

  let healCount = 0;
  for (const sp of stale) {
    if (healCount >= config.maxHeals) break;

    if (sp.coherency >= config.staleHealThreshold) {
      report.skipped++;
      continue;
    }

    const pattern = oracle.patterns.getAll().find(p => p.id === sp.id);
    if (!pattern) {
      report.skipped++;
      continue;
    }

    try {
      const result = autoHeal(pattern, { maxLoops: 3 });
      if (result && result.improvement > config.minImprovementToKeep) {
        oracle.patterns.update(pattern.id, {
          code: result.code,
          coherencyScore: result.coherencyScore,
        });
        report.healed++;
        healCount++;
        report.details.push({
          id: pattern.id,
          name: pattern.name,
          action: 'healed',
          oldCoherency: result.originalCoherency,
          newCoherency: result.newCoherency,
          improvement: result.improvement,
        });
      } else {
        report.skipped++;
        report.details.push({
          id: pattern.id,
          name: pattern.name,
          action: 'no-improvement',
        });
      }
    } catch {
      report.failed++;
    }
  }

  return report;
}

/**
 * Heal patterns with low feedback success rates.
 * Low success rate = pattern isn't working well for users.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - Override ACTIONABLE_DEFAULTS
 * @returns {object} { healed, skipped, failed, details }
 */
function healLowFeedback(oracle, options = {}) {
  const config = { ...ACTIONABLE_DEFAULTS, ...options };
  const report = { healed: 0, skipped: 0, failed: 0, details: [] };

  const rates = feedbackRates(oracle, config.maxHeals * 2);
  const worstPatterns = rates.worst || [];

  let healCount = 0;
  for (const wp of worstPatterns) {
    if (healCount >= config.maxHeals) break;

    if (wp.usageCount < config.minUsageForAction) {
      report.skipped++;
      continue;
    }

    if (wp.successRate > config.lowFeedbackThreshold * 100) {
      report.skipped++;
      continue;
    }

    const pattern = oracle.patterns.getAll().find(p => p.id === wp.id);
    if (!pattern) {
      report.skipped++;
      continue;
    }

    try {
      const result = autoHeal(pattern, { maxLoops: 3 });
      if (result && result.improvement > config.minImprovementToKeep) {
        oracle.patterns.update(pattern.id, {
          code: result.code,
          coherencyScore: result.coherencyScore,
        });
        report.healed++;
        healCount++;
        report.details.push({
          id: pattern.id,
          name: pattern.name,
          action: 'healed',
          successRate: wp.successRate,
          newCoherency: result.newCoherency,
        });
      } else {
        report.skipped++;
      }
    } catch {
      report.failed++;
    }
  }

  return report;
}

/**
 * Heal over-evolved patterns — those forked too many times
 * indicate the original needs improvement.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - Override ACTIONABLE_DEFAULTS
 * @returns {object} { healed, skipped, failed, details }
 */
function healOverEvolved(oracle, options = {}) {
  const config = { ...ACTIONABLE_DEFAULTS, ...options };
  const report = { healed: 0, skipped: 0, failed: 0, details: [] };

  const overEvolved = evolveFrequency(oracle, config.maxHeals * 2)
    .filter(p => p.needsImprovement);

  let healCount = 0;
  for (const oe of overEvolved) {
    if (healCount >= config.maxHeals) break;

    const pattern = oracle.patterns.getAll().find(p => p.id === oe.id);
    if (!pattern) {
      report.skipped++;
      continue;
    }

    try {
      const result = autoHeal(pattern, { maxLoops: 3 });
      if (result && result.improvement > config.minImprovementToKeep) {
        oracle.patterns.update(pattern.id, {
          code: result.code,
          coherencyScore: result.coherencyScore,
        });
        report.healed++;
        healCount++;
        report.details.push({
          id: pattern.id,
          name: pattern.name,
          action: 'healed',
          evolveCount: oe.evolveCount,
          newCoherency: result.newCoherency,
        });
      } else {
        report.skipped++;
      }
    } catch {
      report.failed++;
    }
  }

  return report;
}

/**
 * Generate usage-based search boosts.
 * Returns a map of pattern IDs to boost values based on usage trends.
 * High-usage, high-success patterns get boosted in search.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @returns {Map<string, number>} Pattern ID → boost value (0 to 0.15)
 */
function computeUsageBoosts(oracle) {
  const boosts = new Map();
  const patterns = oracle.patterns.getAll();

  if (patterns.length === 0) return boosts;

  // Find max usage for normalization
  let maxUsage = 1;
  for (const p of patterns) {
    if ((p.usageCount || 0) > maxUsage) maxUsage = p.usageCount;
  }

  for (const p of patterns) {
    const usage = p.usageCount || 0;
    const successRate = usage > 0 ? (p.successCount || 0) / usage : 0.5;
    const usageNorm = usage / maxUsage;

    // Boost = normalized usage * success rate * max boost
    const boost = usageNorm * successRate * 0.15;
    if (boost > 0.01) {
      boosts.set(p.id, Math.round(boost * 1000) / 1000);
    }
  }

  return boosts;
}

/**
 * Run all actionable insights in one call.
 * This is what the lifecycle engine calls on each cycle.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - Override ACTIONABLE_DEFAULTS
 * @returns {object} Combined report
 */
function actOnInsights(oracle, options = {}) {
  const startTime = Date.now();
  const report = {
    timestamp: new Date().toISOString(),
    staleHealing: null,
    feedbackHealing: null,
    overEvolvedHealing: null,
    regressions: null,
    usageBoosts: 0,
    durationMs: 0,
  };

  // 1. Heal stale low-quality patterns
  try {
    report.staleHealing = healStalePatterns(oracle, options);
  } catch {
    report.staleHealing = { error: 'failed' };
  }

  // 2. Heal patterns with low feedback rates
  try {
    report.feedbackHealing = healLowFeedback(oracle, options);
  } catch {
    report.feedbackHealing = { error: 'failed' };
  }

  // 3. Heal over-evolved patterns
  try {
    report.overEvolvedHealing = healOverEvolved(oracle, options);
  } catch {
    report.overEvolvedHealing = { error: 'failed' };
  }

  // 4. Detect regressions
  try {
    const patterns = oracle.patterns.getAll();
    report.regressions = detectRegressions(patterns);
  } catch {
    report.regressions = { error: 'failed' };
  }

  // 5. Compute usage boosts for search ranking
  try {
    const boosts = computeUsageBoosts(oracle);
    report.usageBoosts = boosts.size;
  } catch {
    report.usageBoosts = 0;
  }

  report.durationMs = Date.now() - startTime;

  // Emit actionable insights event
  if (typeof oracle._emit === 'function') {
    oracle._emit({
      type: 'actionable_insights',
      staleHealed: report.staleHealing?.healed || 0,
      feedbackHealed: report.feedbackHealing?.healed || 0,
      overEvolvedHealed: report.overEvolvedHealing?.healed || 0,
      regressions: Array.isArray(report.regressions) ? report.regressions.length : 0,
      durationMs: report.durationMs,
    });
  }

  return report;
}

module.exports = {
  healStalePatterns,
  healLowFeedback,
  healOverEvolved,
  computeUsageBoosts,
  actOnInsights,
  ACTIONABLE_DEFAULTS,
};
