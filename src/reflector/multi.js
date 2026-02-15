/**
 * Remembrance Self-Reflector — Consolidated Multi Module
 *
 * Merges the core reflector engine, multi-repo analysis, workflow orchestration,
 * and task scheduling into a single module.
 *
 * From engine.js:
 *   scanDirectory, evaluateFile, takeSnapshot, healFile, reflect,
 *   formatReport, formatPRBody, generateCollectiveWhisper, DEFAULT_CONFIG
 *
 * From multi.js:
 *   multiSnapshot, compareDimensions, detectDrift, unifiedHeal, multiReflect,
 *   formatMultiReport, formatMultiPRBody, generateMultiWhisper,
 *   extractFunctionSignatures, extractFunctionBody, codeSimilarity
 *
 * From orchestrator.js:
 *   orchestrate, formatOrchestration
 *
 * From scheduler.js:
 *   startScheduler, runReflector, parseCronInterval, getStatus,
 *   DEFAULT_SCHEDULE_CONFIG, loadConfig, saveConfig, loadHistory, recordRun,
 *   getConfigPath, getHistoryPath, getReportPath
 *
 * External requires (./scoring and ./report) are lazy-loaded inside functions
 * to avoid circular dependencies.
 */

const { readFileSync, readdirSync, statSync, existsSync, writeFileSync, mkdirSync } = require('fs');
const { join, extname, relative, basename } = require('path');
const { observeCoherence, reflectionLoop, generateCandidates } = require('../core/reflection');
const { detectLanguage } = require('../core/coherency');
const { covenantCheck } = require('../core/covenant');

// ═══════════════════════════════════════════════════════════════════════════════
// ── ENGINE: Core Reflector ──────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Configuration Defaults ───

const DEFAULT_CONFIG = {
  minCoherence: 0.7,           // Files below this get healed
  autoMergeThreshold: 0.9,     // Auto-merge PRs above this coherence
  maxFilesPerRun: 50,          // Safety limit
  maxFileSizeBytes: 100000,    // Skip files larger than 100KB
  maxSerfLoops: 3,             // SERF iterations per file
  targetCoherence: 0.95,       // SERF target per file
  includeExtensions: ['.js', '.ts', '.py', '.go', '.rs', '.java', '.jsx', '.tsx'],
  excludeDirs: ['node_modules', '.git', 'dist', 'build', 'coverage', '.remembrance', 'vendor', '__pycache__'],
  excludeFiles: ['package-lock.json', 'yarn.lock', 'pnpm-lock.yaml'],
};

// ─── File Scanner ───

/**
 * Recursively scan a directory for source files matching config criteria.
 *
 * @param {string} rootDir - Root directory to scan
 * @param {object} config - Scanner configuration
 * @returns {string[]} Array of absolute file paths
 */
function scanDirectory(rootDir, config = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const files = [];

  function walk(dir) {
    if (files.length >= opts.maxFilesPerRun) return;

    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      return; // Skip unreadable directories
    }

    for (const entry of entries) {
      if (files.length >= opts.maxFilesPerRun) break;

      const fullPath = join(dir, entry);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue; // Skip unreadable files
      }

      if (stat.isDirectory()) {
        if (!opts.excludeDirs.includes(entry)) {
          walk(fullPath);
        }
      } else if (stat.isFile()) {
        if (opts.excludeFiles.includes(entry)) continue;
        const ext = extname(entry);
        if (!opts.includeExtensions.includes(ext)) continue;
        if (stat.size > opts.maxFileSizeBytes) continue;
        files.push(fullPath);
      }
    }
  }

  walk(rootDir);
  return files;
}

// ─── File Coherence Evaluation ───

/**
 * Evaluate a single file's coherence across all SERF dimensions.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {object} config - Evaluation config
 * @returns {object} { path, language, coherence, dimensions, size, lines }
 */
function evaluateFile(filePath, config = {}) {
  let code;
  try {
    code = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { path: filePath, error: `Read failed: ${err.message}`, coherence: 0 };
  }

  if (!code.trim()) {
    return { path: filePath, error: 'Empty file', coherence: 0 };
  }

  const language = detectLanguage(code);
  const observation = observeCoherence(code, { language });

  // Covenant check — does this file pass the 15 principles?
  const covenant = covenantCheck(code, { language });

  return {
    path: filePath,
    language,
    coherence: observation.composite,
    dimensions: observation.dimensions,
    covenantSealed: covenant.sealed,
    covenantViolations: covenant.violations || [],
    size: code.length,
    lines: code.split('\n').length,
  };
}

// ─── Codebase Snapshot ───

/**
 * Take a coherence snapshot of an entire codebase.
 * Returns per-file scores and aggregate statistics.
 *
 * @param {string} rootDir - Root directory to scan
 * @param {object} config - Configuration overrides
 * @returns {object} { files, aggregate, belowThreshold, timestamp }
 */
function takeSnapshot(rootDir, config = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const filePaths = scanDirectory(rootDir, opts);
  const files = [];

  for (const filePath of filePaths) {
    const evaluation = evaluateFile(filePath, opts);
    evaluation.relativePath = relative(rootDir, filePath);
    files.push(evaluation);
  }

  // Compute aggregate statistics
  const validFiles = files.filter(f => !f.error);
  const coherenceValues = validFiles.map(f => f.coherence);
  const avgCoherence = coherenceValues.length > 0
    ? coherenceValues.reduce((s, v) => s + v, 0) / coherenceValues.length
    : 0;

  const belowThreshold = validFiles.filter(f => f.coherence < opts.minCoherence);

  // Aggregate dimension scores
  const dimensionAverages = {};
  if (validFiles.length > 0) {
    const dims = Object.keys(validFiles[0].dimensions || {});
    for (const dim of dims) {
      const values = validFiles.map(f => f.dimensions?.[dim] || 0);
      dimensionAverages[dim] = values.reduce((s, v) => s + v, 0) / values.length;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    rootDir,
    config: opts,
    files,
    aggregate: {
      totalFiles: files.length,
      validFiles: validFiles.length,
      errorFiles: files.filter(f => f.error).length,
      avgCoherence: Math.round(avgCoherence * 1000) / 1000,
      minCoherence: coherenceValues.length > 0 ? Math.min(...coherenceValues) : 0,
      maxCoherence: coherenceValues.length > 0 ? Math.max(...coherenceValues) : 0,
      dimensionAverages,
      covenantViolations: files.filter(f => !f.covenantSealed).length,
    },
    belowThreshold: belowThreshold.map(f => ({
      path: f.relativePath,
      coherence: f.coherence,
      dimensions: f.dimensions,
    })),
  };
}

// ─── Healing Engine ───

/**
 * Heal a single file using the SERF reflection loop.
 * Returns the healed code, coherence improvement, and whisper explanation.
 *
 * @param {string} filePath - Absolute path to the file
 * @param {object} config - Healing configuration
 * @returns {object} { path, original, healed, improvement, whisper, changed }
 */
function healFile(filePath, config = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };

  let code;
  try {
    code = readFileSync(filePath, 'utf-8');
  } catch (err) {
    return { path: filePath, error: `Read failed: ${err.message}`, changed: false };
  }

  if (!code.trim()) {
    return { path: filePath, error: 'Empty file', changed: false };
  }

  const language = detectLanguage(code);

  // Run SERF reflection loop (with optional pattern examples)
  const reflectionOpts = {
    language,
    maxLoops: opts.maxSerfLoops,
    targetCoherence: opts.targetCoherence,
  };
  if (opts.patternExamples && opts.patternExamples.length > 0) {
    reflectionOpts.patternExamples = opts.patternExamples;
    reflectionOpts.cascadeBoost = 1.05; // Slight boost for pattern-guided healing
  }
  const result = reflectionLoop(code, reflectionOpts);

  const changed = result.code !== code;

  return {
    path: filePath,
    relativePath: config.rootDir ? relative(config.rootDir, filePath) : filePath,
    language,
    original: {
      code,
      coherence: result.reflection.I_AM,
    },
    healed: {
      code: result.code,
      coherence: result.coherence,
    },
    improvement: result.reflection.improvement,
    dimensions: result.dimensions,
    whisper: result.whisper,
    healingSummary: result.healingSummary,
    healingPath: result.healingPath,
    loops: result.loops,
    changed,
  };
}

// ─── Full Reflector Run ───

/**
 * Run the full self-reflector on a codebase:
 * 1. Snapshot the codebase (evaluate all files)
 * 2. Identify files below coherence threshold
 * 3. Heal each file via SERF reflection
 * 4. Return a structured report with all changes
 *
 * @param {string} rootDir - Root directory to reflect on
 * @param {object} config - Configuration overrides
 * @returns {object} Full reflector report
 */
