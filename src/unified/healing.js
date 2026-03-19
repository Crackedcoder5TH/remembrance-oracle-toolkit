'use strict';

/**
 * Unified Healing Orchestrator — single entry point for all code healing.
 *
 * Replaces four separate healing entry points:
 *   1. oracle-core-feedback.js → autoHeal() on failure (fast path)
 *   2. oracle-core-resolve.js → reflectionLoop() on pull/evolve (full healing)
 *   3. evolution/lifecycle.js → healing sweep during auto-cycles
 *   4. evolution/self-optimize.js → selfImprove() healing pass
 *
 * All healing now goes through this orchestrator, which:
 *   - Prevents duplicate healing of the same pattern
 *   - Selects the appropriate strategy (fast vs full vs sweep)
 *   - Tracks lineage (healed variants linked to parents)
 *   - Coordinates with the debug bridge for error→fix capture
 */

const { reflectionLoop } = require('../core/reflection');
const { computeCoherencyScore } = require('./coherency');

// ─── Configuration ───

const HEALING_DEFAULTS = {
  maxLoopsQuick: 2,          // Quick heal (feedback failures)
  maxLoopsFull: 3,           // Full heal (resolve, evolution)
  maxLoopsSweep: 2,          // Sweep heal (lifecycle, optimize)
  targetCoherence: 0.9,      // Target coherency after healing
  autoHealThreshold: 0.4,    // Success rate below this triggers auto-heal
  autoHealMinUses: 5,        // Minimum uses before auto-heal kicks in
  sweepTargetCoherency: 0.85, // Target for sweep-mode healing
  maxHealsPerSweep: 20,      // Cap heals per sweep cycle
  cooldownMs: 5000,          // Minimum ms between heals of the same pattern
};

// Track recently healed patterns to prevent duplicate healing
const _recentlyHealed = new Map();
const MAX_TRACKED = 500;

// ─── Healing Result Sentinels ───
// heal() previously returned null for 3 different meanings:
//   1. Cooldown active (not an error, just throttled)
//   2. No improvement found (reflection ran but code didn't improve)
//   3. Exception during healing (real failure)
// This conflation caused healSweep to miscount skipped vs failed,
// and evolution.js to report "healing failed" for harmless cooldowns.
const HEAL_SKIPPED_COOLDOWN = Object.freeze({ skipped: 'cooldown' });
const HEAL_NO_IMPROVEMENT = Object.freeze({ skipped: 'no-improvement' });
const HEAL_ERROR = Object.freeze({ skipped: 'error' });

// ─── Core Healing Function ───

/**
 * Heal a pattern via reflection loop.
 *
 * @param {object} pattern - Pattern to heal (must have .code, .language)
 * @param {object} [options] - Healing options
 * @param {string} [options.strategy] - 'quick' | 'full' | 'sweep' (default: 'full')
 * @param {number} [options.maxLoops] - Override max reflection loops
 * @param {function} [options.onLoop] - Progress callback per loop
 * @param {boolean} [options.force] - Skip cooldown check
 * @returns {object|null} { code, improvement, loops, originalCoherency, newCoherency, coherencyScore, strategy } or null
 */
function heal(pattern, options = {}) {
  const config = { ...HEALING_DEFAULTS, ...options };
  const strategy = config.strategy || 'full';
  const patternId = pattern.id || pattern.name || 'unknown';

  // Cooldown check — prevent healing the same pattern too rapidly
  if (!config.force) {
    const lastHealed = _recentlyHealed.get(patternId);
    if (lastHealed && (Date.now() - lastHealed) < config.cooldownMs) {
      return HEAL_SKIPPED_COOLDOWN;
    }
  }

  // Select max loops based on strategy
  let maxLoops;
  if (config.maxLoops) {
    maxLoops = config.maxLoops;
  } else {
    switch (strategy) {
      case 'quick': maxLoops = config.maxLoopsQuick; break;
      case 'sweep': maxLoops = config.maxLoopsSweep; break;
      default: maxLoops = config.maxLoopsFull; break;
    }
  }

  try {
    const reflection = reflectionLoop(pattern.code, {
      language: pattern.language,
      maxLoops,
      targetCoherence: config.targetCoherence,
      description: pattern.description,
      tags: pattern.tags,
      onLoop: config.onLoop,
      patternExamples: config.patternExamples,
      cascadeBoost: config.cascadeBoost,
    });

    if (reflection.reflection?.improvement <= 0 && reflection.code.trim() === (pattern.code || '').trim()) {
      return HEAL_NO_IMPROVEMENT;
    }

    const newCoherency = computeCoherencyScore(reflection.code, {
      language: pattern.language,
    });

    const originalCoherency = pattern.coherencyScore?.total ?? 0;

    // Track healing to prevent duplicates
    _trackHealing(patternId);

    return {
      code: reflection.code,
      improvement: newCoherency.total - originalCoherency,
      loops: reflection.loops,
      originalCoherency,
      newCoherency: newCoherency.total,
      coherencyScore: newCoherency,
      strategy,
      healingPath: reflection.reflection?.healingPath,
    };
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn(`[unified-healing:heal] ${strategy} failed:`, e?.message || e);
    return HEAL_ERROR;
  }
}

