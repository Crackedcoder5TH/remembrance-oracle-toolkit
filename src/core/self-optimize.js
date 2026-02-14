/**
 * Self-Optimization Engine — The oracle improves and optimizes itself.
 *
 * Two main capabilities:
 *
 * 1. selfImprove(oracle) — Improve the oracle's content quality:
 *    - Heal low-coherency patterns via reflection
 *    - Promote ready candidates
 *    - Remove duplicates and stubs
 *    - Re-tag for better discoverability
 *    - Capture and recover rejections
 *
 * 2. selfOptimize(oracle) — Optimize the oracle's operational efficiency:
 *    - Analyze search hit rates and adjust weights
 *    - Identify unused patterns for archival
 *    - Compact coherency scores
 *    - Optimize tag distribution
 *    - Detect and merge near-duplicate patterns
 *
 * Both return detailed reports and produce healing whispers.
 *
 * Usage:
 *   const { selfImprove, selfOptimize, fullCycle } = require('./self-optimize');
 *   const report = fullCycle(oracle);  // Run both improve + optimize
 */

const { evolve, autoHeal, needsAutoHeal } = require('./evolution');
const { computeCoherencyScore } = require('./coherency');
const { reflectionLoop } = require('./reflection');

// ─── Configuration ───

const OPTIMIZE_DEFAULTS = {
  // Self-improve settings
  maxHealsPerRun: 20,
  healTargetCoherency: 0.85,
  minCoherencyForKeep: 0.4,
  promotionCoherency: 0.7,

  // Self-optimize settings
  nearDuplicateThreshold: 0.92, // Code similarity threshold for merge candidates
  staleArchiveDays: 180,
  minUsageForAnalytics: 3,
  tagConsolidationMin: 2, // Minimum patterns per tag to keep

  // Reflection loops for improvement healing
  maxRefineLoops: 3,
};

// ─── Self-Improve ───

/**
 * Self-improve: raise the quality of every pattern in the library.
 *
 * Steps:
 *   1. Identify patterns below target coherency
 *   2. Heal each one via reflection to raise coherency
 *   3. Promote any candidates ready for proven status
 *   4. Remove duplicates and trivial stubs
 *   5. Re-tag all patterns for better discoverability
 *   6. Recover rejected submissions via reflection
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - Override OPTIMIZE_DEFAULTS
 * @returns {object} Improvement report
 */
function selfImprove(oracle, options = {}) {
  const config = { ...OPTIMIZE_DEFAULTS, ...options };
  const startTime = Date.now();

  const report = {
    timestamp: new Date().toISOString(),
    phase: 'self-improve',
    healed: [],
    healFailed: [],
    promoted: 0,
    cleaned: 0,
    retagged: 0,
    recovered: 0,
    totalCoherencyGained: 0,
    patternsAnalyzed: 0,
    durationMs: 0,
  };

  const patterns = oracle.patterns.getAll();
  report.patternsAnalyzed = patterns.length;

  // Step 1: Identify and heal low-coherency patterns
  const needsHealing = patterns
    .filter(p => {
      const score = p.coherencyScore?.total ?? 0;
      return score > 0 && score < config.healTargetCoherency;
    })
    .sort((a, b) => (a.coherencyScore?.total ?? 0) - (b.coherencyScore?.total ?? 0))
    .slice(0, config.maxHealsPerRun);

  for (const pattern of needsHealing) {
    try {
      const result = autoHeal(pattern, {
        maxLoops: config.maxRefineLoops,
      });

      if (result && result.improvement > 0) {
        oracle.patterns.update(pattern.id, {
          code: result.code,
          coherencyScore: result.coherencyScore,
        });

        report.healed.push({
          id: pattern.id,
          name: pattern.name,
          oldCoherency: result.originalCoherency,
          newCoherency: result.newCoherency,
          improvement: Math.round(result.improvement * 1000) / 1000,
          loops: result.loops,
        });

        report.totalCoherencyGained += result.improvement;
      } else {
        report.healFailed.push({
          id: pattern.id,
          name: pattern.name,
          reason: result ? 'no improvement' : 'healing failed',
        });
      }
    } catch {
      report.healFailed.push({
        id: pattern.id,
        name: pattern.name,
        reason: 'exception during healing',
      });
    }
  }

  // Step 2: Auto-promote candidates
  try {
    const promotion = oracle.autoPromote();
    report.promoted = promotion?.promoted || 0;
  } catch {
    // Best effort
  }

  // Step 3: Deep clean (remove duplicates, stubs)
  try {
    const cleanResult = oracle.deepClean({ dryRun: false });
    report.cleaned = cleanResult?.removed || 0;
  } catch {
    // Best effort
  }

  // Step 4: Re-tag for discoverability
  try {
    const retagResult = oracle.retagAll({ minAdded: 1 });
    report.retagged = retagResult?.enriched || 0;
  } catch {
    // Best effort
  }

  // Step 5: Try to recover rejected submissions
  try {
    const recycleResult = oracle.recycle({ maxAttempts: 5 });
    report.recovered = recycleResult?.healed || 0;
  } catch {
    // Best effort
  }

  report.durationMs = Date.now() - startTime;

  // Emit improvement event
  if (typeof oracle._emit === 'function') {
    oracle._emit({
      type: 'self_improve',
      healed: report.healed.length,
      promoted: report.promoted,
      cleaned: report.cleaned,
      totalCoherencyGained: Math.round(report.totalCoherencyGained * 1000) / 1000,
      durationMs: report.durationMs,
    });
  }

  return report;
}

