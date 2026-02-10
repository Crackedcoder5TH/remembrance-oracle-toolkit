/**
 * Self-Evolution Engine — Closes the gap between detection and action.
 *
 * The oracle already DETECTS problems (staleness, low success rate,
 * high evolve frequency, regression). This module makes it ACT on them:
 *
 * 1. Auto-Heal: Low success rate patterns get SERF healing automatically
 * 2. Staleness Scoring: Unused patterns get deprioritized in decisions
 * 3. Evolve Penalty: Patterns forked 3+ times get parent deprioritized
 * 4. Rejection Capture: Failed submissions get captured for SERF healing
 * 5. Regression Detection: Tracks success rate over time, flags drops
 * 6. Coherency Re-check: Periodically re-scores patterns
 *
 * The evolution engine wraps the oracle and hooks into feedback/submit paths.
 */

const { computeCoherencyScore } = require('./coherency');
const { reflectionLoop } = require('./reflection');

// ─── Configuration ───

const EVOLUTION_DEFAULTS = {
  // Auto-heal: trigger when success rate drops below this after N uses
  autoHealThreshold: 0.4,
  autoHealMinUses: 5,

  // Staleness: days since last use before penalty kicks in
  stalenessStartDays: 30,
  stalenessMaxDays: 180,
  stalenessMaxPenalty: 0.15,

  // Evolve penalty: per-child penalty, capped
  evolvePenaltyPerChild: 0.05,
  evolvePenaltyMax: 0.20,

  // Regression: flag when success rate drops by this much
  regressionDelta: 0.3,
  regressionMinUses: 3,

  // Re-check coherency after this many days
  recheckCoherencyDays: 30,

  // Max SERF loops for auto-healing
  maxSerfLoops: 3,
};

// ─── Staleness Scoring ───

/**
 * Compute a staleness penalty for a pattern (0 to stalenessMaxPenalty).
 * Patterns unused for a long time get deprioritized.
 *
 * @param {object} pattern - Pattern with createdAt/lastUsed/usageCount
 * @param {object} config - Evolution config
 * @returns {number} Penalty to subtract from composite score (0 = no penalty)
 */
function stalenessPenalty(pattern, config = EVOLUTION_DEFAULTS) {
  const now = Date.now();
  const created = new Date(pattern.timestamp || pattern.createdAt || 0).getTime();
  const lastUsed = pattern.lastUsed ? new Date(pattern.lastUsed).getTime() : created;
  const daysSinceUse = (now - lastUsed) / 86400000;

  if (daysSinceUse < config.stalenessStartDays) return 0;

  // Linear ramp from 0 to max penalty
  const range = config.stalenessMaxDays - config.stalenessStartDays;
  if (range <= 0) return 0;
  const progress = Math.min(1, (daysSinceUse - config.stalenessStartDays) / range);
  return progress * config.stalenessMaxPenalty;
}

// ─── Evolve Frequency Penalty ───

/**
 * Compute an evolve-frequency penalty for a pattern.
 * Patterns that get forked repeatedly are deprioritized — the signal
 * is that the original isn't good enough.
 *
 * @param {object} pattern - Pattern with evolutionHistory
 * @param {object} config - Evolution config
 * @returns {number} Penalty to subtract from composite score
 */
function evolvePenalty(pattern, config = EVOLUTION_DEFAULTS) {
  const history = pattern.evolutionHistory || [];
  const childCount = history.filter(e => e.childId).length;
  if (childCount < 3) return 0;

  return Math.min(config.evolvePenaltyMax, childCount * config.evolvePenaltyPerChild);
}

// ─── Combined Scoring Adjustments ───

/**
 * Compute all evolution-based score adjustments for a pattern.
 * Returns a negative number to subtract from composite.
 *
 * @param {object} pattern - Pattern object
 * @param {object} config - Evolution config
 * @returns {{ staleness: number, evolve: number, total: number }}
 */
function evolutionAdjustment(pattern, config = EVOLUTION_DEFAULTS) {
  const staleness = stalenessPenalty(pattern, config);
  const evolve = evolvePenalty(pattern, config);
  return {
    staleness,
    evolve,
    total: staleness + evolve,
  };
}

// ─── Auto-Heal on Low Success Rate ───

