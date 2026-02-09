/**
 * Remembrance Self-Reflector — Safety & Revert Mechanism
 *
 * Axiom 3: No harm. Every healing must be reversible.
 *
 * 1. Backup Branch — snapshot current state before any healing
 * 2. Dry-Run Mode — simulate healing without writing files or committing
 * 3. Approval Gate — require explicit approval before auto-merge
 * 4. Rollback — revert to backup if coherence drops after healing
 *
 * Uses only Node.js built-ins — no external dependencies.
 */

const { readFileSync, existsSync, copyFileSync } = require('fs');
const { join, relative } = require('path');
const { reflect, takeSnapshot, evaluateFile } = require('./engine');
const { git, getCurrentBranch, isCleanWorkingTree, generateBranchName } = require('./github');
const { ensureDir, loadJSON, saveJSON, trimArray } = require('./utils');

// ─── Backup State ───

/**
 * Get the path to the backup manifest file.
 */
function getBackupManifestPath(rootDir) {
  return join(rootDir, '.remembrance', 'backup-manifest.json');
}

/**
 * Create a backup of the current state before healing.
 *
 * Two strategies:
 *   - 'git-branch': Create a git branch at current HEAD (lightweight, requires git)
 *   - 'file-copy': Copy files to .remembrance/backups/ (works without git)
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { strategy, filePaths }
 * @returns {object} Backup manifest
 */
function createBackup(rootDir, options = {}) {
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
    // Create a lightweight backup branch at current HEAD
    const currentBranch = getCurrentBranch(rootDir);
    const backupBranch = `remembrance/backup-${Date.now()}`;

    try {
      git(`branch ${backupBranch}`, rootDir);
      manifest.branch = backupBranch;
      manifest.baseBranch = currentBranch;
      manifest.headCommit = git('rev-parse HEAD', rootDir);
    } catch (err) {
      // Fall back to file-copy if git branch fails
      manifest.strategy = 'file-copy';
      manifest.branchError = err.message;
      return createFileCopyBackup(rootDir, filePaths, manifest);
    }
  } else {
    return createFileCopyBackup(rootDir, filePaths, manifest);
  }

  // Save manifest
  saveBackupManifest(rootDir, manifest);
  return manifest;
}

/**
 * Create file-copy backup (fallback when git-branch not available).
 */
