'use strict';

/**
 * Confidence Decay — patterns that haven't been pulled or validated in a while
 * slowly lose coherency score, keeping the ecosystem fresh.
 *
 * NOW DELEGATES to src/unified/decay.js — the single source of truth.
 * This file remains for backwards compatibility.
 */

const unified = require('../unified/decay');

// Default to 'pattern' preset for backwards compatibility
function computeDecayFactor(pattern, options = {}) {
  return unified.computeDecay(pattern, { preset: 'pattern', ...options });
}

function applyDecayToScore(coherencyTotal, pattern, options = {}) {
  return unified.applyDecayToScore(coherencyTotal, pattern, { preset: 'pattern', ...options });
}

function computeFreshnessBoost(pattern, options = {}) {
  return unified.computeFreshnessBoost(pattern, { preset: 'pattern', ...options });
}

function decayPass(patterns, options = {}) {
  const result = unified.decayPass(patterns, { preset: 'pattern', ...options });
  // Unified returns both 'items' and 'patterns' — ensure backwards compat
  if (!result.patterns && result.items) result.patterns = result.items;
  return result;
}

// Re-export DECAY_DEFAULTS with original uppercase key names for backwards compatibility
const DECAY_DEFAULTS = {
  HALF_LIFE_DAYS: unified.PRESETS.pattern.halfLifeDays,
  MIN_SCORE: unified.PRESETS.pattern.minScore,
  GRACE_PERIOD_DAYS: unified.PRESETS.pattern.gracePeriodDays,
  BOOST_ON_USE: unified.PRESETS.pattern.boostOnUse,
  MAX_BOOST: unified.PRESETS.pattern.maxBoost,
};

module.exports = {
  computeDecayFactor,
  applyDecayToScore,
  computeFreshnessBoost,
  decayPass,
  DECAY_DEFAULTS,
  daysBetween: unified.daysBetween,
};