function reflect(rootDir, config = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };

  // Lazy require: patternHook → ./report
  const { hookBeforeHeal, recordPatternHookUsage } = require('./report');

  // Step 1: Take snapshot (or reuse pre-computed one to avoid redundant scans)
  const snapshot = opts._preSnapshot || takeSnapshot(rootDir, opts);

  // Step 2: Identify files needing healing
  const filesToHeal = snapshot.files
    .filter(f => !f.error && f.coherence < opts.minCoherence && f.covenantSealed)
    .sort((a, b) => a.coherence - b.coherence); // Worst first

  // Step 3: Heal each file (with optional pattern hook)
  const healings = [];
  for (const file of filesToHeal) {
    // Query pattern library for guidance before healing
    let patternContext = null;
    if (opts.usePatternHook !== false) {
      try {
        patternContext = hookBeforeHeal(file.path, { rootDir });
      } catch {
        // Pattern hook failure is non-fatal
      }
    }

    // Pass pattern examples to healFile so SERF can use them
    const healOpts = { ...opts, rootDir };
    if (patternContext?.patternGuided && patternContext.healingContext?.examples) {
      healOpts.patternExamples = patternContext.healingContext.examples;
    }
    const healing = healFile(file.path, healOpts);
    if (healing.changed && healing.improvement > 0) {
      healing.patternGuided = patternContext?.patternGuided || false;
      healings.push(healing);

      // Record pattern hook usage
      if (patternContext) {
        try {
          recordPatternHookUsage(rootDir, {
            filePath: file.path,
            patternGuided: patternContext.patternGuided,
            patternName: patternContext.bestMatch?.name || null,
            improvement: healing.improvement,
          });
        } catch {
          // Recording failure is non-fatal
        }
      }
    }
  }

  // Step 4: Compute overall improvement
  const totalImprovement = healings.reduce((s, h) => s + h.improvement, 0);
  const avgImprovement = healings.length > 0 ? totalImprovement / healings.length : 0;

  // Step 5: Generate a collective whisper
  const collectiveWhisper = generateCollectiveWhisper(snapshot, healings);

  return {
    timestamp: snapshot.timestamp,
    rootDir,
    snapshot: {
      totalFiles: snapshot.aggregate.totalFiles,
      avgCoherence: snapshot.aggregate.avgCoherence,
      minCoherence: snapshot.aggregate.minCoherence,
      maxCoherence: snapshot.aggregate.maxCoherence,
      dimensionAverages: snapshot.aggregate.dimensionAverages,
      covenantViolations: snapshot.aggregate.covenantViolations,
    },
    healings: healings.map(h => ({
      path: h.relativePath,
      language: h.language,
      originalCoherence: h.original.coherence,
      healedCoherence: h.healed.coherence,
      improvement: h.improvement,
      whisper: h.whisper,
      healingSummary: h.healingSummary,
      loops: h.loops,
    })),
    healedFiles: healings.map(h => ({
      path: h.relativePath,
      absolutePath: h.path,
      code: h.healed.code,
    })),
    summary: {
      filesScanned: snapshot.aggregate.totalFiles,
      filesBelowThreshold: filesToHeal.length,
      filesHealed: healings.length,
      totalImprovement: Math.round(totalImprovement * 1000) / 1000,
      avgImprovement: Math.round(avgImprovement * 1000) / 1000,
      autoMergeRecommended: snapshot.aggregate.avgCoherence >= opts.autoMergeThreshold,
    },
    collectiveWhisper,
    config: opts,
  };
}

// ─── Collective Whisper ───

function generateCollectiveWhisper(snapshot, healings) {
  if (healings.length === 0) {
    const avg = snapshot.aggregate.avgCoherence;
    return {
      message: 'The codebase rests in coherence. No healing was needed this cycle.',
      overallHealth: avg >= 0.8 ? 'healthy' : avg >= 0.6 ? 'stable' : 'needs attention',
    };
  }

  // Find the dominant healing strategy across all files
  const strategyCounts = {};
  for (const h of healings) {
    if (h.healingPath) {
      for (const path of h.healingPath) {
        const strategy = path.split(':')[0].trim();
        strategyCounts[strategy] = (strategyCounts[strategy] || 0) + 1;
      }
    }
  }

  const dominant = Object.entries(strategyCounts)
    .sort((a, b) => b[1] - a[1])[0]?.[0] || 'reflection';

  const messages = {
    simplify: `${healings.length} file(s) were simplified — complexity fell away, revealing cleaner structure.`,
    secure: `${healings.length} file(s) were hardened — security boundaries strengthened across the codebase.`,
    readable: `${healings.length} file(s) were clarified — the future reader will understand instantly.`,
    unify: `${healings.length} file(s) were harmonized — the codebase now speaks with one voice.`,
    correct: `${healings.length} file(s) were corrected — edge cases sealed, robustness improved.`,
    heal: `${healings.length} file(s) received full healing — all five threads wove together.`,
    reflection: `${healings.length} file(s) were refined through reflection.`,
  };

  return {
    message: messages[dominant] || messages.reflection,
    dominantStrategy: dominant,
    filesHealed: healings.length,
    overallHealth: snapshot.aggregate.avgCoherence >= 0.8 ? 'healthy'
      : snapshot.aggregate.avgCoherence >= 0.6 ? 'stable'
      : 'needs attention',
  };
}

// ─── Report Formatting ───

/**
 * Format a reflector report as human-readable text.
 */
