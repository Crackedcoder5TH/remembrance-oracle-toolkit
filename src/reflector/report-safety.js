/**
 * Remembrance Self-Reflector — Safety (Section 8)
 *
 * Extracted from report.js. Provides backup, rollback, dry-run,
 * approval gate, coherence guard, and safe reflect pipeline.
 *
 * Uses lazy requires for ./scoring and ./multi to avoid circular deps.
 */

const { readFileSync, writeFileSync, existsSync, copyFileSync } = require('fs');
const { join, relative, basename } = require('path');

// ─── Lazy Require Helpers (avoid circular deps) ───
const { scoring: _scoring, multi: _multi, github: _github } = require('./report-lazy');

// =====================================================================
// Safety — Backup, Rollback, Dry-Run, Approval
// =====================================================================

function getBackupManifestPath(rootDir) {
  return join(rootDir, '.remembrance', 'backup-manifest.json');
}

/**
 * Save backup manifest to disk.
 */
function saveBackupManifest(rootDir, manifest) {
  const { loadJSON, saveJSON, trimArray } = _scoring();
  const manifests = loadJSON(getBackupManifestPath(rootDir), []);
  manifests.push(manifest);
  trimArray(manifests, 20);
  saveJSON(getBackupManifestPath(rootDir), manifests);
}

/**
 * Load all backup manifests.
 */
function loadBackupManifests(rootDir) {
  const { loadJSON } = _scoring();
  return loadJSON(getBackupManifestPath(rootDir), []);
}

/**
 * Get the most recent backup manifest.
 */
function getLatestBackup(rootDir) {
  const manifests = loadBackupManifests(rootDir);
  return manifests.length > 0 ? manifests[manifests.length - 1] : null;
}

/**
 * Create file-copy backup (fallback when git-branch not available).
 */
function createFileCopyBackup(rootDir, filePaths, manifest) {
  const { ensureDir } = _scoring();
  const backupDir = join(rootDir, '.remembrance', 'backups', manifest.id);
  ensureDir(backupDir);
  manifest.backupDir = backupDir;

  for (const filePath of filePaths) {
    const absPath = filePath.startsWith('/') ? filePath : join(rootDir, filePath);
    if (!existsSync(absPath)) continue;

    const relPath = relative(rootDir, absPath);
    const backupPath = join(backupDir, relPath);
    const parentDir = join(backupDir, ...relPath.split('/').slice(0, -1));
    if (relPath.includes('/')) {
      ensureDir(parentDir);
    }

    try {
      copyFileSync(absPath, backupPath);
      manifest.files.push({
        original: relPath,
        backup: backupPath,
      });
    } catch {
      // Skip unreadable files
    }
  }

  saveBackupManifest(rootDir, manifest);
  return manifest;
}

/**
 * Create a backup of the current state before healing.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { strategy, filePaths }
 * @returns {object} Backup manifest
 */
function createBackup(rootDir, options = {}) {
  const { git, getCurrentBranch } = _github();
  const {
    strategy = 'git-branch',
    filePaths = [],
    label = '',
  } = options;

  const backupId = `backup-${Date.now()}`;
  const timestamp = new Date().toISOString();

  const manifest = {
    id: backupId,
    timestamp,
    strategy,
    rootDir,
    label: label || `Pre-healing backup ${timestamp}`,
    files: [],
  };

  if (strategy === 'git-branch') {
    const currentBranch = getCurrentBranch(rootDir);
    const backupBranch = `remembrance/backup-${Date.now()}`;

    try {
      git(`branch ${backupBranch}`, rootDir);
      manifest.branch = backupBranch;
      manifest.baseBranch = currentBranch;
      manifest.headCommit = git('rev-parse HEAD', rootDir);
    } catch (err) {
      manifest.strategy = 'file-copy';
      manifest.branchError = err.message;
      return createFileCopyBackup(rootDir, filePaths, manifest);
    }
  } else {
    return createFileCopyBackup(rootDir, filePaths, manifest);
  }

  saveBackupManifest(rootDir, manifest);
  return manifest;
}

/**
 * Estimate post-heal average coherence from a report.
 */
