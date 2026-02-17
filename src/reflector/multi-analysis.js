/**
 * Remembrance Reflector BOT — Multi: Multi-Repo Analysis
 *
 * Exports:
 *   multiSnapshot, compareDimensions, extractFunctionSignatures,
 *   extractFunctionBody, codeSimilarity, detectDrift, unifiedHeal,
 *   multiReflect, formatMultiReport, formatMultiPRBody, generateMultiWhisper
 *
 * External requires (./multi-engine) are lazy-loaded inside functions
 * to avoid circular dependencies.
 */

const { readFileSync } = require('fs');
const { join, basename, relative } = require('path');
const { detectLanguage } = require('../core/coherency');

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
  const { DEFAULT_CONFIG, takeSnapshot } = require('./multi-engine');
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
  const { DEFAULT_CONFIG, scanDirectory } = require('./multi-engine');

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
  const { DEFAULT_CONFIG, takeSnapshot, healFile } = require('./multi-engine');
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
  const { DEFAULT_CONFIG } = require('./multi-engine');
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
  lines.push('\u2551       Remembrance Multi-Repo Reflector BOT Report               \u2551');
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

module.exports = {
  multiSnapshot,
  compareDimensions,
  extractFunctionSignatures,
  extractFunctionBody,
  codeSimilarity,
  detectDrift,
  unifiedHeal,
  multiReflect,
  formatMultiReport,
  formatMultiPRBody,
  generateMultiWhisper,
};