// ─── Strategy Helpers ───

/**
 * Quick heal — used by feedback on failure. Fast, 2 loops max.
 */
function healQuick(pattern, options = {}) {
  return heal(pattern, { ...options, strategy: 'quick' });
}

/**
 * Full heal — used by resolve with healing enabled. 3 loops, full context.
 */
function healFull(pattern, options = {}) {
  return heal(pattern, { ...options, strategy: 'full' });
}

/**
 * Sweep heal — used by lifecycle/optimize. Lower target, capped.
 */
function healSweep(patterns, options = {}) {
  const config = { ...HEALING_DEFAULTS, ...options };
  const maxHeals = config.maxHealsPerSweep;
  const targetCoherency = config.sweepTargetCoherency;

  // Sort by lowest coherency first — heal worst patterns first
  const candidates = patterns
    .filter(p => (p.coherencyScore?.total ?? 0) < targetCoherency)
    .sort((a, b) => (a.coherencyScore?.total ?? 0) - (b.coherencyScore?.total ?? 0));

  const report = {
    attempted: 0,
    healed: [],
    failed: [],
    skipped: 0,
    totalImprovement: 0,
  };

  for (const pattern of candidates) {
    if (report.attempted >= maxHeals) break;
    report.attempted++;

    const result = heal(pattern, {
      ...options,
      strategy: 'sweep',
      targetCoherence: config.targetCoherence,
    });

    if (result && result.improvement > 0) {
      report.healed.push({
        id: pattern.id,
        name: pattern.name,
        oldCoherency: result.originalCoherency,
        newCoherency: result.newCoherency,
        improvement: result.improvement,
      });
      report.totalImprovement += result.improvement;
    } else if (result?.skipped === 'cooldown') {
      report.skipped++;
    } else {
      report.failed.push({
        id: pattern.id,
        name: pattern.name,
        coherency: pattern.coherencyScore?.total ?? 0,
        reason: result?.skipped || (result && result.improvement < 0 ? 'regression' : 'no-improvement'),
      });
    }
  }

  return report;
}

// ─── Decision Helpers ───

/**
 * Check if a pattern needs auto-healing based on feedback data.
 *
 * @param {object} pattern - Pattern with usageCount, successCount
 * @param {object} [config] - { autoHealThreshold, autoHealMinUses }
 * @returns {boolean}
 */
function needsHealing(pattern, config = HEALING_DEFAULTS) {
  const usage = pattern.usageCount ?? 0;
  const success = pattern.successCount ?? 0;
  if (usage < config.autoHealMinUses) return false;
  return (success / usage) < config.autoHealThreshold;
}

// ─── Tracking ───

function _trackHealing(patternId) {
  _recentlyHealed.set(patternId, Date.now());
  // Prune old entries to prevent unbounded growth
  if (_recentlyHealed.size > MAX_TRACKED) {
    const cutoff = Date.now() - 60000; // 60 seconds
    for (const [id, time] of _recentlyHealed) {
      if (time < cutoff) _recentlyHealed.delete(id);
    }
  }
}

/**
 * Clear healing cooldown tracking. Useful for testing.
 */
function resetTracking() {
  _recentlyHealed.clear();
}

module.exports = {
  heal,
  healQuick,
  healFull,
  healSweep,
  needsHealing,
  resetTracking,
  HEALING_DEFAULTS,
  // Sentinel result types — callers use these to distinguish skip/fail reasons
  HEAL_SKIPPED_COOLDOWN,
  HEAL_NO_IMPROVEMENT,
  HEAL_ERROR,
  // Backwards-compatible aliases
  autoHeal: heal,
  needsAutoHeal: needsHealing,
};
