'use strict';

/**
 * Confidence Decay — patterns that haven't been pulled or validated in a while
 * slowly lose coherency score, keeping the ecosystem fresh.
 *
 * Decay is logarithmic: rapid initially, then slows. This prevents sudden
 * drops while still penalizing long-unused patterns.
 *
 * The decay is applied to the composite decision score, not the stored coherency.
 * Patterns can recover by being used (pulled/validated) successfully.
 */

const DECAY_DEFAULTS = {
  HALF_LIFE_DAYS: 90,       // Score halves every 90 days of non-use
  MIN_SCORE: 0.30,          // Floor — never decay below this
  GRACE_PERIOD_DAYS: 30,    // No decay within first 30 days
  BOOST_ON_USE: 0.05,       // Coherency boost when pattern is used
  MAX_BOOST: 0.15,          // Maximum cumulative freshness boost
};

/**
 * Compute the decay factor for a pattern based on time since last use.
 * Returns a multiplier between MIN_SCORE and 1.0.
 *
 * @param {object} pattern - Pattern object with timestamps
 * @param {object} [options] - Decay configuration overrides
 * @returns {{ factor: number, daysSinceUse: number, decayed: boolean }}
 */
function computeDecayFactor(pattern, options = {}) {
  const {
    halfLifeDays = DECAY_DEFAULTS.HALF_LIFE_DAYS,
    minScore = DECAY_DEFAULTS.MIN_SCORE,
    gracePeriodDays = DECAY_DEFAULTS.GRACE_PERIOD_DAYS,
    now = new Date(),
  } = options;

  const lastUsed = getLastUsedDate(pattern);
  if (!lastUsed) {
    // Never used — use creation date as baseline
    const created = pattern.createdAt || pattern.timestamp || pattern.created_at;
    if (!created) return { factor: 1.0, daysSinceUse: 0, decayed: false };
    const daysSinceCreation = daysBetween(new Date(created), now);
    if (daysSinceCreation <= gracePeriodDays) return { factor: 1.0, daysSinceUse: daysSinceCreation, decayed: false };
    return applyDecay(daysSinceCreation - gracePeriodDays, halfLifeDays, minScore);
  }

  const daysSinceUse = daysBetween(new Date(lastUsed), now);
  if (daysSinceUse <= gracePeriodDays) {
    return { factor: 1.0, daysSinceUse, decayed: false };
  }

  return applyDecay(daysSinceUse - gracePeriodDays, halfLifeDays, minScore);
}

/**
 * Apply decay to a coherency score.
 * @param {number} coherencyTotal - Original coherency score (0-1)
 * @param {object} pattern - Pattern with usage timestamps
 * @param {object} [options] - Decay options
 * @returns {{ adjusted: number, original: number, factor: number, daysSinceUse: number }}
 */
function applyDecayToScore(coherencyTotal, pattern, options = {}) {
  const decay = computeDecayFactor(pattern, options);
  const adjusted = Math.max(
    options.minScore || DECAY_DEFAULTS.MIN_SCORE,
    coherencyTotal * decay.factor
  );
  return {
    adjusted: Math.round(adjusted * 1000) / 1000,
    original: coherencyTotal,
    factor: decay.factor,
    daysSinceUse: decay.daysSinceUse,
    decayed: decay.decayed,
  };
}

/**
 * Compute freshness boost for recently-used patterns.
 * @param {object} pattern - Pattern with usage data
 * @param {object} [options] - Options
 * @returns {number} Boost to add (0 to MAX_BOOST)
 */
function computeFreshnessBoost(pattern, options = {}) {
  const {
    boostOnUse = DECAY_DEFAULTS.BOOST_ON_USE,
    maxBoost = DECAY_DEFAULTS.MAX_BOOST,
    recentDays = 14,
    now = new Date(),
  } = options;

  const lastUsed = getLastUsedDate(pattern);
  if (!lastUsed) return 0;

  const daysSince = daysBetween(new Date(lastUsed), now);
  if (daysSince > recentDays) return 0;

  // More recent = more boost, scaled by usage success rate
  const recencyFactor = 1 - (daysSince / recentDays);
  const successRate = pattern.usageCount > 0
    ? (pattern.successCount || 0) / pattern.usageCount
    : 0.5;

  return Math.min(maxBoost, boostOnUse * recencyFactor * (1 + successRate));
}

/**
 * Run decay pass over all patterns, returning a report of affected patterns.
 * Does NOT modify patterns — returns decay info for each pattern.
 * @param {Array} patterns - Array of pattern objects
 * @param {object} [options] - Decay options
 * @returns {{ total: number, decayed: number, fresh: number, patterns: Array }}
 */
function decayPass(patterns, options = {}) {
  if (!patterns || patterns.length === 0) {
    return { total: 0, decayed: 0, fresh: 0, patterns: [] };
  }

  const results = patterns.map(p => {
    const coherency = p.coherencyScore?.total ?? 0;
    const decay = applyDecayToScore(coherency, p, options);
    const boost = computeFreshnessBoost(p, options);
    return {
      id: p.id,
      name: p.name,
      original: coherency,
      adjusted: Math.min(1.0, decay.adjusted + boost),
      factor: decay.factor,
      boost,
      daysSinceUse: decay.daysSinceUse,
      decayed: decay.decayed,
    };
  });

  return {
    total: results.length,
    decayed: results.filter(r => r.decayed).length,
    fresh: results.filter(r => !r.decayed).length,
    patterns: results,
  };
}

// ─── Internal Helpers ─────────────────────────────────────────────────────

function getLastUsedDate(pattern) {
  return pattern.lastUsed || pattern.last_used || pattern.updatedAt || pattern.updated_at || null;
}

function daysBetween(dateA, dateB) {
  const msPerDay = 86400000;
  return Math.max(0, Math.floor((dateB.getTime() - dateA.getTime()) / msPerDay));
}

function applyDecay(daysAfterGrace, halfLifeDays, minScore) {
  // Logarithmic decay: factor = 2^(-days/halfLife)
  const factor = Math.pow(2, -daysAfterGrace / halfLifeDays);
  const clamped = Math.max(minScore, Math.min(1.0, factor));
  return {
    factor: Math.round(clamped * 1000) / 1000,
    daysSinceUse: daysAfterGrace,
    decayed: clamped < 1.0,
  };
}

module.exports = {
  computeDecayFactor,
  applyDecayToScore,
  computeFreshnessBoost,
  decayPass,
  DECAY_DEFAULTS,
  daysBetween,
};