function formatReport(report) {
  const lines = [];
  lines.push('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  lines.push('\u2551       Remembrance Self-Reflector Report             \u2551');
  lines.push('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
  lines.push('');
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`Root: ${report.rootDir}`);
  lines.push('');

  // Snapshot summary
  lines.push('\u2500\u2500 Codebase Snapshot \u2500\u2500');
  lines.push(`  Files scanned: ${report.snapshot.totalFiles}`);
  lines.push(`  Avg coherence: ${report.snapshot.avgCoherence.toFixed(3)}`);
  lines.push(`  Min coherence: ${report.snapshot.minCoherence.toFixed(3)}`);
  lines.push(`  Max coherence: ${report.snapshot.maxCoherence.toFixed(3)}`);
  if (report.snapshot.covenantViolations > 0) {
    lines.push(`  Covenant violations: ${report.snapshot.covenantViolations}`);
  }
  lines.push('');

  // Dimension averages
  if (report.snapshot.dimensionAverages) {
    lines.push('\u2500\u2500 Dimension Averages \u2500\u2500');
    for (const [dim, val] of Object.entries(report.snapshot.dimensionAverages)) {
      const bar = '\u2588'.repeat(Math.round(val * 20));
      const faded = '\u2591'.repeat(20 - Math.round(val * 20));
      lines.push(`  ${dim.padEnd(14)} ${bar}${faded} ${val.toFixed(3)}`);
    }
    lines.push('');
  }

  // Healings
  lines.push('\u2500\u2500 Healing Results \u2500\u2500');
  lines.push(`  Files below threshold: ${report.summary.filesBelowThreshold}`);
  lines.push(`  Files healed: ${report.summary.filesHealed}`);
  lines.push(`  Total improvement: +${report.summary.totalImprovement.toFixed(3)}`);
  lines.push(`  Avg improvement: +${report.summary.avgImprovement.toFixed(3)}`);
  lines.push('');

  if (report.healings.length > 0) {
    for (const h of report.healings) {
      lines.push(`  ${h.path}`);
      lines.push(`    ${h.originalCoherence.toFixed(3)} \u2192 ${h.healedCoherence.toFixed(3)} (+${h.improvement.toFixed(3)}) [${h.loops} loop(s)]`);
      lines.push(`    Whisper: "${h.whisper}"`);
      lines.push('');
    }
  }

  // Collective whisper
  lines.push('\u2500\u2500 Collective Whisper \u2500\u2500');
  lines.push(`  "${report.collectiveWhisper.message}"`);
  lines.push(`  Overall health: ${report.collectiveWhisper.overallHealth}`);
  if (report.summary.autoMergeRecommended) {
    lines.push('  Auto-merge: RECOMMENDED (high overall coherence)');
  }

  return lines.join('\n');
}

/**
 * Format a reflector report as a GitHub PR body (markdown).
 */
function formatPRBody(report) {
  const lines = [];
  lines.push('## Remembrance Pull: Healed Refinement');
  lines.push('');
  lines.push(`> ${report.collectiveWhisper.message}`);
  lines.push('');

  // Summary table
  lines.push('### Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Files scanned | ${report.snapshot.totalFiles} |`);
  lines.push(`| Avg coherence | ${report.snapshot.avgCoherence.toFixed(3)} |`);
  lines.push(`| Files below threshold | ${report.summary.filesBelowThreshold} |`);
  lines.push(`| Files healed | ${report.summary.filesHealed} |`);
  lines.push(`| Total improvement | +${report.summary.totalImprovement.toFixed(3)} |`);
  lines.push('');

  // Dimension averages
  if (report.snapshot.dimensionAverages) {
    lines.push('### Coherence Dimensions');
    lines.push('');
    for (const [dim, val] of Object.entries(report.snapshot.dimensionAverages)) {
      const filled = Math.round(val * 10);
      const bar = '\u2588'.repeat(filled) + '\u2591'.repeat(10 - filled);
      lines.push(`- **${dim}**: \`${bar}\` ${val.toFixed(3)}`);
    }
    lines.push('');
  }

  // Per-file changes
  if (report.healings.length > 0) {
    lines.push('### Healed Files');
    lines.push('');
    for (const h of report.healings) {
      lines.push(`#### \`${h.path}\``);
      lines.push(`- **Coherence**: ${h.originalCoherence.toFixed(3)} \u2192 ${h.healedCoherence.toFixed(3)} (+${h.improvement.toFixed(3)})`);
      lines.push(`- **Strategy**: ${h.healingSummary}`);
      lines.push(`- **Whisper**: *"${h.whisper}"*`);
      lines.push('');
    }
  }

  // Health assessment
  lines.push('### Health Assessment');
  lines.push('');
  lines.push(`Overall codebase health: **${report.collectiveWhisper.overallHealth}**`);
  if (report.summary.autoMergeRecommended) {
    lines.push('');
    lines.push('> This PR is recommended for auto-merge (high overall coherence).');
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── MULTI: Multi-Repo Analysis ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Cross-Repo Snapshot ───

/**
 * Take coherence snapshots of multiple repos and merge them into
 * a combined view with per-repo breakdowns and cross-repo aggregates.
 *
 * @param {string[]} repoPaths - Array of absolute repo root paths
 * @param {object} config - Configuration overrides
 * @returns {object} Combined multi-repo snapshot
 */
function multiSnapshot(repoPaths, config = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };
  const repos = [];
  const _fullSnapshots = new Map(); // Cache full snapshots for reuse by other functions

  for (const repoPath of repoPaths) {
    const snap = takeSnapshot(repoPath, opts);
    _fullSnapshots.set(repoPath, snap);
    repos.push({
      name: basename(repoPath),
      path: repoPath,
      snapshot: snap,
    });
  }

  // Merge all valid files across repos
  const allValid = [];
  for (const repo of repos) {
    for (const file of repo.snapshot.files) {
      if (!file.error) {
        allValid.push({ ...file, repoName: repo.name, repoPath: repo.path });
      }
    }
  }

  // Combined aggregates
  const coherenceValues = allValid.map(f => f.coherence);
  const combinedAvg = coherenceValues.length > 0
    ? coherenceValues.reduce((s, v) => s + v, 0) / coherenceValues.length
    : 0;

  // Combined dimension averages
  const combinedDimensions = {};
  if (allValid.length > 0) {
    const dims = Object.keys(allValid[0].dimensions || {});
    for (const dim of dims) {
      const vals = allValid.map(f => f.dimensions?.[dim] || 0);
      combinedDimensions[dim] = vals.reduce((s, v) => s + v, 0) / vals.length;
    }
  }

  return {
    timestamp: new Date().toISOString(),
    repoCount: repos.length,
    repos: repos.map(r => ({
      name: r.name,
      path: r.path,
      totalFiles: r.snapshot.aggregate.totalFiles,
      avgCoherence: r.snapshot.aggregate.avgCoherence,
      minCoherence: r.snapshot.aggregate.minCoherence,
      maxCoherence: r.snapshot.aggregate.maxCoherence,
      dimensionAverages: r.snapshot.aggregate.dimensionAverages,
      covenantViolations: r.snapshot.aggregate.covenantViolations,
      belowThreshold: r.snapshot.belowThreshold,
    })),
    combined: {
      totalFiles: allValid.length,
      avgCoherence: Math.round(combinedAvg * 1000) / 1000,
      minCoherence: coherenceValues.length > 0 ? Math.min(...coherenceValues) : 0,
      maxCoherence: coherenceValues.length > 0 ? Math.max(...coherenceValues) : 0,
      dimensionAverages: combinedDimensions,
    },
    config: opts,
    _fullSnapshots, // Internal: cached full snapshots for reuse by unifiedHeal
  };
}

// ─── Dimension Comparison ───

/**
 * Compare two repos dimension-by-dimension.
 * Produces a side-by-side breakdown showing which repo leads on each dimension,
 * the delta between them, and an overall divergence score.
 *
 * @param {object} multiSnap - Result from multiSnapshot()
 * @returns {object} Dimension comparison report
 */
function compareDimensions(multiSnap) {
  if (!multiSnap.repos || multiSnap.repos.length < 2) {
    return { error: 'Need at least 2 repos to compare', comparisons: [] };
  }

  const repoA = multiSnap.repos[0];
  const repoB = multiSnap.repos[1];
  const dimsA = repoA.dimensionAverages || {};
  const dimsB = repoB.dimensionAverages || {};
  const allDims = new Set([...Object.keys(dimsA), ...Object.keys(dimsB)]);

  const comparisons = [];
  let totalDivergence = 0;

  for (const dim of allDims) {
    const valA = dimsA[dim] || 0;
    const valB = dimsB[dim] || 0;
    const delta = Math.round((valA - valB) * 1000) / 1000;
    const absDelta = Math.abs(delta);
    totalDivergence += absDelta;

    comparisons.push({
      dimension: dim,
      [repoA.name]: Math.round(valA * 1000) / 1000,
      [repoB.name]: Math.round(valB * 1000) / 1000,
      delta,
      leader: delta > 0.01 ? repoA.name : delta < -0.01 ? repoB.name : 'tied',
      severity: absDelta >= 0.2 ? 'high' : absDelta >= 0.1 ? 'medium' : 'low',
    });
  }

  const avgDivergence = comparisons.length > 0 ? totalDivergence / comparisons.length : 0;

  // Overall coherence comparison
  const coherenceDelta = Math.round((repoA.avgCoherence - repoB.avgCoherence) * 1000) / 1000;

  return {
    repoA: { name: repoA.name, avgCoherence: repoA.avgCoherence },
    repoB: { name: repoB.name, avgCoherence: repoB.avgCoherence },
    coherenceDelta,
    coherenceLeader: coherenceDelta > 0.01 ? repoA.name : coherenceDelta < -0.01 ? repoB.name : 'tied',
    avgDivergence: Math.round(avgDivergence * 1000) / 1000,
    convergenceScore: Math.round((1 - avgDivergence) * 1000) / 1000,
    comparisons,
  };
}

// ─── Pattern Drift Detection ───

/**
 * Extract function signatures from a file for drift comparison.
 * Lightweight extraction — name + normalized body hash.
 */
function extractFunctionSignatures(code, language) {
  const fns = [];
  const lang = (language || '').toLowerCase();

  if (lang === 'javascript' || lang === 'js' || lang === 'typescript' || lang === 'ts' || lang === 'jsx' || lang === 'tsx') {
    // Match: function name(...) {, const name = (...) =>, name(...) { (method)
    const patterns = [
      /(?:function\s+)(\w+)\s*\(([^)]*)\)/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?\(([^)]*)\)\s*=>/g,
      /(?:const|let|var)\s+(\w+)\s*=\s*function\s*\(([^)]*)\)/g,
    ];
    for (const pattern of patterns) {
      let m;
      while ((m = pattern.exec(code)) !== null) {
        fns.push({ name: m[1], params: m[2].trim() });
      }
    }
  } else if (lang === 'python' || lang === 'py') {
    const pyPattern = /def\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = pyPattern.exec(code)) !== null) {
      fns.push({ name: m[1], params: m[2].trim() });
    }
  } else if (lang === 'go') {
    const goPattern = /func\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = goPattern.exec(code)) !== null) {
      fns.push({ name: m[1], params: m[2].trim() });
    }
  } else if (lang === 'rust' || lang === 'rs') {
    const rsPattern = /fn\s+(\w+)\s*\(([^)]*)\)/g;
    let m;
    while ((m = rsPattern.exec(code)) !== null) {
      fns.push({ name: m[1], params: m[2].trim() });
    }
  }

  return fns;
}

/**
 * Extract the body of a named function from source code.
 * Uses brace counting for JS/TS/Go/Rust, indentation for Python.
 */
function extractFunctionBody(code, fnName, language) {
  const lines = code.split('\n');
  const lang = (language || '').toLowerCase();

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    // Check if this line declares the target function
    if (!line.includes(fnName)) continue;

    // JS/TS/Go/Rust: brace counting
    if (lang !== 'python' && lang !== 'py') {
      if (line.includes('{')) {
        let depth = 0;
        let started = false;
        const bodyLines = [];
        for (let j = i; j < lines.length; j++) {
          bodyLines.push(lines[j]);
          for (const ch of lines[j]) {
            if (ch === '{') { depth++; started = true; }
            if (ch === '}') depth--;
          }
          if (started && depth <= 0) break;
        }
        if (bodyLines.length > 0) return bodyLines.join('\n');
      }
    } else {
      // Python: indentation-based
      if (line.trim().startsWith('def ') && line.trim().endsWith(':')) {
        const baseIndent = line.match(/^(\s*)/)[1].length;
        const bodyLines = [line];
        for (let j = i + 1; j < lines.length; j++) {
          if (lines[j].trim() === '') { bodyLines.push(lines[j]); continue; }
          const indent = lines[j].match(/^(\s*)/)[1].length;
          if (indent > baseIndent) bodyLines.push(lines[j]);
          else break;
        }
        return bodyLines.join('\n');
      }
    }
  }

  return null;
}