/**
 * Check if a pattern needs auto-healing based on feedback.
 * Returns true if the pattern has enough usage data and a low success rate.
 *
 * @param {object} pattern - Pattern with usageCount, successCount
 * @param {object} config - Evolution config
 * @returns {boolean}
 */
function needsAutoHeal(pattern, config = EVOLUTION_DEFAULTS) {
  const usage = pattern.usageCount || 0;
  const success = pattern.successCount || 0;
  if (usage < config.autoHealMinUses) return false;
  return (success / usage) < config.autoHealThreshold;
}

/**
 * Auto-heal a pattern via SERF reflection.
 * Returns the healed code and improvement metrics, or null if healing failed.
 *
 * @param {object} pattern - Pattern to heal
 * @param {object} options - { maxLoops, verbose }
 * @returns {object|null} { code, improvement, loops, originalCoherency, newCoherency }
 */
function autoHeal(pattern, options = {}) {
  const maxLoops = options.maxLoops || EVOLUTION_DEFAULTS.maxSerfLoops;

  try {
    const reflection = reflectionLoop(pattern.code, {
      language: pattern.language,
      maxLoops,
      targetCoherence: 0.9,
      description: pattern.description,
      tags: pattern.tags,
    });

    if (!reflection.improved && reflection.code.trim() === (pattern.code || '').trim()) {
      return null;
    }

    const newCoherency = computeCoherencyScore(reflection.code, {
      language: pattern.language,
    });

    const originalCoherency = pattern.coherencyScore?.total ?? 0;

    return {
      code: reflection.code,
      improvement: newCoherency.total - originalCoherency,
      loops: reflection.loops,
      originalCoherency,
      newCoherency: newCoherency.total,
      coherencyScore: newCoherency,
    };
  } catch {
    return null;
  }
}

// ─── Rejection Capture ───

/**
 * Capture a rejected submission for potential SERF healing.
 * Returns a captured entry that can be fed to the recycler.
 *
 * @param {string} code - Rejected code
 * @param {object} metadata - Submission metadata
 * @param {object} validation - Validation result from validator
 * @returns {object} Captured rejection entry
 */
function captureRejection(code, metadata, validation) {
  return {
    code,
    language: metadata.language || validation?.coherencyScore?.language || 'unknown',
    name: metadata.name || metadata.description || 'rejected-submission',
    description: metadata.description || '',
    tags: metadata.tags || [],
    failureReason: validation?.errors?.join('; ') || 'validation failed',
    coherencyScore: validation?.coherencyScore || null,
    capturedAt: new Date().toISOString(),
    source: 'rejected-submission',
  };
}

// ─── Regression Detection ───

/**
 * Detect patterns whose success rate has dropped significantly.
 * Compares current success rate against a baseline.
 *
 * @param {Array} patterns - All patterns with usage data
 * @param {object} config - Evolution config
 * @returns {Array} Patterns with regression detected
 */
function detectRegressions(patterns, config = EVOLUTION_DEFAULTS) {
  const regressions = [];

  for (const p of patterns) {
    const usage = p.usageCount || 0;
    const success = p.successCount || 0;
    if (usage < config.regressionMinUses) continue;

    const currentRate = success / usage;

    // Use the pattern's initial reliability as baseline
    // If no baseline, skip — we can't detect regression without history
    const baseline = p.initialReliability ?? p.reliability ?? 0.5;

    if (baseline - currentRate >= config.regressionDelta) {
      regressions.push({
        id: p.id,
        name: p.name,
        language: p.language,
        currentRate: Math.round(currentRate * 1000) / 1000,
        baseline: Math.round(baseline * 1000) / 1000,
        delta: Math.round((baseline - currentRate) * 1000) / 1000,
        usageCount: usage,
        needsHeal: true,
      });
    }
  }

  return regressions;
}

// ─── Coherency Re-check ───

/**
 * Re-check coherency for patterns that haven't been evaluated recently.
 * Returns patterns whose coherency changed significantly.
 *
 * @param {Array} patterns - Patterns to check
 * @param {object} config - Evolution config
 * @returns {Array} Patterns with updated coherency
 */