function createFileCopyBackup(rootDir, filePaths, manifest) {
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
 * Save backup manifest to disk.
 */
function saveBackupManifest(rootDir, manifest) {
  const manifests = loadBackupManifests(rootDir);
  manifests.push(manifest);
  trimArray(manifests, 20);
  saveJSON(getBackupManifestPath(rootDir), manifests);
}

/**
 * Load all backup manifests.
 */
function loadBackupManifests(rootDir) {
  return loadJSON(getBackupManifestPath(rootDir), []);
}

/**
 * Get the most recent backup manifest.
 */
function getLatestBackup(rootDir) {
  const manifests = loadBackupManifests(rootDir);
  return manifests.length > 0 ? manifests[manifests.length - 1] : null;
}

// ─── Dry-Run Mode ───

/**
 * Run the reflector in dry-run mode.
 * Simulates healing without writing files or creating branches.
 * Returns what WOULD happen if healing were applied.
 *
 * @param {string} rootDir - Repository root
 * @param {object} config - Configuration overrides
 * @returns {object} Dry-run report with projected changes
 */
function dryRun(rootDir, config = {}) {
  const startTime = Date.now();

  // Run the full reflect pipeline
  const report = reflect(rootDir, config);

  // Build a projection of what would change
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
 * Estimate post-heal average coherence from a report.
 */
function estimatePostHealCoherence(report) {
  if (!report.healings || report.healings.length === 0) {
    return report.snapshot.avgCoherence;
  }

  const totalFiles = report.snapshot.totalFiles || report.summary.filesScanned;
  if (totalFiles === 0) return 0;

  // Sum of all file coherences, replacing healed files with new values
  const healedPaths = new Set(report.healings.map(h => h.path));
  const totalImprovement = report.healings.reduce((s, h) => s + h.improvement, 0);

  // Approximate: current avg * total + total improvement / total
  return Math.min(
    1,
    report.snapshot.avgCoherence + (totalImprovement / totalFiles)
  );
}

// ─── Approval Gate ───

/**
 * Check if a healing run requires approval before merging.
 *
 * Approval is required when:
 * - requireApproval is true in config
 * - autoMerge is true but coherence is below autoMergeThreshold
 * - The run modifies more than approvalFileThreshold files
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

  // If approval not required and no auto-merge, always approve
  if (!requireApproval && !autoMerge) {
    return { approved: true, reason: 'No approval gate configured', requiresManualReview: false };
  }

  const filesHealed = report.summary ? report.summary.filesHealed : 0;
  const avgCoherence = report.snapshot ? report.snapshot.avgCoherence : 0;

  // Check if too many files were changed
  if (filesHealed > approvalFileThreshold) {
    return {
      approved: false,
      reason: `${filesHealed} files would be modified (threshold: ${approvalFileThreshold}). Manual review required.`,
      requiresManualReview: true,
      filesHealed,
      threshold: approvalFileThreshold,
    };
  }

  // Check if coherence is high enough for auto-merge
  if (autoMerge && avgCoherence < autoMergeThreshold) {
    return {
      approved: false,
      reason: `Avg coherence ${avgCoherence.toFixed(3)} is below auto-merge threshold ${autoMergeThreshold}. Manual review required.`,
      requiresManualReview: true,
      avgCoherence,
      autoMergeThreshold,
    };
  }

  // Explicit approval required
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
  const approvalPath = join(rootDir, '.remembrance', 'approvals.json');
  const approvals = loadJSON(approvalPath, []);

  approvals.push({
    runId,
    decision, // 'approved' | 'rejected'
    timestamp: new Date().toISOString(),
  });

  trimArray(approvals, 50);
  saveJSON(approvalPath, approvals);
  return { runId, decision, timestamp: new Date().toISOString() };
}

// ─── Rollback ───

/**
 * Rollback to a previous backup state.
 *
 * For git-branch backups: checkout the backup branch or reset to backup commit.
 * For file-copy backups: restore files from the backup directory.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { backupId, verify }
 * @returns {object} Rollback result
 */
function rollback(rootDir, options = {}) {
  const { backupId, verify = true } = options;

  // Find the backup
  const manifests = loadBackupManifests(rootDir);
  const backup = backupId
    ? manifests.find(m => m.id === backupId)
    : manifests[manifests.length - 1]; // Latest

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
      // Take a pre-rollback snapshot for comparison
      let preRollbackCoherence;
      if (verify) {
        const snap = takeSnapshot(rootDir);
        preRollbackCoherence = snap.aggregate.avgCoherence;
      }

      // Reset to the backup commit
      const currentBranch = getCurrentBranch(rootDir);
      if (backup.headCommit) {
        git(`reset --hard ${backup.headCommit}`, rootDir);
      } else {
        // Merge from backup branch
        git(`merge ${backup.branch} --no-commit`, rootDir);
      }

      result.success = true;
      result.restoredBranch = backup.branch;
      result.previousBranch = currentBranch;

      // Verify coherence after rollback
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
    // Restore files from backup directory
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

    // Verify coherence after rollback
    if (verify && result.success) {
      const postSnap = takeSnapshot(rootDir);
      result.coherenceAfter = postSnap.aggregate.avgCoherence;
    }
  } else {
    result.success = false;
    result.error = 'Unknown backup strategy or missing backup data';
  }

  // Record the rollback in history
  recordRollback(rootDir, result);

  return result;
}

/**
 * Record a rollback event.
 */
function recordRollback(rootDir, rollbackResult) {
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
  return loadJSON(join(rootDir, '.remembrance', 'rollbacks.json'), []);
}

// ─── Coherence Guard ───

/**
 * Check if coherence dropped after a healing run.
 * If it dropped, recommend rollback.
 *
 * @param {string} rootDir - Repository root
 * @param {object} preHealSnapshot - Snapshot taken before healing
 * @param {object} [postHealSnapshot] - Optional post-heal snapshot (avoids redundant scan)
 * @returns {object} { dropped, delta, recommendation }
 */
function coherenceGuard(rootDir, preHealSnapshot, postHealSnapshot) {
  const postSnap = postHealSnapshot || takeSnapshot(rootDir);

  const preAvg = preHealSnapshot.aggregate
    ? preHealSnapshot.aggregate.avgCoherence
    : preHealSnapshot.avgCoherence || 0;
  const postAvg = postSnap.aggregate.avgCoherence;
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

// ─── Safe Reflect Pipeline ───

/**
 * Run the reflector with full safety protections:
 * 1. Create backup before any changes
 * 2. Run healing
 * 3. Check coherence guard
 * 4. Check approval gate
 * 5. Auto-rollback if coherence dropped
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

  // Step 0: Dry-run mode
  if (dryRunMode) {
    result.dryRun = dryRun(rootDir, reflectConfig);
    result.durationMs = Date.now() - startTime;
    return result;
  }

  // Step 1: Take pre-heal snapshot for coherence guard
  const preSnapshot = takeSnapshot(rootDir, reflectConfig);
  result.safety.preCoherence = preSnapshot.aggregate.avgCoherence;

  // Step 2: Create backup
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

  // Step 3: Run the reflector (pass preSnapshot to avoid redundant scan)
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

  // Step 4: Check approval gate
  result.safety.approval = checkApproval(report, {
    requireApproval,
    approvalFileThreshold,
    autoMerge: reflectConfig.autoMerge,
    autoMergeThreshold: reflectConfig.autoMergeThreshold,
  });

  // Step 5: Coherence guard — check if coherence dropped
  //   reflect() doesn't write files to disk, so re-scanning would show no change.
  //   Instead, build a synthetic post-snapshot from the report's estimated improvement.
  if (report.healedFiles && report.healedFiles.length > 0) {
    const estimatedPostCoherence = estimatePostHealCoherence(report);
    const syntheticPostSnap = {
      aggregate: { avgCoherence: estimatedPostCoherence },
    };
    result.safety.coherenceGuard = coherenceGuard(rootDir, preSnapshot, syntheticPostSnap);

    // Auto-rollback if coherence dropped and autoRollback is enabled
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
  // Backup
  createBackup,
  loadBackupManifests,
  getLatestBackup,
  getBackupManifestPath,

  // Dry-run
  dryRun,
  estimatePostHealCoherence,

  // Approval
  checkApproval,
  recordApproval,

  // Rollback
  rollback,
  loadRollbacks,
  coherenceGuard,

  // Safe pipeline
  safeReflect,
};
