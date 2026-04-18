'use strict';

/**
 * Coherency Recalibration — one-time rescore of all stored patterns
 * with the current (fixed) scorer.
 *
 * Why this exists: the orchestrator found a truncation bug in the
 * coherency scorer that deflated scores on any file > 50K chars.
 * Every pattern that was scored from a large file has an artificially
 * low coherency value stored in the library. Every PULL/EVOLVE/GENERATE
 * decision based on those scores may have been incorrect.
 *
 * This module re-scores every stored pattern with the current fixed
 * scorer and updates the stored coherency when it changed by more
 * than the drift threshold (default 0.05). Patterns that weren't
 * affected by the bug keep their original values unchanged.
 *
 * Safe to run any time the scorer changes — it re-baselines the
 * library without losing any history.
 */

const DEFAULT_DRIFT_THRESHOLD = 0.05;

/**
 * Re-score every pattern in the store with the current scorer.
 * Return a summary of changes.
 *
 * @param {object} store - oracle store (SQLite backend)
 * @param {object} [options]
 *   - driftThreshold: minimum score change to trigger an update (default 0.05)
 *   - dryRun: if true, compute changes but don't update the store
 *   - onProgress: callback(processed, total) for progress reporting
 * @returns {{
 *   totalPatterns, changed, unchanged, skipped,
 *   avgDriftAbs, maxDrift, byLanguage, examples
 * }}
 */
function recalibrateCoherency(store, options = {}) {
  const driftThreshold = options.driftThreshold ?? DEFAULT_DRIFT_THRESHOLD;
  const dryRun = options.dryRun === true;
  const onProgress = typeof options.onProgress === 'function' ? options.onProgress : null;

  const { computeCoherencyScore } = require('../unified/coherency');

  const patterns = store.getAllPatterns ? store.getAllPatterns() : [];
  const summary = {
    totalPatterns: patterns.length,
    changed: 0,
    unchanged: 0,
    skipped: 0,
    raised: 0,
    lowered: 0,
    avgDriftAbs: 0,
    maxDrift: 0,
    maxDriftPattern: null,
    byLanguage: {},
    examples: [],
  };

  let totalDriftAbs = 0;
  let processed = 0;

  for (const pattern of patterns) {
    processed++;
    if (onProgress) onProgress(processed, patterns.length);

    if (!pattern.code) { summary.skipped++; continue; }

    const oldScore = pattern.coherencyScore?.total ?? 0;
    let newScore;
    try {
      const result = computeCoherencyScore(pattern.code, {
        language: pattern.language || 'javascript',
        testPassed: pattern.testPassed,
        historicalReliability: pattern.reliability?.historicalScore,
      });
      newScore = result.total;
    } catch {
      summary.skipped++;
      continue;
    }

    const drift = newScore - oldScore;
    const driftAbs = Math.abs(drift);

    if (driftAbs > summary.maxDrift) {
      summary.maxDrift = driftAbs;
      summary.maxDriftPattern = {
        name: pattern.name,
        language: pattern.language,
        oldScore: Math.round(oldScore * 1000) / 1000,
        newScore: Math.round(newScore * 1000) / 1000,
        drift: Math.round(drift * 1000) / 1000,
      };
    }

    totalDriftAbs += driftAbs;

    const lang = pattern.language || 'unknown';
    if (!summary.byLanguage[lang]) {
      summary.byLanguage[lang] = { changed: 0, unchanged: 0, totalDrift: 0 };
    }

    if (driftAbs >= driftThreshold) {
      summary.changed++;
      if (drift > 0) summary.raised++;
      else summary.lowered++;
      summary.byLanguage[lang].changed++;
      summary.byLanguage[lang].totalDrift += drift;

      if (summary.examples.length < 10) {
        summary.examples.push({
          name: pattern.name,
          language: lang,
          oldScore: Math.round(oldScore * 1000) / 1000,
          newScore: Math.round(newScore * 1000) / 1000,
          drift: Math.round(drift * 1000) / 1000,
        });
      }

      if (!dryRun && store.updatePatternCoherency) {
        try {
          store.updatePatternCoherency(pattern.id, {
            total: newScore,
            breakdown: computeCoherencyScore(pattern.code, { language: pattern.language }).breakdown,
          });
        } catch { /* store update failed — skip this pattern */ }
      }
    } else {
      summary.unchanged++;
      summary.byLanguage[lang].unchanged++;
    }
  }

  summary.avgDriftAbs = patterns.length > 0
    ? Math.round((totalDriftAbs / patterns.length) * 1000) / 1000
    : 0;
  summary.maxDrift = Math.round(summary.maxDrift * 1000) / 1000;

  return summary;
}

module.exports = {
  recalibrateCoherency,
  DEFAULT_DRIFT_THRESHOLD,
};

// ── Atomic self-description ─────────────────────────────────────────
recalibrateCoherency.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.4, group: 18, period: 5,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'oracle',
};