function recheckCoherency(patterns, config = EVOLUTION_DEFAULTS) {
  const now = Date.now();
  const updates = [];

  for (const p of patterns) {
    const created = new Date(p.timestamp || p.createdAt || 0).getTime();
    const daysSince = (now - created) / 86400000;
    if (daysSince < config.recheckCoherencyDays) continue;

    try {
      const newScore = computeCoherencyScore(p.code, { language: p.language });
      const oldTotal = p.coherencyScore?.total ?? 0;
      const diff = newScore.total - oldTotal;

      if (Math.abs(diff) >= 0.05) {
        updates.push({
          id: p.id,
          name: p.name,
          oldCoherency: Math.round(oldTotal * 1000) / 1000,
          newCoherency: Math.round(newScore.total * 1000) / 1000,
          diff: Math.round(diff * 1000) / 1000,
          coherencyScore: newScore,
        });
      }
    } catch {
      // Skip patterns that fail scoring
    }
  }

  return updates;
}

// ─── Full Evolution Cycle ───

/**
 * Run a full self-evolution cycle on the oracle.
 * This is the main entry point — call it periodically or after batch operations.
 *
 * 1. Detect regressions (patterns whose success rate dropped)
 * 2. Auto-heal low performers
 * 3. Re-check coherency on old patterns
 * 4. Return a full evolution report
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - Override EVOLUTION_DEFAULTS
 * @returns {object} Evolution report
 */
function evolve(oracle, options = {}) {
  const config = { ...EVOLUTION_DEFAULTS, ...options };
  const patterns = oracle.patterns.getAll();

  const report = {
    timestamp: new Date().toISOString(),
    patternsAnalyzed: patterns.length,
    regressions: [],
    healed: [],
    healFailed: [],
    coherencyUpdates: [],
    staleCount: 0,
    evolveOverloaded: [],
  };

  // 1. Detect regressions
  report.regressions = detectRegressions(patterns, config);

  // 2. Auto-heal patterns with low success rate
  const needHealing = patterns.filter(p => needsAutoHeal(p, config));
  for (const pattern of needHealing) {
    const healResult = autoHeal(pattern, { maxLoops: config.maxSerfLoops });
    if (healResult && healResult.improvement > 0) {
      // Update the pattern's code with the healed version
      try {
        oracle.patterns.update(pattern.id, {
          code: healResult.code,
          coherencyScore: healResult.coherencyScore,
        });
        report.healed.push({
          id: pattern.id,
          name: pattern.name,
          improvement: Math.round(healResult.improvement * 1000) / 1000,
          newCoherency: healResult.newCoherency,
          loops: healResult.loops,
        });
      } catch {
        report.healFailed.push({ id: pattern.id, name: pattern.name, reason: 'update failed' });
      }
    } else {
      report.healFailed.push({
        id: pattern.id,
        name: pattern.name,
        reason: healResult ? 'no improvement' : 'healing failed',
      });
    }
  }

  // 3. Re-check coherency
  report.coherencyUpdates = recheckCoherency(patterns, config);
  for (const update of report.coherencyUpdates) {
    try {
      oracle.patterns.update(update.id, {
        coherencyScore: update.coherencyScore,
      });
    } catch {
      // Best effort
    }
  }

  // 4. Count stale patterns
  const now = Date.now();
  report.staleCount = patterns.filter(p => {
    const created = new Date(p.timestamp || p.createdAt || 0).getTime();
    const lastUsed = p.lastUsed ? new Date(p.lastUsed).getTime() : created;
    return (now - lastUsed) / 86400000 >= config.stalenessStartDays;
  }).length;

  // 5. Find evolve-overloaded parents
  for (const p of patterns) {
    const childCount = (p.evolutionHistory || []).filter(e => e.childId).length;
    if (childCount >= 3) {
      report.evolveOverloaded.push({
        id: p.id,
        name: p.name,
        childCount,
        penalty: evolvePenalty(p, config),
      });
    }
  }

  // Emit evolution event
  if (typeof oracle._emit === 'function') {
    oracle._emit({
      type: 'evolution_cycle',
      analyzed: report.patternsAnalyzed,
      healed: report.healed.length,
      regressions: report.regressions.length,
      stale: report.staleCount,
    });
  }

  return report;
}

module.exports = {
  // Core functions
  evolve,
  stalenessPenalty,
  evolvePenalty,
  evolutionAdjustment,
  needsAutoHeal,
  autoHeal,
  captureRejection,
  detectRegressions,
  recheckCoherency,

  // Configuration
  EVOLUTION_DEFAULTS,
};