// ─── Self-Optimize ───

/**
 * Self-optimize: improve the oracle's operational efficiency.
 *
 * Steps:
 *   1. Analyze pattern usage and identify unused patterns
 *   2. Detect near-duplicate patterns (candidates for merge)
 *   3. Consolidate sparse tags
 *   4. Compact coherency scores (re-score old patterns)
 *   5. Generate optimization recommendations
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - Override OPTIMIZE_DEFAULTS
 * @returns {object} Optimization report
 */
function selfOptimize(oracle, options = {}) {
  const config = { ...OPTIMIZE_DEFAULTS, ...options };
  const startTime = Date.now();

  const report = {
    timestamp: new Date().toISOString(),
    phase: 'self-optimize',
    patternsAnalyzed: 0,
    unusedPatterns: [],
    nearDuplicates: [],
    sparseTags: [],
    coherencyRefreshed: 0,
    recommendations: [],
    durationMs: 0,
  };

  const patterns = oracle.patterns.getAll();
  report.patternsAnalyzed = patterns.length;

  // Step 1: Identify unused patterns (high usage gap)
  const now = Date.now();
  for (const p of patterns) {
    const usage = p.usageCount || 0;
    const created = new Date(p.timestamp || p.createdAt || 0).getTime();
    const lastUsed = p.lastUsed ? new Date(p.lastUsed).getTime() : created;
    const daysSinceUse = (now - lastUsed) / 86400000;

    if (daysSinceUse >= config.staleArchiveDays && usage < config.minUsageForAnalytics) {
      report.unusedPatterns.push({
        id: p.id,
        name: p.name,
        daysSinceUse: Math.round(daysSinceUse),
        usageCount: usage,
        coherency: p.coherencyScore?.total ?? 0,
      });
    }
  }

  // Step 2: Detect near-duplicate patterns (by code similarity)
  const codeMap = new Map();
  for (const p of patterns) {
    const normalized = _normalizeCode(p.code || '');
    if (!normalized) continue;

    let foundDuplicate = false;
    for (const [key, existing] of codeMap) {
      const similarity = _codeSimilarity(normalized, key);
      if (similarity >= config.nearDuplicateThreshold) {
        report.nearDuplicates.push({
          pattern1: { id: existing.id, name: existing.name, coherency: existing.coherencyScore?.total ?? 0 },
          pattern2: { id: p.id, name: p.name, coherency: p.coherencyScore?.total ?? 0 },
          similarity: Math.round(similarity * 1000) / 1000,
        });
        foundDuplicate = true;
        break;
      }
    }

    if (!foundDuplicate) {
      codeMap.set(normalized, p);
    }
  }

  // Step 3: Find sparse tags (tags used by very few patterns)
  const tagCounts = new Map();
  for (const p of patterns) {
    for (const tag of (p.tags || [])) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }
  for (const [tag, count] of tagCounts) {
    if (count < config.tagConsolidationMin) {
      report.sparseTags.push({ tag, count });
    }
  }

  // Step 4: Re-score patterns with outdated coherency
  let refreshed = 0;
  for (const p of patterns) {
    const score = p.coherencyScore?.total ?? 0;
    if (score === 0 && p.code) {
      try {
        const newScore = computeCoherencyScore(p.code, { language: p.language });
        if (newScore.total > 0) {
          oracle.patterns.update(p.id, { coherencyScore: newScore });
          refreshed++;
        }
      } catch {
        // Skip
      }
    }
  }
  report.coherencyRefreshed = refreshed;

  // Step 5: Generate recommendations
  report.recommendations = _generateRecommendations(report, patterns);

  report.durationMs = Date.now() - startTime;

  // Emit optimization event
  if (typeof oracle._emit === 'function') {
    oracle._emit({
      type: 'self_optimize',
      unused: report.unusedPatterns.length,
      nearDuplicates: report.nearDuplicates.length,
      coherencyRefreshed: report.coherencyRefreshed,
      recommendations: report.recommendations.length,
      durationMs: report.durationMs,
    });
  }

  return report;
}