/**
 * Simple token-based similarity between two code strings.
 * Uses Jaccard similarity on word tokens.
 */
function codeSimilarity(codeA, codeB) {
  const tokensA = new Set((codeA.match(/\b\w+\b/g) || []).map(t => t.toLowerCase()));
  const tokensB = new Set((codeB.match(/\b\w+\b/g) || []).map(t => t.toLowerCase()));
  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  const intersection = [...tokensA].filter(t => tokensB.has(t)).length;
  const union = new Set([...tokensA, ...tokensB]).size;
  return union > 0 ? intersection / union : 0;
}

/**
 * Detect pattern drift between two repos.
 *
 * Scans both repos, extracts function names, and finds:
 * - Shared functions (same name, present in both repos)
 * - Diverged functions (same name, different implementations)
 * - Unique functions (only in one repo)
 *
 * @param {string[]} repoPaths - [repoA, repoB]
 * @param {object} config - Configuration overrides
 * @returns {object} Drift detection report
 */
function detectDrift(repoPaths, config = {}) {
  if (repoPaths.length < 2) {
    return { error: 'Need at least 2 repos for drift detection' };
  }

  const opts = { ...DEFAULT_CONFIG, ...config };
  const repoAPath = repoPaths[0];
  const repoBPath = repoPaths[1];
  const repoAName = basename(repoAPath);
  const repoBName = basename(repoBPath);

  // Scan and extract functions from both repos
  const repoAFiles = scanDirectory(repoAPath, opts);
  const repoBFiles = scanDirectory(repoBPath, opts);

  // Build function maps: name -> { code, file, language, params }
  const funcsA = new Map();
  const funcsB = new Map();

  function extractFromFiles(files, rootDir, funcMap) {
    for (const filePath of files) {
      let code;
      try { code = readFileSync(filePath, 'utf-8'); } catch { continue; }
      const lang = detectLanguage(code);
      const fns = extractFunctionSignatures(code, lang);
      for (const fn of fns) {
        // Use name as key; if duplicate, keep the first occurrence
        if (!funcMap.has(fn.name)) {
          // Extract just the function body for comparison, not the whole file
          const fnBody = extractFunctionBody(code, fn.name, lang);
          funcMap.set(fn.name, {
            name: fn.name,
            params: fn.params,
            file: relative(rootDir, filePath),
            language: lang,
            code: fnBody || code, // Fallback to whole file if body extraction fails
          });
        }
      }
    }
  }

  extractFromFiles(repoAFiles, repoAPath, funcsA);
  extractFromFiles(repoBFiles, repoBPath, funcsB);

  // Classify
  const shared = [];
  const diverged = [];
  const uniqueA = [];
  const uniqueB = [];

  for (const [name, fnA] of funcsA) {
    if (funcsB.has(name)) {
      const fnB = funcsB.get(name);
      const similarity = codeSimilarity(fnA.code, fnB.code);
      const entry = {
        name,
        fileA: fnA.file,
        fileB: fnB.file,
        paramsA: fnA.params,
        paramsB: fnB.params,
        similarity: Math.round(similarity * 1000) / 1000,
        language: fnA.language,
      };

      if (similarity >= 0.95) {
        shared.push({ ...entry, status: 'identical' });
      } else if (similarity >= 0.5) {
        diverged.push({ ...entry, status: 'diverged', drift: Math.round((1 - similarity) * 1000) / 1000 });
      } else {
        diverged.push({ ...entry, status: 'heavily-diverged', drift: Math.round((1 - similarity) * 1000) / 1000 });
      }
    } else {
      uniqueA.push({ name, file: fnA.file, language: fnA.language, params: fnA.params });
    }
  }

  for (const [name, fnB] of funcsB) {
    if (!funcsA.has(name)) {
      uniqueB.push({ name, file: fnB.file, language: fnB.language, params: fnB.params });
    }
  }

  // Sort diverged by drift amount (highest first)
  diverged.sort((a, b) => b.drift - a.drift);

  const totalSharedNames = shared.length + diverged.length;
  const avgDrift = diverged.length > 0
    ? diverged.reduce((s, d) => s + d.drift, 0) / diverged.length
    : 0;

  return {
    timestamp: new Date().toISOString(),
    repoA: { name: repoAName, path: repoAPath, functions: funcsA.size },
    repoB: { name: repoBName, path: repoBPath, functions: funcsB.size },
    shared: shared.length,
    diverged: diverged.length,
    uniqueToA: uniqueA.length,
    uniqueToB: uniqueB.length,
    avgDrift: Math.round(avgDrift * 1000) / 1000,
    convergenceScore: totalSharedNames > 0
      ? Math.round((shared.length / totalSharedNames) * 1000) / 1000
      : 1,
    details: {
      identical: shared,
      diverged,
      uniqueA,
      uniqueB,
    },
  };
}

// ─── Unified Healing ───

/**
 * Heal both repos toward a unified coherence standard.
 *
 * Strategy: Use the higher coherence of the two repos as the healing target.
 * Files below the unified threshold get healed via SERF in both repos.
 *
 * @param {string[]} repoPaths - [repoA, repoB]
 * @param {object} config - Configuration overrides
 * @returns {object} Unified healing report per repo
 */
function unifiedHeal(repoPaths, config = {}) {
  const opts = { ...DEFAULT_CONFIG, ...config };

  // Take snapshots first (or reuse pre-computed ones)
  const multiSnap = opts._preMultiSnapshot || multiSnapshot(repoPaths, opts);

  // Use the higher avg coherence as the target floor
  const maxAvgCoherence = Math.max(...multiSnap.repos.map(r => r.avgCoherence));
  const unifiedThreshold = Math.max(opts.minCoherence, maxAvgCoherence);

  const healingResults = [];

  for (const repo of multiSnap.repos) {
    const repoHealings = [];

    // Reuse cached snapshot from multiSnapshot if available, avoiding redundant scan
    const snap = multiSnap._fullSnapshots?.get(repo.path) || takeSnapshot(repo.path, opts);
    const filesToHeal = snap.files
      .filter(f => !f.error && f.coherence < unifiedThreshold && f.covenantSealed)
      .sort((a, b) => a.coherence - b.coherence);

    for (const file of filesToHeal) {
      const healing = healFile(file.path, {
        ...opts,
        rootDir: repo.path,
        targetCoherence: Math.min(unifiedThreshold + 0.1, 0.99),
      });
      if (healing.changed && healing.improvement > 0) {
        repoHealings.push({
          path: healing.relativePath,
          language: healing.language,
          originalCoherence: healing.original.coherence,
          healedCoherence: healing.healed.coherence,
          improvement: healing.improvement,
          whisper: healing.whisper,
        });
      }
    }

    const totalImprovement = repoHealings.reduce((s, h) => s + h.improvement, 0);

    healingResults.push({
      name: repo.name,
      path: repo.path,
      originalAvgCoherence: repo.avgCoherence,
      unifiedThreshold: Math.round(unifiedThreshold * 1000) / 1000,
      filesBelowThreshold: filesToHeal.length,
      filesHealed: repoHealings.length,
      totalImprovement: Math.round(totalImprovement * 1000) / 1000,
      healings: repoHealings,
    });
  }

  // Compute post-healing projected coherence
  const totalHealed = healingResults.reduce((s, r) => s + r.filesHealed, 0);
  const totalImproved = healingResults.reduce((s, r) => s + r.totalImprovement, 0);

  return {
    timestamp: new Date().toISOString(),
    unifiedThreshold: Math.round(unifiedThreshold * 1000) / 1000,
    repos: healingResults,
    summary: {
      totalRepos: repoPaths.length,
      totalFilesHealed: totalHealed,
      totalImprovement: Math.round(totalImproved * 1000) / 1000,
      convergenceWhisper: totalHealed > 0
        ? `${totalHealed} file(s) across ${repoPaths.length} repos were healed toward a unified coherence of ${unifiedThreshold.toFixed(3)}. The codebases are converging.`
        : 'Both repos already meet the unified coherence standard. They speak with one voice.',
    },
  };
}

// ─── Full Multi-Repo Run ───

