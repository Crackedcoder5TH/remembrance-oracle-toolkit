'use strict';

/**
 * Unified Decay Engine — single implementation of time-based confidence decay.
 *
 * Replaces three separate decay systems:
 *   - src/core/confidence-decay.js (90-day half-life, logarithmic)
 *   - src/evolution/evolution.js stalenessPenalty() (30-180 day linear)
 *   - src/debug/debug-oracle.js decoherence (139-day half-life, exponential)
 *
 * All three answered "how much should we trust something unused?" with different
 * math. This module provides one parameterized engine with presets for each context.
 */

// ─── Presets ───

const PRESETS = {
  /** Main patterns — moderate decay, 90-day half-life */
  pattern: {
    halfLifeDays: 90,
    minScore: 0.30,
    gracePeriodDays: 30,
    boostOnUse: 0.05,
    maxBoost: 0.15,
    decayModel: 'logarithmic',
  },

  /** Evolution staleness — linear ramp, 30-180 day window */
  evolution: {
    halfLifeDays: 150,   // ~midpoint of 30-180 range
    minScore: 0.0,       // stalenessPenalty returns a penalty, not a floor
    gracePeriodDays: 30,
    boostOnUse: 0,
    maxBoost: 0,
    maxPenalty: 0.15,
    decayModel: 'linear',
    linearStartDays: 30,
    linearEndDays: 180,
  },

  /** Debug patterns — exponential decoherence, ~139-day half-life */
  debug: {
    halfLifeDays: 139,   // ln(2) / 0.005 ≈ 138.6
    minScore: 0.0,
    gracePeriodDays: 0,
    boostOnUse: 0,
    maxBoost: 0,
    decayModel: 'exponential',
    lambda: 0.005,
  },
};

// ─── Core Engine ───

/**
 * Compute a decay factor (0-1 multiplier) for an item based on time since last use.
 *
 * @param {object} item - Object with timestamp fields (lastUsed, createdAt, etc.)
 * @param {object} [options] - Decay configuration (or use a preset name)
 * @param {string} [options.preset] - One of 'pattern', 'evolution', 'debug'
 * @returns {{ factor: number, daysSinceUse: number, decayed: boolean, penalty?: number }}
 */
function computeDecay(item, options = {}) {
  const config = resolveConfig(options);
  const now = options.now || new Date();
  const lastUsed = getLastUsedDate(item);
  const created = getCreatedDate(item);

  let baseDate;
  if (lastUsed) {
    baseDate = new Date(lastUsed);
  } else if (created) {
    baseDate = new Date(created);
  } else {
    return { factor: 1.0, daysSinceUse: 0, decayed: false };
  }

  const daysSinceUse = daysBetween(baseDate, now);

  if (daysSinceUse <= config.gracePeriodDays) {
    return { factor: 1.0, daysSinceUse, decayed: false };
  }

  const daysAfterGrace = daysSinceUse - config.gracePeriodDays;

  let factor;
  switch (config.decayModel) {
    case 'exponential':
      // e^(-λt) — used by debug decoherence
      factor = Math.exp(-(config.lambda || 0.005) * daysAfterGrace);
      break;
    case 'linear': {
      // Linear ramp from 0 to maxPenalty over a window
      const start = (config.linearStartDays || 30) - config.gracePeriodDays;
      const end = (config.linearEndDays || 180) - config.gracePeriodDays;
      const range = end - start;
      if (range <= 0) { factor = 1.0; break; }
      const progress = Math.min(1, Math.max(0, (daysAfterGrace - start) / range));
      const penalty = progress * (config.maxPenalty || 0.15);
      return { factor: 1.0 - penalty, daysSinceUse, decayed: penalty > 0, penalty };
    }
    default:
      // Logarithmic (2^(-t/halfLife)) — used by main patterns
      factor = Math.pow(2, -daysAfterGrace / config.halfLifeDays);
      break;
  }

  const clamped = Math.max(config.minScore, Math.min(1.0, factor));
  return {
    factor: round3(clamped),
    daysSinceUse,
    decayed: clamped < 1.0,
  };
}