// ─── Full Cycle ───

/**
 * Run both self-improve and self-optimize in sequence.
 * Returns a combined report with a healing whisper summary.
 *
 * @param {object} oracle - RemembranceOracle instance
 * @param {object} options - Override defaults for both phases
 * @returns {object} Combined report with whisper
 */
function fullCycle(oracle, options = {}) {
  const startTime = Date.now();

  // Phase 1: Self-improve (quality)
  const improveReport = selfImprove(oracle, options);

  // Phase 2: Self-optimize (efficiency)
  const optimizeReport = selfOptimize(oracle, options);

  // Phase 3: Run evolution cycle
  let evolutionReport = null;
  try {
    evolutionReport = evolve(oracle, options);
  } catch {
    evolutionReport = { error: 'evolution failed' };
  }

  // Generate the whisper summary
  const whisper = _generateWhisper(improveReport, optimizeReport, evolutionReport);

  const totalDurationMs = Date.now() - startTime;

  // Emit full cycle event
  if (typeof oracle._emit === 'function') {
    oracle._emit({
      type: 'full_optimization_cycle',
      improved: improveReport.healed.length,
      promoted: improveReport.promoted,
      cleaned: improveReport.cleaned,
      nearDuplicates: optimizeReport.nearDuplicates.length,
      recommendations: optimizeReport.recommendations.length,
      durationMs: totalDurationMs,
    });
  }

  return {
    timestamp: new Date().toISOString(),
    improvement: improveReport,
    optimization: optimizeReport,
    evolution: evolutionReport,
    whisper,
    durationMs: totalDurationMs,
  };
}

// ─── Internal Helpers ───

/**
 * Normalize code for similarity comparison by stripping comments and whitespace.
 * @param {string} code - Source code to normalize
 * @returns {string} Lowercase, comment-free, whitespace-collapsed code string
 */
function _normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code
    .replace(/\/\/.*$/gm, '')       // Remove line comments
    .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
    .replace(/\s+/g, ' ')           // Collapse whitespace
    .trim()
    .toLowerCase();
}

/**
 * Compute similarity between two code strings using character bigram overlap.
 * @param {string} a - First normalized code string
 * @param {string} b - Second normalized code string
 * @returns {number} Similarity score between 0 (no overlap) and 1 (identical)
 */
function _codeSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;

  if (longer.length === 0) return 1;

  // Use character bigram overlap for fast similarity
  const bigramsA = new Set();
  for (let i = 0; i < longer.length - 1; i++) {
    bigramsA.add(longer.slice(i, i + 2));
  }

  let matches = 0;
  for (let i = 0; i < shorter.length - 1; i++) {
    if (bigramsA.has(shorter.slice(i, i + 2))) {
      matches++;
    }
  }

  const totalBigrams = longer.length - 1 + shorter.length - 1;
  return totalBigrams > 0 ? (2 * matches) / totalBigrams : 0;
}

/**
 * Generate actionable optimization recommendations from analysis results.
 * @param {Object} report - The optimization report with unusedPatterns, nearDuplicates, sparseTags
 * @param {Object[]} patterns - All patterns in the library (for computing averages)
 * @returns {{ priority: string, action: string, message: string, count?: number }[]} Recommendations
 */
function _generateRecommendations(report, patterns) {
  const recs = [];

  if (report.unusedPatterns.length > 10) {
    recs.push({
      priority: 'medium',
      action: 'archive-unused',
      message: `${report.unusedPatterns.length} patterns haven't been used in 180+ days. Consider archiving or retiring them.`,
      count: report.unusedPatterns.length,
    });
  }

  if (report.nearDuplicates.length > 0) {
    recs.push({
      priority: 'high',
      action: 'merge-duplicates',
      message: `Found ${report.nearDuplicates.length} near-duplicate pattern pair(s). Merge to reduce redundancy.`,
      count: report.nearDuplicates.length,
    });
  }

  if (report.sparseTags.length > 20) {
    recs.push({
      priority: 'low',
      action: 'consolidate-tags',
      message: `${report.sparseTags.length} tags are used by fewer than 2 patterns. Consider consolidating.`,
      count: report.sparseTags.length,
    });
  }

  // Check overall library coherency
  let totalCoherency = 0;
  let scoredCount = 0;
  for (const p of patterns) {
    const score = p.coherencyScore?.total ?? 0;
    if (score > 0) {
      totalCoherency += score;
      scoredCount++;
    }
  }
  const avgCoherency = scoredCount > 0 ? totalCoherency / scoredCount : 0;

  if (avgCoherency < 0.7 && scoredCount > 10) {
    recs.push({
      priority: 'high',
      action: 'improve-coherency',
      message: `Average coherency is ${(avgCoherency * 100).toFixed(1)}% — below 70% target. Run self-improve to raise quality.`,
      avgCoherency: Math.round(avgCoherency * 1000) / 1000,
    });
  }

  if (avgCoherency >= 0.85 && scoredCount > 50) {
    recs.push({
      priority: 'info',
      action: 'library-healthy',
      message: `Library coherency is strong at ${(avgCoherency * 100).toFixed(1)}%. The oracle is in excellent health.`,
      avgCoherency: Math.round(avgCoherency * 1000) / 1000,
    });
  }

  return recs;
}

