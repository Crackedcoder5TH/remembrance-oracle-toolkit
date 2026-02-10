/**
 * Remembrance Self-Reflector — Full Workflow Orchestrator
 *
 * Sequences the complete reflector pipeline in order:
 *
 *   1. Load Config   — central config → engine config
 *   2. Snapshot       — scan codebase, evaluate all files
 *   3. Deep Score     — cyclomatic complexity, security, nesting, quality
 *   4. Heal           — SERF loop on files below threshold
 *   5. Safety Check   — coherence guard, approval gate
 *   6. Generate Whisper — collective health summary
 *   7. Create PR      — branch, commit, push, open PR (if configured)
 *   8. Record History — save run record to v2 history + log
 *
 * Supports dry-run mode (steps 1-6 only, no write/PR).
 * Each step is individually tracked for timing and error handling.
 *
 * Uses only Node.js built-ins.
 */

const { takeSnapshot, reflect, generateCollectiveWhisper } = require('./engine');
const { repoScore } = require('./scoring');
const { safeReflect, estimatePostHealCoherence, dryRun, createBackup } = require('./safety');
const { toEngineConfig, validateConfig } = require('./config');
const { resolveConfig } = require('./modes');
const { saveRunRecord, appendLog, computeStats } = require('./history');
const { createHealingBranch } = require('./github');
const { notifyFromReport } = require('./notifications');

/**
 * Run the full orchestrated workflow.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - Overrides for config, dry-run mode, etc.
 * @returns {object} Complete orchestration result with per-step details
 */
function orchestrate(rootDir, options = {}) {
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

  // ── Step 1: Load & Validate Config (via modes.resolveConfig) ──
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

  // ── Step 2: Take Snapshot ──
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

  // ── Step 3: Deep Score ──
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

  // ── Step 4: Heal (via safety pipeline) ──
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

  // ── Step 5: Safety Check Summary ──
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

  // ── Step 6: Generate Whisper ──
  const step6Start = Date.now();
  let whisper;
  try {
    if (options.dryRun) {
      whisper = healResult.summary?.message || healResult.collectiveWhisper || 'Dry-run complete. No changes applied.';
    } else {
      whisper = healResult.report?.collectiveWhisper || 'No healing required — codebase is coherent.';
    }
    // Enrich with deep score health if available
    if (deepScoreResult) {
      whisper = `[${deepScoreResult.health}] ${whisper}`;
      const findings = Array.isArray(deepScoreResult.securityFindings) ? deepScoreResult.securityFindings : [];
      if (findings.length > 0) {
        whisper += ` (${findings.length} security finding(s))`;
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

  // ── Step 7: Create PR (if configured and not dry-run) ──
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

  // ── Step 7b: Send Notification (fire-and-forget, async) ──
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

  // ── Step 8: Record History ──
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

  // ── Assemble final result ──
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

  lines.push('Remembrance Self-Reflector — Orchestration Report');
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

module.exports = {
  orchestrate,
  formatOrchestration,
};
