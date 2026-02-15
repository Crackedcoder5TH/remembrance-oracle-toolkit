/**
 * Self-Optimization Engine — The oracle improves and optimizes itself.
 *
 * Two main capabilities:
 *
 * 1. selfImprove(ctx) — Improve the oracle's content quality:
 *    - Heal low-coherency patterns via reflection
 *    - Promote ready candidates
 *    - Remove duplicates and stubs
 *    - Re-tag for better discoverability
 *    - Capture and recover rejections
 *
 * 2. selfOptimize(ctx) — Optimize the oracle's operational efficiency:
 *    - Analyze search hit rates and adjust weights
 *    - Identify unused patterns for archival
 *    - Compact coherency scores
 *    - Optimize tag distribution
 *    - Detect and merge near-duplicate patterns
 *
 * Accepts an OracleContext (narrow interface) instead of raw oracle instance.
 * Both return detailed reports and produce healing whispers.
 *
 * Usage:
 *   const { selfImprove, selfOptimize, fullCycle } = require('./self-optimize');
 *   const ctx = createOracleContext(oracle);
 *   const report = fullCycle(ctx);  // Run both improve + optimize
 */

const { evolve, autoHeal, needsAutoHeal } = require('./evolution');
const { computeCoherencyScore } = require('../core/coherency');

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

  // Iterative polish (self-reflection loop)
  maxPolishIterations: 5,
  polishConvergenceThreshold: 0.95, // Stop when improvement score >= this
};

// ─── Self-Improve ───

/**
 * Self-improve: raise the quality of every pattern in the library.
 *
 * @param {object} ctx - OracleContext or RemembranceOracle instance
 * @param {object} options - Override OPTIMIZE_DEFAULTS
 * @returns {object} Improvement report
 */