function estimatePostHealCoherence(report) {
  if (!report.healings || report.healings.length === 0) {
    return report.snapshot.avgCoherence;
  }

  const totalFiles = report.snapshot.totalFiles || report.summary.filesScanned;
  if (totalFiles === 0) return 0;

  const totalImprovement = report.healings.reduce((s, h) => s + h.improvement, 0);

  return Math.min(
    1,
    report.snapshot.avgCoherence + (totalImprovement / totalFiles)
  );
}

/**
 * Run the reflector in dry-run mode.
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration overrides
 * @returns {object} Dry-run report with projected changes
 */
function dryRun(rootDir, config = {}) {
  const { reflect } = _multi();
  const startTime = Date.now();

  const report = reflect(rootDir, config);

  const projection = {
    timestamp: new Date().toISOString(),
    mode: 'dry-run',
    rootDir,
    wouldHeal: report.healedFiles.length,
    wouldChange: report.healedFiles.map(f => ({
      path: f.path,
      currentSize: f.code.length,
    })),
    projectedImprovement: report.summary.avgImprovement,
    projectedCoherence: {
      before: report.snapshot.avgCoherence,
      after: estimatePostHealCoherence(report),
    },
    healings: report.healings.map(h => ({
      path: h.path,
      language: h.language,
      currentCoherence: h.originalCoherence,
      projectedCoherence: h.healedCoherence,
      improvement: h.improvement,
      whisper: h.whisper,
      strategy: h.healingSummary,
    })),
    collectiveWhisper: report.collectiveWhisper,
    summary: {
      filesScanned: report.summary.filesScanned,
      filesBelowThreshold: report.summary.filesBelowThreshold,
      wouldHeal: report.summary.filesHealed,
      projectedAvgImprovement: report.summary.avgImprovement,
      autoMergeRecommended: report.summary.autoMergeRecommended,
    },
    durationMs: Date.now() - startTime,
    warning: report.healedFiles.length > 0
      ? 'This is a dry-run. No files were modified. Run without --dry-run to apply changes.'
      : 'No files need healing. The codebase is coherent.',
  };

  return projection;
}

/**
 * Check if a healing run requires approval before merging.
 *
 * @param {object} report - Reflector report
 * @param {object} config - Safety configuration
 * @returns {object} { approved, reason, requiresManualReview }
 */
function checkApproval(report, config = {}) {
  const {
    requireApproval = false,
    autoMergeThreshold = 0.9,
    approvalFileThreshold = 10,
    autoMerge = false,
  } = config;

  if (!requireApproval && !autoMerge) {
    return { approved: true, reason: 'No approval gate configured', requiresManualReview: false };
  }

  const filesHealed = report.summary ? report.summary.filesHealed : 0;
  const avgCoherence = report.snapshot ? report.snapshot.avgCoherence : 0;

  if (filesHealed > approvalFileThreshold) {
    return {
      approved: false,
      reason: `${filesHealed} files would be modified (threshold: ${approvalFileThreshold}). Manual review required.`,
      requiresManualReview: true,
      filesHealed,
      threshold: approvalFileThreshold,
    };
  }

  if (autoMerge && avgCoherence < autoMergeThreshold) {
    return {
      approved: false,
      reason: `Avg coherence ${avgCoherence.toFixed(3)} is below auto-merge threshold ${autoMergeThreshold}. Manual review required.`,
      requiresManualReview: true,
      avgCoherence,
      autoMergeThreshold,
    };
  }

  if (requireApproval) {
    return {
      approved: false,
      reason: 'Explicit approval required (requireApproval is set). Review the dry-run report and approve manually.',
      requiresManualReview: true,
    };
  }

  return { approved: true, reason: 'All safety checks passed', requiresManualReview: false };
}

/**
 * Record an approval decision for a run.
 */
function recordApproval(rootDir, runId, decision) {
  const { loadJSON, saveJSON, trimArray } = _scoring();
  const approvalPath = join(rootDir, '.remembrance', 'approvals.json');
  const approvals = loadJSON(approvalPath, []);

  approvals.push({
    runId,
    decision,
    timestamp: new Date().toISOString(),
  });

  trimArray(approvals, 50);
  saveJSON(approvalPath, approvals);
  return { runId, decision, timestamp: new Date().toISOString() };
}