/**
 * Generate a human-readable healing whisper from the full optimization cycle results.
 * @param {Object} improveReport - Results from selfImprove() (healed, promoted, cleaned arrays)
 * @param {Object} optimizeReport - Results from selfOptimize() (nearDuplicates, unusedPatterns, etc.)
 * @param {Object|null} evolutionReport - Results from evolve() (healed, regressions, etc.)
 * @returns {string} Multi-line whisper text summarizing all improvements made
 */
function _generateWhisper(improveReport, optimizeReport, evolutionReport) {
  const lines = [];

  // Title
  const totalHealed = improveReport.healed.length + (evolutionReport?.healed?.length || 0);
  if (totalHealed === 0 && improveReport.promoted === 0 && improveReport.cleaned === 0) {
    lines.push('The oracle is healthy — no improvements needed.');
    return lines.join('\n');
  }

  lines.push('=== Oracle Self-Improvement Whisper ===');
  lines.push('');

  // Healing summary
  if (improveReport.healed.length > 0) {
    lines.push(`Healed ${improveReport.healed.length} pattern(s) via reflection:`);
    for (const h of improveReport.healed.slice(0, 10)) {
      const pct = (h.improvement * 100).toFixed(1);
      lines.push(`  + ${h.name}: ${(h.oldCoherency * 100).toFixed(0)}% -> ${(h.newCoherency * 100).toFixed(0)}% (+${pct}%)`);
    }
    if (improveReport.healed.length > 10) {
      lines.push(`  ... and ${improveReport.healed.length - 10} more`);
    }
    lines.push('');
  }

  // Evolution healing
  if (evolutionReport?.healed?.length > 0) {
    lines.push(`Evolution healed ${evolutionReport.healed.length} low-performer(s):`);
    for (const h of evolutionReport.healed.slice(0, 5)) {
      lines.push(`  + ${h.name}: coherency now ${(h.newCoherency * 100).toFixed(0)}%`);
    }
    lines.push('');
  }

  // Regressions
  if (evolutionReport?.regressions?.length > 0) {
    lines.push(`Detected ${evolutionReport.regressions.length} regression(s) — marked for healing.`);
  }

  // Promotions
  if (improveReport.promoted > 0) {
    lines.push(`Promoted ${improveReport.promoted} candidate(s) to proven status.`);
  }

  // Cleaning
  if (improveReport.cleaned > 0) {
    lines.push(`Cleaned ${improveReport.cleaned} duplicate/stub pattern(s).`);
  }

  // Re-tagging
  if (improveReport.retagged > 0) {
    lines.push(`Enriched tags on ${improveReport.retagged} pattern(s).`);
  }

  // Optimization insights
  if (optimizeReport.nearDuplicates.length > 0) {
    lines.push(`Found ${optimizeReport.nearDuplicates.length} near-duplicate pair(s) to consider merging.`);
  }

  if (optimizeReport.unusedPatterns.length > 0) {
    lines.push(`${optimizeReport.unusedPatterns.length} pattern(s) unused for 180+ days.`);
  }

  // Recommendations
  const highPriority = optimizeReport.recommendations.filter(r => r.priority === 'high');
  if (highPriority.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    for (const r of highPriority) {
      lines.push(`  ! ${r.message}`);
    }
  }

  // Total improvement
  const totalImprovement = improveReport.totalCoherencyGained;
  if (totalImprovement > 0) {
    lines.push('');
    lines.push(`Total coherency gained: +${(totalImprovement * 100).toFixed(1)}%`);
  }

  lines.push('');
  lines.push(`Completed in ${((improveReport.durationMs + optimizeReport.durationMs) / 1000).toFixed(1)}s`);

  return lines.join('\n');
}

module.exports = {
  selfImprove,
  selfOptimize,
  fullCycle,
  OPTIMIZE_DEFAULTS,
};