function selfImprove(ctx, options = {}) {
  // Support both OracleContext and raw oracle (backward compat)
  const getPatterns = ctx.getPatterns || (() => ctx.patterns.getAll());
  const updatePattern = ctx.updatePattern || ((id, updates) => ctx.patterns.update(id, updates));
  const emit = ctx.emit || ((event) => { if (typeof ctx._emit === 'function') ctx._emit(event); });
  const doAutoPromote = ctx.autoPromote || (() => { try { return ctx.autoPromote(); } catch { return { promoted: 0 }; } });
  const doDeepClean = ctx.deepClean || ((opts) => { try { return ctx.deepClean(opts); } catch { return { removed: 0 }; } });
  const doRetagAll = ctx.retagAll || ((opts) => { try { return ctx.retagAll(opts); } catch { return { enriched: 0 }; } });
  const doRecycle = ctx.recycle || ((opts) => { try { return ctx.recycle(opts); } catch { return { healed: 0 }; } });

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

  const patterns = getPatterns();
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
        updatePattern(pattern.id, {
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
    const promotion = doAutoPromote();
    report.promoted = promotion?.promoted || 0;
  } catch {
    // Best effort
  }

  // Step 3: Deep clean (remove duplicates, stubs)
  try {
    const cleanResult = doDeepClean({ dryRun: false });
    report.cleaned = cleanResult?.removed || 0;
  } catch {
    // Best effort
  }

  // Step 4: Re-tag for discoverability
  try {
    const retagResult = doRetagAll({ minAdded: 1 });
    report.retagged = retagResult?.enriched || 0;
  } catch {
    // Best effort
  }

  // Step 5: Try to recover rejected submissions
  try {
    const recycleResult = doRecycle({ maxAttempts: 5 });
    report.recovered = recycleResult?.healed || 0;
  } catch {
    // Best effort
  }

  report.durationMs = Date.now() - startTime;

  // Emit improvement event
  emit({
    type: 'self_improve',
    healed: report.healed.length,
    promoted: report.promoted,
    cleaned: report.cleaned,
    totalCoherencyGained: Math.round(report.totalCoherencyGained * 1000) / 1000,
    durationMs: report.durationMs,
  });

  return report;
}

// ─── Self-Optimize ───

/**
 * Self-optimize: improve the oracle's operational efficiency.
 *
 * @param {object} ctx - OracleContext or RemembranceOracle instance
 * @param {object} options - Override OPTIMIZE_DEFAULTS
 * @returns {object} Optimization report
 */
function selfOptimize(ctx, options = {}) {
  // Support both OracleContext and raw oracle (backward compat)
  const getPatterns = ctx.getPatterns || (() => ctx.patterns.getAll());
  const updatePattern = ctx.updatePattern || ((id, updates) => ctx.patterns.update(id, updates));
  const emit = ctx.emit || ((event) => { if (typeof ctx._emit === 'function') ctx._emit(event); });

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

  const patterns = getPatterns();
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
          updatePattern(p.id, { coherencyScore: newScore });
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
  emit({
    type: 'self_optimize',
    unused: report.unusedPatterns.length,
    nearDuplicates: report.nearDuplicates.length,
    coherencyRefreshed: report.coherencyRefreshed,
    recommendations: report.recommendations.length,
    durationMs: report.durationMs,
  });

  return report;
}

// ─── Full Cycle ───

/**
 * Run both self-improve and self-optimize in sequence.
 * Returns a combined report with a healing whisper summary.
 *
 * @param {object} ctx - OracleContext or RemembranceOracle instance
 * @param {object} options - Override defaults for both phases
 * @returns {object} Combined report with whisper
 */
function fullCycle(ctx, options = {}) {
  const startTime = Date.now();

  // Support both OracleContext and raw oracle (backward compat)
  const emit = ctx.emit || ((event) => { if (typeof ctx._emit === 'function') ctx._emit(event); });

  // Phase 1: Self-improve (quality)
  const improveReport = selfImprove(ctx, options);

  // Phase 2: Self-optimize (efficiency)
  const optimizeReport = selfOptimize(ctx, options);

  // Phase 3: Run evolution cycle
  let evolutionReport = null;
  try {
    evolutionReport = evolve(ctx, options);
  } catch {
    evolutionReport = { error: 'evolution failed' };
  }

  // Generate the whisper summary
  const whisper = _generateWhisper(improveReport, optimizeReport, evolutionReport);

  const totalDurationMs = Date.now() - startTime;

  // Emit full cycle event
  emit({
    type: 'full_optimization_cycle',
    improved: improveReport.healed.length,
    promoted: improveReport.promoted,
    cleaned: improveReport.cleaned,
    nearDuplicates: optimizeReport.nearDuplicates.length,
    recommendations: optimizeReport.recommendations.length,
    durationMs: totalDurationMs,
  });

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

function _normalizeCode(code) {
  if (!code || typeof code !== 'string') return '';
  return code
    .replace(/\/\/.*$/gm, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

function _codeSimilarity(a, b) {
  if (!a || !b) return 0;
  if (a === b) return 1;

  const longer = a.length >= b.length ? a : b;
  const shorter = a.length >= b.length ? b : a;

  if (longer.length === 0) return 1;

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

function _generateWhisper(improveReport, optimizeReport, evolutionReport) {
  const lines = [];

  const totalHealed = improveReport.healed.length + (evolutionReport?.healed?.length || 0);
  if (totalHealed === 0 && improveReport.promoted === 0 && improveReport.cleaned === 0) {
    lines.push('The oracle is healthy — no improvements needed.');
    return lines.join('\n');
  }

  lines.push('=== Oracle Self-Improvement Whisper ===');
  lines.push('');

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

  if (evolutionReport?.healed?.length > 0) {
    lines.push(`Evolution healed ${evolutionReport.healed.length} low-performer(s):`);
    for (const h of evolutionReport.healed.slice(0, 5)) {
      lines.push(`  + ${h.name}: coherency now ${(h.newCoherency * 100).toFixed(0)}%`);
    }
    lines.push('');
  }

  if (evolutionReport?.regressions?.length > 0) {
    lines.push(`Detected ${evolutionReport.regressions.length} regression(s) — marked for healing.`);
  }

  if (improveReport.promoted > 0) {
    lines.push(`Promoted ${improveReport.promoted} candidate(s) to proven status.`);
  }

  if (improveReport.cleaned > 0) {
    lines.push(`Cleaned ${improveReport.cleaned} duplicate/stub pattern(s).`);
  }

  if (improveReport.retagged > 0) {
    lines.push(`Enriched tags on ${improveReport.retagged} pattern(s).`);
  }

  if (optimizeReport.nearDuplicates.length > 0) {
    lines.push(`Found ${optimizeReport.nearDuplicates.length} near-duplicate pair(s) to consider merging.`);
  }

  if (optimizeReport.unusedPatterns.length > 0) {
    lines.push(`${optimizeReport.unusedPatterns.length} pattern(s) unused for 180+ days.`);
  }

  const highPriority = optimizeReport.recommendations.filter(r => r.priority === 'high');
  if (highPriority.length > 0) {
    lines.push('');
    lines.push('Recommendations:');
    for (const r of highPriority) {
      lines.push(`  ! ${r.message}`);
    }
  }

  const totalImprovement = improveReport.totalCoherencyGained;
  if (totalImprovement > 0) {
    lines.push('');
    lines.push(`Total coherency gained: +${(totalImprovement * 100).toFixed(1)}%`);
  }

  lines.push('');
  lines.push(`Completed in ${((improveReport.durationMs + optimizeReport.durationMs) / 1000).toFixed(1)}s`);

  return lines.join('\n');
}

// ─── Near-Duplicate Consolidation ───

/**
 * Consolidate near-duplicate patterns.
 *
 * @param {object} ctx - OracleContext or RemembranceOracle instance
 * @param {object} options - Configuration
 * @returns {object} Consolidation report
 */
function consolidateDuplicates(ctx, options = {}) {
  const {
    similarityThreshold = OPTIMIZE_DEFAULTS.nearDuplicateThreshold,
    dryRun = false,
  } = options;

  // Support both OracleContext and raw oracle (backward compat)
  const getPatterns = ctx.getPatterns || (() => ctx.patterns.getAll());
  const updatePattern = ctx.updatePattern || ((id, updates) => ctx.patterns.update(id, updates));
  const deletePattern = ctx.deletePattern || ((id) => _deletePatternFallback(ctx, id));
  const emit = ctx.emit || ((event) => { if (typeof ctx._emit === 'function') ctx._emit(event); });

  const startTime = Date.now();
  const patterns = getPatterns();
  const report = {
    timestamp: new Date().toISOString(),
    phase: 'consolidate-duplicates',
    patternsAnalyzed: patterns.length,
    merged: [],
    removed: [],
    linked: [],
    dryRun,
    durationMs: 0,
  };

  // Detect near-duplicate pairs
  const codeMap = new Map();
  const duplicatePairs = [];

  for (const p of patterns) {
    const normalized = _normalizeCode(p.code || '');
    if (!normalized) continue;

    let foundMatch = false;
    for (const [key, existing] of codeMap) {
      const similarity = _codeSimilarity(normalized, key);
      if (similarity >= similarityThreshold) {
        duplicatePairs.push({ existing, duplicate: p, similarity });
        foundMatch = true;
        break;
      }
    }

    if (!foundMatch) {
      codeMap.set(normalized, p);
    }
  }

  // Language variant pairs (e.g., JS/TS mirrors)
  const LANGUAGE_VARIANTS = new Set([
    'javascript:typescript', 'typescript:javascript',
    'javascript:python', 'python:javascript',
    'typescript:python', 'python:typescript',
  ]);

  for (const { existing, duplicate, similarity } of duplicatePairs) {
    const existingLang = (existing.language || '').toLowerCase();
    const duplicateLang = (duplicate.language || '').toLowerCase();
    const langPair = `${existingLang}:${duplicateLang}`;
    const isLangVariant = LANGUAGE_VARIANTS.has(langPair);

    const existingCoherency = existing.coherencyScore?.total ?? 0;
    const duplicateCoherency = duplicate.coherencyScore?.total ?? 0;

    const keeper = existingCoherency >= duplicateCoherency ? existing : duplicate;
    const loser = keeper === existing ? duplicate : existing;

    if (isLangVariant) {
      const variantTag = `has-${loser.language}-variant`;
      const keeperTags = new Set(keeper.tags || []);

      if (!keeperTags.has(variantTag)) {
        keeperTags.add(variantTag);
        if (!dryRun) {
          updatePattern(keeper.id, { tags: [...keeperTags] });
        }
      }

      if (!dryRun) {
        deletePattern(loser.id);
      }

      report.linked.push({
        kept: { id: keeper.id, name: keeper.name, language: keeper.language, coherency: existingCoherency >= duplicateCoherency ? existingCoherency : duplicateCoherency },
        removed: { id: loser.id, name: loser.name, language: loser.language, coherency: existingCoherency >= duplicateCoherency ? duplicateCoherency : existingCoherency },
        similarity: Math.round(similarity * 1000) / 1000,
        variantTag,
      });
    } else {
      if (!dryRun) {
        deletePattern(loser.id);
      }

      report.merged.push({
        kept: { id: keeper.id, name: keeper.name, coherency: Math.max(existingCoherency, duplicateCoherency) },
        removed: { id: loser.id, name: loser.name, coherency: Math.min(existingCoherency, duplicateCoherency) },
        similarity: Math.round(similarity * 1000) / 1000,
      });
    }

    report.removed.push({ id: loser.id, name: loser.name, reason: isLangVariant ? 'language-variant' : 'same-language-duplicate' });
  }

  report.durationMs = Date.now() - startTime;

  emit({
    type: 'consolidate_duplicates',
    merged: report.merged.length,
    linked: report.linked.length,
    totalRemoved: report.removed.length,
    dryRun,
    durationMs: report.durationMs,
  });

  return report;
}

// ─── Tag Consolidation ───

/**
 * Consolidate sparse tags.
 *
 * @param {object} ctx - OracleContext or RemembranceOracle instance
 * @param {object} options - Configuration
 * @returns {object} Tag consolidation report
 */
function consolidateTags(ctx, options = {}) {
  const {
    minUsage = OPTIMIZE_DEFAULTS.tagConsolidationMin,
    dryRun = false,
  } = options;

  // Support both OracleContext and raw oracle (backward compat)
  const getPatterns = ctx.getPatterns || (() => ctx.patterns.getAll());
  const updatePattern = ctx.updatePattern || ((id, updates) => ctx.patterns.update(id, updates));
  const emit = ctx.emit || ((event) => { if (typeof ctx._emit === 'function') ctx._emit(event); });

  const startTime = Date.now();
  const patterns = getPatterns();

  const PROTECTED_TAGS = new Set([
    'javascript', 'typescript', 'python', 'go', 'rust', 'java',
    'utility', 'algorithm', 'data-structure', 'testing', 'security',
    'auth', 'crypto', 'database', 'network', 'validation', 'async',
    'stream', 'file-io', 'ui', 'react', 'node', 'web', 'cli',
    'math', 'string', 'array', 'object', 'function', 'class',
    'error-handling', 'logging', 'config', 'parser', 'formatter',
    'imported', 'harvested',
  ]);

  const NOISE_TAGS = new Set([
    'auto-generated', 'variant', 'serf-refined', 'approach-swap',
    'needs-test', 'needs-review',
  ]);

  const tagCounts = new Map();
  for (const p of patterns) {
    for (const tag of (p.tags || [])) {
      tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    }
  }

  const tagsToRemove = new Set();
  for (const [tag, count] of tagCounts) {
    if (NOISE_TAGS.has(tag)) {
      tagsToRemove.add(tag);
    } else if (count < minUsage && !PROTECTED_TAGS.has(tag.toLowerCase())) {
      tagsToRemove.add(tag);
    }
  }

  const report = {
    timestamp: new Date().toISOString(),
    phase: 'consolidate-tags',
    patternsAnalyzed: patterns.length,
    totalTagsBefore: tagCounts.size,
    tagsRemoved: [],
    patternsUpdated: 0,
    noiseTagsStripped: 0,
    orphanTagsRemoved: 0,
    dryRun,
    durationMs: 0,
  };

  for (const p of patterns) {
    const oldTags = p.tags || [];
    const newTags = oldTags.filter(t => !tagsToRemove.has(t));

    if (newTags.length < oldTags.length) {
      if (!dryRun) {
        updatePattern(p.id, { tags: newTags });
      }
      report.patternsUpdated++;
    }
  }

  for (const tag of tagsToRemove) {
    const count = tagCounts.get(tag) || 0;
    const isNoise = NOISE_TAGS.has(tag);
    report.tagsRemoved.push({ tag, count, reason: isNoise ? 'noise' : 'orphan' });
    if (isNoise) report.noiseTagsStripped++;
    else report.orphanTagsRemoved++;
  }

  report.totalTagsAfter = tagCounts.size - tagsToRemove.size;
  report.durationMs = Date.now() - startTime;

  emit({
    type: 'consolidate_tags',
    tagsRemoved: report.tagsRemoved.length,
    patternsUpdated: report.patternsUpdated,
    dryRun,
    durationMs: report.durationMs,
  });

  return report;
}

// ─── Candidate Cleanup ───

/**
 * Prune stuck candidates.
 *
 * @param {object} ctx - OracleContext or RemembranceOracle instance
 * @param {object} options - Configuration
 * @returns {object} Pruning report
 */
function pruneStuckCandidates(ctx, options = {}) {
  const {
    minCoherency = 0.6,
    dryRun = false,
  } = options;

  // Support both OracleContext and raw oracle (backward compat)
  const getCandidates = ctx.getCandidates || (() => (ctx.patterns?.getCandidates ? ctx.patterns.getCandidates() : []));
  const pruneCandidatesBulk = ctx.pruneCandidates || null;
  const deleteCandidateSingle = ctx.deleteCandidate || null;
  const emit = ctx.emit || ((event) => { if (typeof ctx._emit === 'function') ctx._emit(event); });

  // Fallback for raw oracle
  const sqliteStore = ctx._oracle?.patterns?._sqlite || ctx.patterns?._sqlite;

  const startTime = Date.now();
  const candidates = getCandidates();

  const report = {
    timestamp: new Date().toISOString(),
    phase: 'prune-candidates',
    totalCandidates: candidates.length,
    pruned: [],
    kept: [],
    dryRun,
    durationMs: 0,
  };

  for (const c of candidates) {
    const coherency = c.coherencyScore?.total ?? c.coherencyTotal ?? 0;
    if (coherency < minCoherency) {
      report.pruned.push({
        id: c.id,
        name: c.name,
        coherency: Math.round(coherency * 1000) / 1000,
        language: c.language,
        generationMethod: c.generationMethod,
      });
    } else {
      report.kept.push({
        id: c.id,
        name: c.name,
        coherency: Math.round(coherency * 1000) / 1000,
      });
    }
  }

  if (!dryRun && report.pruned.length > 0) {
    if (pruneCandidatesBulk) {
      pruneCandidatesBulk(minCoherency);
    } else if (sqliteStore && typeof sqliteStore.pruneCandidates === 'function') {
      sqliteStore.pruneCandidates(minCoherency);
    } else {
      for (const p of report.pruned) {
        try {
          if (deleteCandidateSingle) {
            deleteCandidateSingle(p.id);
          } else if (sqliteStore && typeof sqliteStore.deleteCandidate === 'function') {
            sqliteStore.deleteCandidate(p.id);
          }
        } catch { /* best effort */ }
      }
    }
  }

  report.durationMs = Date.now() - startTime;

  emit({
    type: 'prune_candidates',
    pruned: report.pruned.length,
    kept: report.kept.length,
    dryRun,
    durationMs: report.durationMs,
  });

  return report;
}

// ─── Polish Cycle ───

/**
 * Full polish cycle.
 *
 * @param {object} ctx - OracleContext or RemembranceOracle instance
 * @param {object} options - Configuration
 * @returns {object} Combined polish report
 */
function polishCycle(ctx, options = {}) {
  // Support both OracleContext and raw oracle (backward compat)
  const emit = ctx.emit || ((event) => { if (typeof ctx._emit === 'function') ctx._emit(event); });

  const startTime = Date.now();

  const duplicateReport = consolidateDuplicates(ctx, options);
  const tagReport = consolidateTags(ctx, options);
  const candidateReport = pruneStuckCandidates(ctx, options);
  const cycleReport = fullCycle(ctx, options);

  const totalDurationMs = Date.now() - startTime;

  const whisperLines = ['=== Oracle Polish Cycle ===', ''];

  if (duplicateReport.removed.length > 0) {
    whisperLines.push(`Consolidated ${duplicateReport.removed.length} near-duplicate(s):`);
    if (duplicateReport.linked.length > 0) {
      whisperLines.push(`  ${duplicateReport.linked.length} language variant(s) linked under canonical patterns`);
    }
    if (duplicateReport.merged.length > 0) {
      whisperLines.push(`  ${duplicateReport.merged.length} same-language duplicate(s) merged`);
    }
    whisperLines.push('');
  }

  if (tagReport.tagsRemoved.length > 0) {
    whisperLines.push(`Consolidated ${tagReport.tagsRemoved.length} sparse/noise tag(s):`);
    if (tagReport.orphanTagsRemoved > 0) {
      whisperLines.push(`  ${tagReport.orphanTagsRemoved} orphan tag(s) removed (used by <${options.minUsage || 2} patterns)`);
    }
    if (tagReport.noiseTagsStripped > 0) {
      whisperLines.push(`  ${tagReport.noiseTagsStripped} noise tag(s) stripped`);
    }
    whisperLines.push(`  ${tagReport.patternsUpdated} pattern(s) updated`);
    whisperLines.push('');
  }

  if (candidateReport.pruned.length > 0) {
    whisperLines.push(`Pruned ${candidateReport.pruned.length} stuck candidate(s) below ${options.minCoherency || 0.6} coherency`);
    if (candidateReport.kept.length > 0) {
      whisperLines.push(`  ${candidateReport.kept.length} viable candidate(s) retained`);
    }
    whisperLines.push('');
  }

  if (cycleReport.whisper) {
    whisperLines.push(cycleReport.whisper);
  }

  whisperLines.push(`Completed in ${(totalDurationMs / 1000).toFixed(1)}s`);

  emit({
    type: 'polish_cycle',
    duplicatesRemoved: duplicateReport.removed.length,
    tagsConsolidated: tagReport.tagsRemoved.length,
    candidatesPruned: candidateReport.pruned.length,
    durationMs: totalDurationMs,
  });

  return {
    timestamp: new Date().toISOString(),
    consolidation: duplicateReport,
    tagConsolidation: tagReport,
    candidatePruning: candidateReport,
    cycle: cycleReport,
    whisper: whisperLines.join('\n'),
    durationMs: totalDurationMs,
  };
}

// ─── Iterative Polish ───

/**
 * Run polish cycles iteratively until convergence.
 *
 * @param {object} ctx - OracleContext or RemembranceOracle instance
 * @param {object} options - Override OPTIMIZE_DEFAULTS
 * @returns {object} Iterative polish report with history
 */
function iterativePolish(ctx, options = {}) {
  // Support both OracleContext and raw oracle (backward compat)
  const getPatterns = ctx.getPatterns || (() => ctx.patterns.getAll());
  const emit = ctx.emit || ((event) => { if (typeof ctx._emit === 'function') ctx._emit(event); });

  const config = { ...OPTIMIZE_DEFAULTS, ...options };
  const maxIterations = config.maxPolishIterations;
  const threshold = config.polishConvergenceThreshold;
  const startTime = Date.now();

  let history = [];
  let converged = false;
  let iteration = 0;
  let totalRemoved = 0;
  let totalHealed = 0;
  let totalPromoted = 0;
  let totalTagsConsolidated = 0;
  let totalCandidatesPruned = 0;

  while (iteration < maxIterations) {
    const passReport = polishCycle(ctx, options);

    const duplicatesRemoved = passReport.consolidation?.removed?.length || 0;
    const tagsRemoved = passReport.tagConsolidation?.tagsRemoved?.length || 0;
    const candidatesPruned = passReport.candidatePruning?.pruned?.length || 0;
    const healed = passReport.cycle?.improvement?.healed?.length || 0;
    const promoted = passReport.cycle?.improvement?.promoted || 0;
    const cleaned = passReport.cycle?.improvement?.cleaned || 0;

    const totalImprovements = duplicatesRemoved + tagsRemoved + candidatesPruned + healed + promoted + cleaned;

    const patternsAnalyzed = passReport.consolidation?.patternsAnalyzed || 1;
    const score = totalImprovements === 0 ? 1.0 : Math.max(0, 1 - (totalImprovements / patternsAnalyzed));

    totalRemoved += duplicatesRemoved;
    totalHealed += healed;
    totalPromoted += promoted;
    totalTagsConsolidated += tagsRemoved;
    totalCandidatesPruned += candidatesPruned;

    history.push({
      iteration,
      score,
      improvements: totalImprovements,
      duplicatesRemoved,
      tagsRemoved,
      candidatesPruned,
      healed,
      promoted,
      cleaned,
      patternsRemaining: getPatterns().length,
      durationMs: passReport.durationMs,
    });

    if (score >= threshold) {
      converged = true;
      break;
    }

    if (iteration > 0 && history[iteration].score <= history[iteration - 1].score) {
      converged = true;
      break;
    }

    if (totalImprovements === 0) {
      converged = true;
      break;
    }

    iteration++;
  }

  const totalDurationMs = Date.now() - startTime;
  const finalPatternCount = getPatterns().length;

  const whisperLines = ['=== Oracle Iterative Polish ===', ''];
  whisperLines.push(`Ran ${history.length} iteration(s) — ${converged ? 'converged' : 'max iterations reached'}`);
  whisperLines.push('');

  for (const h of history) {
    const parts = [];
    if (h.duplicatesRemoved > 0) parts.push(`${h.duplicatesRemoved} dupes`);
    if (h.tagsRemoved > 0) parts.push(`${h.tagsRemoved} tags`);
    if (h.candidatesPruned > 0) parts.push(`${h.candidatesPruned} candidates`);
    if (h.healed > 0) parts.push(`${h.healed} healed`);
    if (h.promoted > 0) parts.push(`${h.promoted} promoted`);
    if (h.cleaned > 0) parts.push(`${h.cleaned} cleaned`);

    const detail = parts.length > 0 ? parts.join(', ') : 'no changes';
    whisperLines.push(`  Pass ${h.iteration + 1}: ${detail} (score: ${(h.score * 100).toFixed(1)}%)`);
  }

  whisperLines.push('');
  if (totalRemoved > 0) whisperLines.push(`Total duplicates removed: ${totalRemoved}`);
  if (totalTagsConsolidated > 0) whisperLines.push(`Total tags consolidated: ${totalTagsConsolidated}`);
  if (totalCandidatesPruned > 0) whisperLines.push(`Total candidates pruned: ${totalCandidatesPruned}`);
  if (totalHealed > 0) whisperLines.push(`Total patterns healed: ${totalHealed}`);
  if (totalPromoted > 0) whisperLines.push(`Total candidates promoted: ${totalPromoted}`);
  whisperLines.push(`Final library size: ${finalPatternCount} patterns`);
  whisperLines.push(`Completed in ${(totalDurationMs / 1000).toFixed(1)}s`);

  emit({
    type: 'iterative_polish',
    iterations: history.length,
    converged,
    totalRemoved,
    totalHealed,
    totalPromoted,
    totalTagsConsolidated,
    totalCandidatesPruned,
    finalPatternCount,
    durationMs: totalDurationMs,
  });

  return {
    timestamp: new Date().toISOString(),
    phase: 'iterative-polish',
    converged,
    iterations: history.length,
    finalScore: history.length > 0 ? history[history.length - 1].score : 1.0,
    history,
    totals: {
      removed: totalRemoved,
      healed: totalHealed,
      promoted: totalPromoted,
      tagsConsolidated: totalTagsConsolidated,
      candidatesPruned: totalCandidatesPruned,
    },
    finalPatternCount,
    improved: history.length > 1 && history[history.length - 1].score > history[0].score,
    whisper: whisperLines.join('\n'),
    durationMs: totalDurationMs,
  };
}

/**
 * Fallback delete pattern for raw oracle instances.
 */
function _deletePatternFallback(oracle, id) {
  try {
    const db = oracle.patterns?._sqlite?.db || oracle.store?.db;
    if (db) {
      db.prepare('DELETE FROM patterns WHERE id = ?').run(id);
    }
  } catch { /* skip if delete not supported */ }
}

module.exports = {
  selfImprove,
  selfOptimize,
  fullCycle,
  consolidateDuplicates,
  consolidateTags,
  pruneStuckCandidates,
  polishCycle,
  iterativePolish,
  OPTIMIZE_DEFAULTS,
};