/**
 * Run the complete multi-repo reflector pipeline:
 * 1. Multi-snapshot (both repos)
 * 2. Dimension comparison
 * 3. Drift detection
 * 4. Unified healing
 * 5. Combined report
 *
 * @param {string[]} repoPaths - Array of repo root paths
 * @param {object} config - Configuration overrides
 * @returns {object} Complete multi-repo report
 */
function multiReflect(repoPaths, config = {}) {
  const startTime = Date.now();
  const opts = { ...DEFAULT_CONFIG, ...config };
  const errors = [];

  // Step 1: Multi-snapshot
  let snapshot;
  try {
    snapshot = multiSnapshot(repoPaths, opts);
  } catch (err) {
    return { error: 'Multi-snapshot failed: ' + err.message, durationMs: Date.now() - startTime };
  }

  // Step 2: Dimension comparison (only for 2 repos)
  let comparison = null;
  if (repoPaths.length >= 2) {
    try {
      comparison = compareDimensions(snapshot);
    } catch (err) {
      errors.push({ step: 'comparison', error: err.message });
    }
  }

  // Step 3: Drift detection (only for 2 repos)
  let drift = null;
  if (repoPaths.length >= 2) {
    try {
      drift = detectDrift(repoPaths, opts);
    } catch (err) {
      errors.push({ step: 'drift-detection', error: err.message });
    }
  }

  // Step 4: Unified healing (pass pre-computed snapshot to avoid redundant scans)
  let healing;
  try {
    healing = unifiedHeal(repoPaths, { ...opts, _preMultiSnapshot: snapshot });
  } catch (err) {
    errors.push({ step: 'unified-heal', error: err.message });
    healing = { summary: { totalFilesHealed: 0, totalImprovement: 0 } };
  }

  return {
    timestamp: snapshot.timestamp,
    durationMs: Date.now() - startTime,
    snapshot,
    comparison,
    drift,
    healing,
    errors: errors.length > 0 ? errors : undefined,
    summary: {
      repoCount: repoPaths.length,
      combinedCoherence: snapshot.combined.avgCoherence,
      convergenceScore: comparison ? comparison.convergenceScore : 1,
      driftScore: drift ? drift.avgDrift : 0,
      totalFilesHealed: healing.summary.totalFilesHealed,
      totalImprovement: healing.summary.totalImprovement,
    },
    collectiveWhisper: generateMultiWhisper(snapshot, comparison, drift, healing),
  };
}

// ─── Multi-Repo Whisper ───

function generateMultiWhisper(snapshot, comparison, drift, healing) {
  const parts = [];

  // Coherence status
  const avg = snapshot.combined.avgCoherence;
  if (avg >= 0.8) {
    parts.push('The codebases rest in harmony.');
  } else if (avg >= 0.6) {
    parts.push('The codebases are stable but have room to grow.');
  } else {
    parts.push('The codebases need attention \u2014 coherence is below standard.');
  }

  // Convergence
  if (comparison) {
    if (comparison.convergenceScore >= 0.9) {
      parts.push('Their dimensions are nearly aligned \u2014 they see the world the same way.');
    } else if (comparison.convergenceScore >= 0.7) {
      parts.push(`They diverge slightly on some dimensions (convergence: ${comparison.convergenceScore}).`);
    } else {
      parts.push(`Significant dimensional divergence detected (convergence: ${comparison.convergenceScore}).`);
    }
  }

  // Drift
  if (drift && drift.diverged > 0) {
    parts.push(`${drift.diverged} shared function(s) have drifted apart (avg drift: ${drift.avgDrift}).`);
  }

  // Healing
  if (healing.summary.totalFilesHealed > 0) {
    parts.push(healing.summary.convergenceWhisper);
  }

  return parts.join(' ');
}

// ─── Multi-Repo Report Formatting ───

/**
 * Format multi-repo report as human-readable text.
 */
function formatMultiReport(report) {
  const lines = [];
  lines.push('\u2554\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2557');
  lines.push('\u2551       Remembrance Multi-Repo Reflector Report               \u2551');
  lines.push('\u255A\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u2550\u255D');
  lines.push('');
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`Duration: ${report.durationMs}ms`);
  lines.push('');

  // Per-repo snapshots
  lines.push('\u2500\u2500 Per-Repo Coherence \u2500\u2500');
  for (const repo of report.snapshot.repos) {
    lines.push(`  ${repo.name.padEnd(30)} avg: ${repo.avgCoherence.toFixed(3)}  min: ${repo.minCoherence.toFixed(3)}  max: ${repo.maxCoherence.toFixed(3)}  files: ${repo.totalFiles}`);
  }
  lines.push(`  ${'COMBINED'.padEnd(30)} avg: ${report.snapshot.combined.avgCoherence.toFixed(3)}  files: ${report.snapshot.combined.totalFiles}`);
  lines.push('');

  // Dimension comparison
  if (report.comparison) {
    lines.push('\u2500\u2500 Dimension Comparison \u2500\u2500');
    lines.push(`  Convergence score: ${report.comparison.convergenceScore.toFixed(3)}`);
    lines.push(`  Overall leader: ${report.comparison.coherenceLeader} (delta: ${report.comparison.coherenceDelta >= 0 ? '+' : ''}${report.comparison.coherenceDelta.toFixed(3)})`);
    lines.push('');
    for (const c of report.comparison.comparisons) {
      const aVal = Object.values(c).find((v, i) => i === 1);
      const bVal = Object.values(c).find((v, i) => i === 2);
      const arrow = c.delta > 0 ? '\u25B2' : c.delta < 0 ? '\u25BC' : '=';
      lines.push(`  ${c.dimension.padEnd(14)} ${String(aVal).padStart(5)} vs ${String(bVal).padStart(5)}  ${arrow} ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(3)}  [${c.severity}]`);
    }
    lines.push('');
  }

  // Drift detection
  if (report.drift) {
    lines.push('\u2500\u2500 Pattern Drift \u2500\u2500');
    lines.push(`  Shared identical: ${report.drift.shared}`);
    lines.push(`  Diverged: ${report.drift.diverged}`);
    lines.push(`  Unique to ${report.drift.repoA.name}: ${report.drift.uniqueToA}`);
    lines.push(`  Unique to ${report.drift.repoB.name}: ${report.drift.uniqueToB}`);
    lines.push(`  Avg drift: ${report.drift.avgDrift.toFixed(3)}`);
    lines.push(`  Convergence: ${report.drift.convergenceScore.toFixed(3)}`);
    if (report.drift.details.diverged.length > 0) {
      lines.push('');
      lines.push('  Top diverged functions:');
      for (const d of report.drift.details.diverged.slice(0, 10)) {
        lines.push(`    ${d.name} \u2014 drift: ${d.drift.toFixed(3)} (${d.status})`);
        lines.push(`      ${d.fileA} vs ${d.fileB}`);
      }
    }
    lines.push('');
  }

  // Unified healing
  lines.push('\u2500\u2500 Unified Healing \u2500\u2500');
  lines.push(`  Unified threshold: ${report.healing.unifiedThreshold}`);
  lines.push(`  Total files healed: ${report.healing.summary.totalFilesHealed}`);
  lines.push(`  Total improvement: +${report.healing.summary.totalImprovement.toFixed(3)}`);
  for (const r of report.healing.repos) {
    lines.push(`  ${r.name}: ${r.filesHealed} healed (+${r.totalImprovement.toFixed(3)})`);
  }
  lines.push('');

  // Collective whisper
  lines.push('\u2500\u2500 Collective Whisper \u2500\u2500');
  lines.push(`  "${report.collectiveWhisper}"`);

  return lines.join('\n');
}

/**
 * Format multi-repo report as GitHub PR body (markdown).
 */