/**
 * Record a rollback event.
 */
function recordRollback(rootDir, rollbackResult) {
  const { loadJSON, saveJSON, trimArray } = _scoring();
  const rollbackPath = join(rootDir, '.remembrance', 'rollbacks.json');
  const rollbacks = loadJSON(rollbackPath, []);
  rollbacks.push(rollbackResult);
  trimArray(rollbacks, 20);
  saveJSON(rollbackPath, rollbacks);
}

/**
 * Load rollback history.
 */
function loadRollbacks(rootDir) {
  const { loadJSON } = _scoring();
  return loadJSON(join(rootDir, '.remembrance', 'rollbacks.json'), []);
}

/**
 * Rollback to a previous backup state.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { backupId, verify }
 * @returns {object} Rollback result
 */
function rollback(rootDir, options = {}) {
  const { git, getCurrentBranch } = _github();
  const { backupId, verify = true } = options;

  const manifests = loadBackupManifests(rootDir);
  const backup = backupId
    ? manifests.find(m => m.id === backupId)
    : manifests[manifests.length - 1];

  if (!backup) {
    return { success: false, error: 'No backup found to rollback to' };
  }

  const result = {
    backupId: backup.id,
    timestamp: new Date().toISOString(),
    strategy: backup.strategy,
    filesRestored: 0,
  };

  if (backup.strategy === 'git-branch' && backup.branch) {
    try {
      const { takeSnapshot } = _multi();
      let preRollbackCoherence;
      if (verify) {
        const snap = takeSnapshot(rootDir);
        preRollbackCoherence = snap.aggregate.avgCoherence;
      }

      const currentBranch = getCurrentBranch(rootDir);
      if (backup.headCommit) {
        git(`reset --hard ${backup.headCommit}`, rootDir);
      } else {
        git(`merge ${backup.branch} --no-commit`, rootDir);
      }

      result.success = true;
      result.restoredBranch = backup.branch;
      result.previousBranch = currentBranch;

      if (verify) {
        const postSnap = takeSnapshot(rootDir);
        result.coherenceBefore = preRollbackCoherence;
        result.coherenceAfter = postSnap.aggregate.avgCoherence;
        result.coherenceDelta = Math.round(
          (result.coherenceAfter - result.coherenceBefore) * 1000
        ) / 1000;
      }
    } catch (err) {
      result.success = false;
      result.error = `Git rollback failed: ${err.message}`;
    }
  } else if (backup.strategy === 'file-copy' && backup.files) {
    for (const file of backup.files) {
      try {
        if (existsSync(file.backup)) {
          const targetPath = join(rootDir, file.original);
          copyFileSync(file.backup, targetPath);
          result.filesRestored++;
        }
      } catch {
        // Skip files that can't be restored
      }
    }
    result.success = result.filesRestored > 0 || backup.files.length === 0;

    if (verify && result.success) {
      const { takeSnapshot } = _multi();
      const postSnap = takeSnapshot(rootDir);
      result.coherenceAfter = postSnap.aggregate.avgCoherence;
    }
  } else {
    result.success = false;
    result.error = 'Unknown backup strategy or missing backup data';
  }

  recordRollback(rootDir, result);

  return result;
}

/**
 * Check if coherence dropped after a healing run.
 *
 * @param {string} rootDir - Repository root
 * @param {object} preHealSnapshot - Snapshot taken before healing
 * @param {object} [postHealSnapshot] - Optional post-heal snapshot
 * @returns {object} { dropped, delta, recommendation }
 */
