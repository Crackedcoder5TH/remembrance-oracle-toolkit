/**
 * Remembrance Self-Reflector Engine
 *
 * The core intelligence that:
 * 1. Scans a codebase for source files
 * 2. Evaluates each file's coherence via the SERF multi-dimensional scorer
 * 3. Heals files below the coherence threshold using SERF reflection
 * 4. Produces a structured report of all changes with whisper explanations
 *
 * This is the heart of the self-healing cathedral — the code that
 * observes itself and refines what it finds wanting.
 */

const { readFileSync, readdirSync, statSync, existsSync } = require('fs');
const { join, extname, relative } = require('path');
const { observeCoherence, reflectionLoop, generateCandidates } = require('../core/reflection');
const { detectLanguage } = require('../core/coherency');
const { covenantCheck } = require('../core/covenant');
const { hookBeforeHeal, recordPatternHookUsage } = require('./patternHook');

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

  // Run SERF reflection loop
  const result = reflectionLoop(code, {
    language,
    maxLoops: opts.maxSerfLoops,
    targetCoherence: opts.targetCoherence,
  });

  const changed = result.code !== code;

  return {
    path: filePath,
    relativePath: config.rootDir ? relative(config.rootDir, filePath) : filePath,
    language,
    original: {
      code,
      coherence: result.serf.I_AM,
    },
    healed: {
      code: result.code,
      coherence: result.coherence,
    },
    improvement: result.serf.improvement,
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

    const healing = healFile(file.path, { ...opts, rootDir });
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
  lines.push('╔══════════════════════════════════════════════════════╗');
  lines.push('║       Remembrance Self-Reflector Report             ║');
  lines.push('╚══════════════════════════════════════════════════════╝');
  lines.push('');
  lines.push(`Timestamp: ${report.timestamp}`);
  lines.push(`Root: ${report.rootDir}`);
  lines.push('');

  // Snapshot summary
  lines.push('── Codebase Snapshot ──');
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
    lines.push('── Dimension Averages ──');
    for (const [dim, val] of Object.entries(report.snapshot.dimensionAverages)) {
      const bar = '\u2588'.repeat(Math.round(val * 20));
      const faded = '\u2591'.repeat(20 - Math.round(val * 20));
      lines.push(`  ${dim.padEnd(14)} ${bar}${faded} ${val.toFixed(3)}`);
    }
    lines.push('');
  }

  // Healings
  lines.push('── Healing Results ──');
  lines.push(`  Files below threshold: ${report.summary.filesBelowThreshold}`);
  lines.push(`  Files healed: ${report.summary.filesHealed}`);
  lines.push(`  Total improvement: +${report.summary.totalImprovement.toFixed(3)}`);
  lines.push(`  Avg improvement: +${report.summary.avgImprovement.toFixed(3)}`);
  lines.push('');

  if (report.healings.length > 0) {
    for (const h of report.healings) {
      lines.push(`  ${h.path}`);
      lines.push(`    ${h.originalCoherence.toFixed(3)} → ${h.healedCoherence.toFixed(3)} (+${h.improvement.toFixed(3)}) [${h.loops} loop(s)]`);
      lines.push(`    Whisper: "${h.whisper}"`);
      lines.push('');
    }
  }

  // Collective whisper
  lines.push('── Collective Whisper ──');
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
      lines.push(`- **Coherence**: ${h.originalCoherence.toFixed(3)} → ${h.healedCoherence.toFixed(3)} (+${h.improvement.toFixed(3)})`);
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

module.exports = {
  scanDirectory,
  evaluateFile,
  takeSnapshot,
  healFile,
  reflect,
  formatReport,
  formatPRBody,
  generateCollectiveWhisper,
  DEFAULT_CONFIG,
};