/**
 * Apply decay to a numeric score. Returns the adjusted score.
 *
 * @param {number} score - Original score (0-1)
 * @param {object} item - Item with timestamp fields
 * @param {object} [options] - Decay options
 * @returns {{ adjusted: number, original: number, factor: number, daysSinceUse: number, decayed: boolean }}
 */
function applyDecayToScore(score, item, options = {}) {
  const config = resolveConfig(options);
  const decay = computeDecay(item, options);
  const adjusted = Math.max(
    config.minScore,
    score * decay.factor
  );
  return {
    adjusted: round3(adjusted),
    original: score,
    factor: decay.factor,
    daysSinceUse: decay.daysSinceUse,
    decayed: decay.decayed,
  };
}

/**
 * Compute a freshness boost for recently-used items.
 *
 * @param {object} item - Item with usage data
 * @param {object} [options] - Options
 * @returns {number} Boost to add (0 to maxBoost)
 */
function computeFreshnessBoost(item, options = {}) {
  const config = resolveConfig(options);
  if (!config.boostOnUse) return 0;

  const recentDays = options.recentDays || 14;
  const now = options.now || new Date();
  const lastUsed = getLastUsedDate(item);
  if (!lastUsed) return 0;

  const daysSince = daysBetween(new Date(lastUsed), now);
  if (daysSince > recentDays) return 0;

  const recencyFactor = 1 - (daysSince / recentDays);
  const successRate = item.usageCount > 0
    ? (item.successCount || 0) / item.usageCount
    : 0.5;

  return Math.min(config.maxBoost, config.boostOnUse * recencyFactor * (1 + successRate));
}

/**
 * Run a decay pass over an array of items. Does NOT modify items.
 *
 * @param {Array} items - Items with timestamp/usage fields
 * @param {object} [options] - Decay options
 * @returns {{ total: number, decayed: number, fresh: number, items: Array }}
 */
function decayPass(items, options = {}) {
  if (!items || items.length === 0) {
    return { total: 0, decayed: 0, fresh: 0, items: [] };
  }

  const results = items.map(item => {
    const coherency = item.coherencyScore?.total ?? item.amplitude ?? 0;
    const decay = applyDecayToScore(coherency, item, options);
    const boost = computeFreshnessBoost(item, options);
    return {
      id: item.id,
      name: item.name,
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
    patterns: results,  // Backwards-compatible name
    items: results,     // New name
  };
}

// ─── Helpers ───

function resolveConfig(options) {
  if (options.preset && PRESETS[options.preset]) {
    return { ...PRESETS[options.preset], ...options };
  }
  return { ...PRESETS.pattern, ...options };
}

function getLastUsedDate(item) {
  // Prioritize explicit usage timestamps over generic update timestamps.
  // updated_at/updatedAt gets set by metadata operations (coherency recompute,
  // migrations, etc.) that have nothing to do with actual usage — using it as
  // a proxy for "last used" artificially inflates freshness.
  return item.lastUsed || item.last_used || item.last_used_at || item.last_observed_at || item.updatedAt || item.updated_at || null;
}

function getCreatedDate(item) {
  return item.createdAt || item.timestamp || item.created_at || null;
}

function daysBetween(dateA, dateB) {
  const msPerDay = 86400000;
  return Math.max(0, Math.floor((dateB.getTime() - dateA.getTime()) / msPerDay));
}

function round3(n) {
  return Math.round(n * 1000) / 1000;
}

module.exports = {
  computeDecay,
  applyDecayToScore,
  computeFreshnessBoost,
  decayPass,
  daysBetween,
  PRESETS,
  // Backwards-compatible aliases
  computeDecayFactor: computeDecay,
  DECAY_DEFAULTS: PRESETS.pattern,
};