function coherenceGuard(rootDir, preHealSnapshot, postHealSnapshot) {
  const postSnap = postHealSnapshot || (() => {
    const { takeSnapshot } = _multi();
    return takeSnapshot(rootDir);
  })();

  const preAvg = preHealSnapshot.aggregate
    ? preHealSnapshot.aggregate.avgCoherence
    : preHealSnapshot.avgCoherence || 0;
  const postAvg = postSnap.aggregate
    ? postSnap.aggregate.avgCoherence
    : postSnap.avgCoherence || 0;
  const delta = Math.round((postAvg - preAvg) * 1000) / 1000;

  const result = {
    preCoherence: Math.round(preAvg * 1000) / 1000,
    postCoherence: Math.round(postAvg * 1000) / 1000,
    delta,
    dropped: delta < 0,
  };

  if (delta < -0.05) {
    result.severity = 'critical';
    result.recommendation = 'ROLLBACK RECOMMENDED. Coherence dropped significantly. The healing may have introduced issues.';
  } else if (delta < 0) {
    result.severity = 'warning';
    result.recommendation = 'Coherence dropped slightly. Review the changes carefully before merging.';
  } else if (delta === 0) {
    result.severity = 'neutral';
    result.recommendation = 'No coherence change. The healing had no measurable effect.';
  } else {
    result.severity = 'positive';
    result.recommendation = 'Coherence improved. Safe to proceed.';
  }

  return result;
}

/**
 * Run the reflector with full safety protections.
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration overrides
 * @returns {object} Safe reflector result
 */
function safeReflect(rootDir, config = {}) {
  const {
    dryRunMode = false,
    requireApproval = false,
    autoRollback = true,
    approvalFileThreshold = 10,
    ...reflectConfig
  } = config;

  const startTime = Date.now();
  const result = {
    timestamp: new Date().toISOString(),
    mode: dryRunMode ? 'dry-run' : 'live',
    safety: {},
  };

  if (dryRunMode) {
    result.dryRun = dryRun(rootDir, reflectConfig);
    result.durationMs = Date.now() - startTime;
    return result;
  }

  const { reflect, takeSnapshot } = _multi();

  const preSnapshot = takeSnapshot(rootDir, reflectConfig);
  result.safety.preCoherence = preSnapshot.aggregate.avgCoherence;

  try {
    const filePaths = preSnapshot.files
      .filter(f => !f.error)
      .map(f => f.path);
    result.safety.backup = createBackup(rootDir, {
      strategy: 'git-branch',
      filePaths,
      label: `Pre-healing backup (avg coherence: ${preSnapshot.aggregate.avgCoherence.toFixed(3)})`,
    });
  } catch (err) {
    result.safety.backup = { error: err.message };
  }

  const report = reflect(rootDir, { ...reflectConfig, _preSnapshot: preSnapshot });
  result.report = {
    filesScanned: report.summary.filesScanned,
    filesBelowThreshold: report.summary.filesBelowThreshold,
    filesHealed: report.summary.filesHealed,
    avgImprovement: report.summary.avgImprovement,
    autoMergeRecommended: report.summary.autoMergeRecommended,
    collectiveWhisper: report.collectiveWhisper.message,
  };
  result.healedFiles = report.healedFiles;

  result.safety.approval = checkApproval(report, {
    requireApproval,
    approvalFileThreshold,
    autoMerge: reflectConfig.autoMerge,
    autoMergeThreshold: reflectConfig.autoMergeThreshold,
  });

  if (report.healedFiles && report.healedFiles.length > 0) {
    const estimatedPostCoherence = estimatePostHealCoherence(report);
    const syntheticPostSnap = {
      aggregate: { avgCoherence: estimatedPostCoherence },
    };
    result.safety.coherenceGuard = coherenceGuard(rootDir, preSnapshot, syntheticPostSnap);

    if (autoRollback && result.safety.coherenceGuard.dropped && result.safety.coherenceGuard.severity === 'critical') {
      result.safety.autoRolledBack = true;
      result.safety.rollbackResult = rollback(rootDir, { verify: true });
      result.safety.rollbackReason = result.safety.coherenceGuard.recommendation;
    }
  }

  result.durationMs = Date.now() - startTime;
  return result;
}

module.exports = {
  getBackupManifestPath,
  saveBackupManifest,
  loadBackupManifests,
  getLatestBackup,
  createFileCopyBackup,
  createBackup,
  estimatePostHealCoherence,
  dryRun,
  checkApproval,
  recordApproval,
  recordRollback,
  loadRollbacks,
  rollback,
  coherenceGuard,
  safeReflect,
};