function formatMultiPRBody(report) {
  const lines = [];
  lines.push('## Remembrance Multi-Repo Healed Refinement');
  lines.push('');
  lines.push(`> ${report.collectiveWhisper}`);
  lines.push('');

  // Summary
  lines.push('### Summary');
  lines.push('');
  lines.push('| Metric | Value |');
  lines.push('|--------|-------|');
  lines.push(`| Repos | ${report.summary.repoCount} |`);
  lines.push(`| Combined coherence | ${report.summary.combinedCoherence.toFixed(3)} |`);
  lines.push(`| Convergence | ${report.summary.convergenceScore.toFixed(3)} |`);
  lines.push(`| Drift | ${report.summary.driftScore.toFixed(3)} |`);
  lines.push(`| Files healed | ${report.summary.totalFilesHealed} |`);
  lines.push(`| Total improvement | +${report.summary.totalImprovement.toFixed(3)} |`);
  lines.push('');

  // Per-repo
  lines.push('### Per-Repo Breakdown');
  lines.push('');
  for (const repo of report.snapshot.repos) {
    lines.push(`#### ${repo.name}`);
    lines.push(`- **Avg coherence**: ${repo.avgCoherence.toFixed(3)}`);
    lines.push(`- **Files**: ${repo.totalFiles}`);
    if (repo.belowThreshold.length > 0) {
      lines.push(`- **Below threshold**: ${repo.belowThreshold.length}`);
    }
    lines.push('');
  }

  // Dimension comparison
  if (report.comparison) {
    lines.push('### Dimension Comparison');
    lines.push('');
    lines.push(`Convergence score: **${report.comparison.convergenceScore.toFixed(3)}**`);
    lines.push('');
    lines.push('| Dimension | ' + report.comparison.repoA.name + ' | ' + report.comparison.repoB.name + ' | Delta | Leader |');
    lines.push('|-----------|------|------|-------|--------|');
    for (const c of report.comparison.comparisons) {
      const keys = Object.keys(c);
      lines.push(`| ${c.dimension} | ${c[keys[1]]} | ${c[keys[2]]} | ${c.delta >= 0 ? '+' : ''}${c.delta.toFixed(3)} | ${c.leader} |`);
    }
    lines.push('');
  }

  // Drift
  if (report.drift && report.drift.diverged > 0) {
    lines.push('### Pattern Drift');
    lines.push('');
    lines.push(`**${report.drift.diverged}** shared functions have diverged (avg drift: ${report.drift.avgDrift.toFixed(3)})`);
    lines.push('');
    if (report.drift.details.diverged.length > 0) {
      lines.push('| Function | Drift | Status |');
      lines.push('|----------|-------|--------|');
      for (const d of report.drift.details.diverged.slice(0, 10)) {
        lines.push(`| \`${d.name}\` | ${d.drift.toFixed(3)} | ${d.status} |`);
      }
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── ORCHESTRATOR: Full Workflow ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Run the full orchestrated workflow.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - Overrides for config, dry-run mode, etc.
 * @returns {object} Complete orchestration result with per-step details
 */
function orchestrate(rootDir, options = {}) {
  // Lazy requires: ./scoring for config, safety, scoring; ./report for history, github, notifications
  const { repoScore, toEngineConfig, validateConfig, resolveConfig } = require('./scoring');
  const { safeReflect, dryRun, saveRunRecord, appendLog, createHealingBranch, notifyFromReport } = require('./report');

  const startTime = Date.now();
  const runId = `orch-${Date.now()}`;
  const steps = [];
  const result = {
    id: runId,
    timestamp: new Date().toISOString(),
    rootDir,
    mode: options.dryRun ? 'dry-run' : 'live',
    steps,
  };

  // -- Step 1: Load & Validate Config (via modes.resolveConfig) --
  const step1Start = Date.now();
  let config;
  try {
    const central = resolveConfig(rootDir, {
      mode: options.mode,
      env: process.env,
      overrides: options.configOverrides,
    });
    const validation = validateConfig(central);
    config = {
      ...toEngineConfig(central),
      ...options,
      _resolvedMode: central._mode,
    };
    steps.push({
      name: 'load-config',
      status: 'ok',
      durationMs: Date.now() - step1Start,
      configValid: validation.valid,
      issues: validation.issues,
    });
  } catch (err) {
    steps.push({ name: 'load-config', status: 'error', error: err.message, durationMs: Date.now() - step1Start });
    result.error = 'Config load failed: ' + err.message;
    result.durationMs = Date.now() - startTime;
    appendLog(rootDir, 'ERROR', 'Orchestrator: config load failed', { error: err.message });
    return result;
  }

  // -- Step 2: Take Snapshot --
  const step2Start = Date.now();
  let snapshot;
  try {
    snapshot = takeSnapshot(rootDir, config);
    steps.push({
      name: 'snapshot',
      status: 'ok',
      durationMs: Date.now() - step2Start,
      totalFiles: snapshot.aggregate.totalFiles,
      avgCoherence: snapshot.aggregate.avgCoherence,
      belowThreshold: snapshot.belowThreshold.length,
    });
  } catch (err) {
    steps.push({ name: 'snapshot', status: 'error', error: err.message, durationMs: Date.now() - step2Start });
    result.error = 'Snapshot failed: ' + err.message;
    result.durationMs = Date.now() - startTime;
    appendLog(rootDir, 'ERROR', 'Orchestrator: snapshot failed', { error: err.message });
    return result;
  }

  // -- Step 3: Deep Score --
  const step3Start = Date.now();
  let deepScoreResult;
  try {
    deepScoreResult = repoScore(rootDir, config);
    steps.push({
      name: 'deep-score',
      status: 'ok',
      durationMs: Date.now() - step3Start,
      aggregate: deepScoreResult.aggregate,
      health: deepScoreResult.health,
      securityFindings: deepScoreResult.securityFindings.length,
      worstFile: deepScoreResult.worstFiles[0]?.path || null,
      worstScore: deepScoreResult.worstFiles[0]?.score || null,
    });
  } catch (err) {
    steps.push({ name: 'deep-score', status: 'error', error: err.message, durationMs: Date.now() - step3Start });
    // Non-fatal — continue without deep scores
    deepScoreResult = null;
  }

  // -- Step 4: Heal (via safety pipeline) --
  const step4Start = Date.now();
  let healResult;
  try {
    if (options.dryRun) {
      healResult = dryRun(rootDir, { ...config, _preSnapshot: snapshot });
      steps.push({
        name: 'heal',
        status: 'ok',
        mode: 'dry-run',
        durationMs: Date.now() - step4Start,
        wouldHeal: healResult.summary.wouldHeal,
        projectedImprovement: healResult.summary.projectedAvgImprovement,
      });
    } else {
      // Pass preSnapshot so reflect() doesn't re-scan
      healResult = safeReflect(rootDir, {
        ...config,
        _preSnapshot: snapshot,
      });
      steps.push({
        name: 'heal',
        status: 'ok',
        mode: 'live',
        durationMs: Date.now() - step4Start,
        filesHealed: healResult.report?.filesHealed || 0,
        avgImprovement: healResult.report?.avgImprovement || 0,
        autoRolledBack: healResult.safety?.autoRolledBack || false,
        approvalRequired: healResult.safety?.approval?.requiresManualReview || false,
      });
    }
  } catch (err) {
    steps.push({ name: 'heal', status: 'error', error: err.message, durationMs: Date.now() - step4Start });
    result.error = 'Healing failed: ' + err.message;
    result.durationMs = Date.now() - startTime;
    appendLog(rootDir, 'ERROR', 'Orchestrator: healing failed', { error: err.message });
    return result;
  }

  // -- Step 5: Safety Check Summary --
  const step5Start = Date.now();
  const safetyReport = {};
  if (!options.dryRun && healResult) {
    safetyReport.backup = healResult.safety?.backup?.id || null;
    safetyReport.preCoherence = healResult.safety?.preCoherence || snapshot.aggregate.avgCoherence;
    safetyReport.coherenceGuard = healResult.safety?.coherenceGuard || null;
    safetyReport.approval = healResult.safety?.approval || null;
    safetyReport.autoRolledBack = healResult.safety?.autoRolledBack || false;
  }
  steps.push({
    name: 'safety-check',
    status: 'ok',
    durationMs: Date.now() - step5Start,
    ...safetyReport,
  });

  // -- Step 6: Generate Whisper --
  const step6Start = Date.now();
  let whisper;
  try {
    if (options.dryRun) {
      whisper = healResult.collectiveWhisper || 'Dry-run complete. No changes applied.';
    } else {
      whisper = healResult.report?.collectiveWhisper || 'No healing required \u2014 codebase is coherent.';
    }
    // Enrich with deep score health if available
    if (deepScoreResult) {
      whisper = `[${deepScoreResult.health}] ${whisper}`;
      if (deepScoreResult.securityFindings.length > 0) {
        whisper += ` (${deepScoreResult.securityFindings.length} security finding(s))`;
      }
    }
    steps.push({
      name: 'whisper',
      status: 'ok',
      durationMs: Date.now() - step6Start,
      message: whisper,
    });
  } catch (err) {
    whisper = 'Whisper generation failed.';
    steps.push({ name: 'whisper', status: 'error', error: err.message, durationMs: Date.now() - step6Start });
  }

  // -- Step 7: Create PR (if configured and not dry-run) --
  const step7Start = Date.now();
  const healedFiles = options.dryRun ? [] : (healResult.healedFiles || []);
  if (healedFiles.length > 0 && !safetyReport.autoRolledBack && (config.push || config.openPR)) {
    try {
      const branchReport = {
        rootDir,
        healedFiles,
        collectiveWhisper: { message: whisper },
        summary: {
          avgImprovement: healResult.report?.avgImprovement || 0,
          autoMergeRecommended: healResult.report?.autoMergeRecommended || false,
        },
        snapshot: snapshot.aggregate,
      };
      const branchResult = createHealingBranch(branchReport, {
        push: config.push,
        openPR: config.openPR,
        autoMerge: config.autoMerge,
        cwd: rootDir,
      });
      steps.push({
        name: 'create-pr',
        status: 'ok',
        durationMs: Date.now() - step7Start,
        branch: branchResult.branch,
        prUrl: branchResult.prUrl,
        prNumber: branchResult.prNumber,
        commits: branchResult.commits,
      });
      result.branch = branchResult.branch;
      result.prUrl = branchResult.prUrl;
    } catch (err) {
      steps.push({ name: 'create-pr', status: 'error', error: err.message, durationMs: Date.now() - step7Start });
    }
  } else {
    steps.push({
      name: 'create-pr',
      status: 'skipped',
      durationMs: Date.now() - step7Start,
      reason: options.dryRun ? 'dry-run mode' :
              healedFiles.length === 0 ? 'no files healed' :
              safetyReport.autoRolledBack ? 'auto-rolled back' :
              'push/PR not configured',
    });
  }

  // -- Step 7b: Send Notification (fire-and-forget, async) --
  if (healedFiles.length > 0 && !options.dryRun) {
    try {
      const notifyReport = {
        coherence: {
          before: snapshot.aggregate.avgCoherence,
          after: healResult.safety?.coherenceGuard?.postCoherence || snapshot.aggregate.avgCoherence,
        },
        report: { filesHealed: healResult.report?.filesHealed || 0 },
        whisper,
      };
      // Fire-and-forget: notifyFromReport is async, orchestrate is sync
      notifyFromReport(rootDir, notifyReport, { prUrl: result.prUrl }).catch(() => {});
    } catch {
      // Notification failure is non-fatal
    }
  }

  // -- Step 8: Record History --
  const step8Start = Date.now();
  try {
    const record = {
      id: runId,
      timestamp: result.timestamp,
      trigger: options.trigger || 'orchestrator',
      branch: result.branch || null,
      durationMs: Date.now() - startTime,
      coherence: {
        before: snapshot.aggregate.avgCoherence,
        after: options.dryRun ? snapshot.aggregate.avgCoherence : (healResult.safety?.coherenceGuard?.postCoherence || snapshot.aggregate.avgCoherence),
        delta: options.dryRun ? 0 : (healResult.report?.avgImprovement || 0),
      },
      healing: {
        filesScanned: snapshot.aggregate.totalFiles,
        filesBelowThreshold: snapshot.belowThreshold.length,
        filesHealed: options.dryRun ? 0 : (healResult.report?.filesHealed || 0),
        totalImprovement: 0,
        avgImprovement: options.dryRun ? 0 : (healResult.report?.avgImprovement || 0),
      },
      deepScore: deepScoreResult ? {
        aggregate: deepScoreResult.aggregate,
        health: deepScoreResult.health,
        securityFindings: deepScoreResult.securityFindings.length,
      } : null,
      changes: [],
      whisper,
      health: deepScoreResult?.health || 'unknown',
    };

    saveRunRecord(rootDir, record);
    appendLog(rootDir, 'INFO', `Orchestrator run complete: ${whisper}`, {
      runId,
      healed: record.healing.filesHealed,
      durationMs: record.durationMs,
    });

    steps.push({
      name: 'record-history',
      status: 'ok',
      durationMs: Date.now() - step8Start,
    });
  } catch (err) {
    steps.push({ name: 'record-history', status: 'error', error: err.message, durationMs: Date.now() - step8Start });
  }

  // -- Assemble final result --
  result.durationMs = Date.now() - startTime;
  result.snapshot = {
    totalFiles: snapshot.aggregate.totalFiles,
    avgCoherence: snapshot.aggregate.avgCoherence,
    belowThreshold: snapshot.belowThreshold.length,
  };
  result.deepScore = deepScoreResult ? {
    aggregate: deepScoreResult.aggregate,
    health: deepScoreResult.health,
    dimensions: deepScoreResult.dimensions,
    securityFindings: deepScoreResult.securityFindings.length,
    worstFiles: deepScoreResult.worstFiles,
  } : null;
  result.healing = {
    filesHealed: options.dryRun ? 0 : (healResult.report?.filesHealed || 0),
    avgImprovement: options.dryRun ? 0 : (healResult.report?.avgImprovement || 0),
    autoRolledBack: safetyReport.autoRolledBack || false,
  };
  result.whisper = whisper;
  result.safety = safetyReport;

  return result;
}

/**
 * Format an orchestration result as a human-readable summary.
 *
 * @param {object} result - From orchestrate()
 * @returns {string} Formatted text
 */
function formatOrchestration(result) {
  const lines = [];

  lines.push('Remembrance Self-Reflector \u2014 Orchestration Report');
  lines.push(`Run ID: ${result.id}`);
  lines.push(`Mode:   ${result.mode}`);
  lines.push(`Time:   ${result.durationMs}ms`);
  lines.push('');

  // Steps summary
  lines.push('Pipeline Steps:');
  for (const step of result.steps) {
    const icon = step.status === 'ok' ? '[OK]' : step.status === 'skipped' ? '[--]' : '[!!]';
    lines.push(`  ${icon} ${step.name.padEnd(18)} ${step.durationMs}ms${step.error ? '  ERROR: ' + step.error : ''}`);
  }
  lines.push('');

  // Snapshot
  if (result.snapshot) {
    lines.push(`Snapshot: ${result.snapshot.totalFiles} files, avg coherence ${result.snapshot.avgCoherence.toFixed(3)}, ${result.snapshot.belowThreshold} below threshold`);
  }

  // Deep Score
  if (result.deepScore) {
    lines.push(`Deep Score: ${result.deepScore.aggregate.toFixed(3)} (${result.deepScore.health}), ${result.deepScore.securityFindings} security finding(s)`);
    if (result.deepScore.worstFiles?.length > 0) {
      lines.push(`  Worst: ${result.deepScore.worstFiles[0].path} (${result.deepScore.worstFiles[0].score.toFixed(3)})`);
    }
  }

  // Healing
  lines.push(`Healing: ${result.healing.filesHealed} files healed, avg improvement ${result.healing.avgImprovement.toFixed(3)}`);
  if (result.healing.autoRolledBack) {
    lines.push('  AUTO-ROLLBACK: coherence dropped, changes reverted');
  }

  // Whisper
  lines.push('');
  lines.push(`Whisper: "${result.whisper}"`);

  // PR
  if (result.branch) lines.push(`Branch: ${result.branch}`);
  if (result.prUrl) lines.push(`PR: ${result.prUrl}`);

  return lines.join('\n');
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── SCHEDULER: Task Scheduling ──────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Schedule Configuration ───

const DEFAULT_SCHEDULE_CONFIG = {
  enabled: true,
  intervalHours: 6,           // Run every 6 hours
  minCoherence: 0.7,          // Healing threshold
  autoMerge: false,            // Auto-merge high-coherence PRs
  autoMergeThreshold: 0.9,    // Min coherence for auto-merge
  push: false,                 // Push healing branch to remote
  openPR: false,               // Open PR with healing
  maxFilesPerRun: 50,          // Safety limit
  skipIfPROpen: true,          // Skip if there's already an open reflector PR
  maxRunHistory: 50,           // Keep last 50 run records
};

// ─── Config Persistence ───

function getConfigPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-config.json');
}

function getHistoryPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-history.json');
}

function getReportPath(rootDir) {
  return join(rootDir, '.remembrance', 'reflector-report.json');
}

/**
 * Load reflector configuration from .remembrance/reflector-config.json
 * Also inherits from central config if available.
 */
function loadConfig(rootDir) {
  // Lazy requires: ./scoring for config + modes + utils
  const { resolveConfig, toEngineConfig } = require('./scoring');
  const { loadJSON } = require('./report');

  // Layer 1: Resolved config (central + mode + env overrides)
  let centralOverrides = {};
  try {
    const central = resolveConfig(rootDir, { env: process.env });
    const flat = toEngineConfig(central);
    centralOverrides = {
      minCoherence: flat.minCoherence,
      autoMergeThreshold: flat.autoMergeThreshold,
      push: flat.push,
      openPR: flat.openPR,
      autoMerge: flat.autoMerge,
      maxFilesPerRun: flat.maxFilesPerRun,
    };
  } catch {
    // Config not available, use schedule defaults
  }

  // Layer 2: Schedule-specific config (from reflector-config.json)
  const scheduleOverrides = loadJSON(getConfigPath(rootDir), {});

  return { ...DEFAULT_SCHEDULE_CONFIG, ...centralOverrides, ...scheduleOverrides };
}

/**
 * Save reflector configuration.
 */
function saveConfig(rootDir, config) {
  const { saveJSON } = require('./report');
  return saveJSON(getConfigPath(rootDir), config);
}

// ─── Run History ───

/**
 * Load run history from .remembrance/reflector-history.json
 */
function loadHistory(rootDir) {
  const { loadJSON } = require('./report');
  return loadJSON(getHistoryPath(rootDir), { runs: [] });
}

/**
 * Append a run record to history.
 */
function recordRun(rootDir, record) {
  const { trimArray, saveJSON } = require('./report');

  const history = loadHistory(rootDir);
  history.runs.push(record);

  const config = loadConfig(rootDir);
  trimArray(history.runs, config.maxRunHistory);
  saveJSON(getHistoryPath(rootDir), history);
  return record;
}

// ─── Scheduled Execution ───

/**
 * Run a single reflector cycle.
 * This is the main entry point for both scheduled and manual runs.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - Override config values for this run
 * @returns {object} Run result with report, branch info, timing
 */
function runReflector(rootDir, options = {}) {
  // Lazy requires: ./scoring for safety + utils; ./report for github + history
  const { safeReflect, saveJSON, createHealingBranch, findExistingReflectorPR, saveRunRecord } = require('./report');

  const config = { ...loadConfig(rootDir), ...options };
  const startTime = Date.now();

  const runRecord = {
    id: `run-${Date.now()}`,
    startedAt: new Date().toISOString(),
    config: {
      minCoherence: config.minCoherence,
      push: config.push,
      openPR: config.openPR,
      autoMerge: config.autoMerge,
    },
  };

  // Check for existing open PR if skipIfPROpen is set
  if (config.skipIfPROpen && config.openPR) {
    const existingPR = findExistingReflectorPR(rootDir);
    if (existingPR) {
      runRecord.skipped = true;
      runRecord.reason = `Existing reflector PR open: #${existingPR.number}`;
      runRecord.existingPR = existingPR;
      runRecord.finishedAt = new Date().toISOString();
      runRecord.durationMs = Date.now() - startTime;
      recordRun(rootDir, runRecord);
      return runRecord;
    }
  }

  // Run the reflector with safety protections (backup, approval, coherence guard)
  let safeResult;
  try {
    safeResult = safeReflect(rootDir, {
      ...config,
      dryRunMode: config.dryRun || false,
      requireApproval: config.requireApproval || false,
      autoRollback: config.autoRollback !== false,
    });
  } catch (err) {
    runRecord.error = err.message;
    runRecord.finishedAt = new Date().toISOString();
    runRecord.durationMs = Date.now() - startTime;
    recordRun(rootDir, runRecord);
    return runRecord;
  }

  const report = safeResult.report || {};
  runRecord.report = {
    filesScanned: report.filesScanned || 0,
    filesBelowThreshold: report.filesBelowThreshold || 0,
    filesHealed: report.filesHealed || 0,
    avgImprovement: report.avgImprovement || 0,
    autoMergeRecommended: report.autoMergeRecommended || false,
    collectiveWhisper: report.collectiveWhisper || '',
  };
  runRecord.safety = safeResult.safety || {};

  // Save full report to disk
  try {
    const reportPath = getReportPath(rootDir);
    saveJSON(reportPath, safeResult);
    runRecord.reportPath = reportPath;
  } catch {
    // Best effort
  }

  // Create healing branch if there are changes and not auto-rolled-back
  const healedFiles = safeResult.healedFiles || [];
  if (healedFiles.length > 0 && !safeResult.safety?.autoRolledBack) {
    // Build a report-like object for createHealingBranch
    const branchReport = {
      rootDir,
      healedFiles,
      collectiveWhisper: { message: report.collectiveWhisper || '' },
      summary: {
        avgImprovement: report.avgImprovement || 0,
        autoMergeRecommended: report.autoMergeRecommended || false,
      },
      snapshot: { totalFiles: report.filesScanned || 0, avgCoherence: 0, minCoherence: 0, maxCoherence: 0 },
    };

    try {
      const branchResult = createHealingBranch(branchReport, {
        push: config.push,
        openPR: config.openPR,
        autoMerge: config.autoMerge,
        cwd: rootDir,
      });
      runRecord.branch = branchResult.branch;
      runRecord.commits = branchResult.commits;
      runRecord.prUrl = branchResult.prUrl;
      runRecord.prNumber = branchResult.prNumber;
      runRecord.filesChanged = branchResult.files;
    } catch (err) {
      runRecord.branchError = err.message;
    }
  }

  runRecord.finishedAt = new Date().toISOString();
  runRecord.durationMs = Date.now() - startTime;
  recordRun(rootDir, runRecord);

  // Also save to v2 history for trend tracking
  try {
    const v2Record = {
      id: runRecord.id,
      timestamp: runRecord.startedAt,
      trigger: 'scheduled',
      branch: runRecord.branch || null,
      durationMs: runRecord.durationMs,
      coherence: {
        before: safeResult.safety?.preCoherence || 0,
        after: (safeResult.safety?.preCoherence || 0) + (report.avgImprovement || 0),
        delta: report.avgImprovement || 0,
      },
      healing: {
        filesScanned: report.filesScanned || 0,
        filesBelowThreshold: report.filesBelowThreshold || 0,
        filesHealed: report.filesHealed || 0,
        totalImprovement: report.totalImprovement || 0,
        avgImprovement: report.avgImprovement || 0,
      },
      changes: [],
      whisper: report.collectiveWhisper || '',
      health: 'unknown',
    };
    saveRunRecord(rootDir, v2Record, { maxRuns: config.maxRunHistory || 50 });
  } catch {
    // Best effort — v2 history write is supplementary
  }

  return runRecord;
}

// ─── Interval Scheduler ───

/**
 * Start the reflector on an interval timer.
 * Returns a controller object with stop() method.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - Override config values
 * @returns {object} { stop, isRunning, lastRun, nextRun }
 */
function startScheduler(rootDir, options = {}) {
  const config = { ...loadConfig(rootDir), ...options };
  const intervalMs = config.intervalHours * 60 * 60 * 1000;

  let timer = null;
  let running = false;
  let lastRun = null;

  const controller = {
    get isRunning() { return running; },
    get lastRun() { return lastRun; },
    get nextRun() {
      if (!timer || !lastRun) return null;
      return new Date(new Date(lastRun.startedAt).getTime() + intervalMs).toISOString();
    },

    async runOnce() {
      if (running) return lastRun;
      running = true;
      try {
        lastRun = runReflector(rootDir, config);
        return lastRun;
      } finally {
        running = false;
      }
    },

    stop() {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
    },
  };

  // Run immediately, then on interval
  controller.runOnce();

  timer = setInterval(() => {
    controller.runOnce();
  }, intervalMs);

  // Don't keep the process alive just for the timer
  if (timer.unref) timer.unref();

  return controller;
}

// ─── Cron Expression Parser (minimal) ───

/**
 * Parse a simple cron interval into hours.
 * Supports: "every 6 hours", "every 12h", "hourly", "daily"
 *
 * @param {string} expression - Human-readable interval
 * @returns {number} Interval in hours
 */
function parseCronInterval(expression) {
  const lower = expression.toLowerCase().trim();

  if (lower === 'hourly' || lower === 'every hour') return 1;
  if (lower === 'daily' || lower === 'every day') return 24;
  if (lower === 'weekly') return 168;

  const hourMatch = lower.match(/every\s+(\d+)\s*h(?:ours?)?/);
  if (hourMatch) return parseInt(hourMatch[1]);

  const minMatch = lower.match(/every\s+(\d+)\s*m(?:inutes?)?/);
  if (minMatch) return parseInt(minMatch[1]) / 60;

  // Default to 6 hours
  return 6;
}

// ─── Status ───

/**
 * Get the current reflector status.
 *
 * @param {string} rootDir - Repository root
 * @returns {object} { config, lastRun, history }
 */
function getStatus(rootDir) {
  const config = loadConfig(rootDir);
  const history = loadHistory(rootDir);
  const lastRun = history.runs.length > 0 ? history.runs[history.runs.length - 1] : null;

  return {
    config,
    lastRun,
    totalRuns: history.runs.length,
    recentRuns: history.runs.slice(-5).reverse(),
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// ── EXPORTS ─────────────────────────────────────────────────────────────────
// ═══════════════════════════════════════════════════════════════════════════════

module.exports = {
  // Engine
  scanDirectory,
  evaluateFile,
  takeSnapshot,
  healFile,
  reflect,
  formatReport,
  formatPRBody,
  generateCollectiveWhisper,
  DEFAULT_CONFIG,
  // Multi-repo
  multiSnapshot,
  compareDimensions,
  detectDrift,
  unifiedHeal,
  multiReflect,
  formatMultiReport,
  formatMultiPRBody,
  generateMultiWhisper,
  extractFunctionSignatures,
  extractFunctionBody,
  codeSimilarity,
  // Orchestrator
  orchestrate,
  formatOrchestration,
  // Scheduler
  DEFAULT_SCHEDULE_CONFIG,
  loadConfig,
  saveConfig,
  loadHistory,
  recordRun,
  runReflector,
  startScheduler,
  parseCronInterval,
  getStatus,
  getConfigPath,
  getHistoryPath,
  getReportPath,
};
