/**
 * Auto-Submit Module — Automatic pattern submission after commits and tests.
 *
 * Orchestrates the full harvest→promote→sync→share pipeline so patterns
 * never go unsubmitted. Designed to run as a post-commit hook, post-test
 * hook, or standalone.
 *
 * Usage:
 *   // After a commit (git hook)
 *   autoSubmit(oracle, process.cwd());
 *
 *   // After tests pass (CI or manual)
 *   autoSubmit(oracle, process.cwd(), { syncPersonal: true, shareCommunity: true });
 *
 *   // CLI
 *   oracle auto-submit [--sync] [--share] [--dry-run]
 */

const path = require('path');

/**
 * Run the full auto-submission pipeline:
 *   1. Harvest patterns from the current repo (includes auto-seed)
 *   2. Auto-promote any candidates that have test code
 *   3. Sync to personal store (if enabled)
 *   4. Share to community store (if enabled and coherency >= 0.7)
 *
 * @param {object} oracle — RemembranceOracle instance
 * @param {string} baseDir — Directory to harvest from
 * @param {object} options
 * @param {boolean} options.syncPersonal — Sync to personal store (default: true)
 * @param {boolean} options.shareCommunity — Share to community store (default: false)
 * @param {boolean} options.dryRun — Preview without changes (default: false)
 * @param {boolean} options.silent — Suppress output (default: false)
 * @param {string} options.language — Language filter
 * @returns {{ harvest, promoted, synced, shared, errors }}
 */
function autoSubmit(oracle, baseDir, options = {}) {
  const {
    syncPersonal = true,
    shareCommunity = false,
    dryRun = false,
    silent = false,
    language,
  } = options;

  const report = {
    harvest: { registered: 0, skipped: 0, failed: 0, discovered: 0 },
    promoted: 0,
    synced: false,
    shared: false,
    errors: [],
  };

  const log = silent ? () => {} : (msg) => console.log(`[auto-submit] ${msg}`);

  // Step 1: Harvest patterns (auto-seed + standalone function extraction)
  try {
    const { harvest } = require('./harvest');
    const harvestResult = harvest(oracle, baseDir, {
      language,
      dryRun,
      splitMode: 'file',
    });
    report.harvest = {
      registered: harvestResult.registered,
      skipped: harvestResult.skipped,
      failed: harvestResult.failed,
      discovered: harvestResult.harvested,
    };
    if (harvestResult.registered > 0) {
      log(`Harvested ${harvestResult.registered} new pattern(s)`);
    }
  } catch (e) {
    report.errors.push(`harvest: ${e.message}`);
  }

  if (dryRun) {
    log('Dry run — skipping promote/sync/share');
    return report;
  }

  // Step 2: Auto-promote candidates with test code
  try {
    if (typeof oracle.autoPromote === 'function') {
      const promoted = oracle.autoPromote();
      report.promoted = promoted.promoted || 0;
      if (report.promoted > 0) {
        log(`Promoted ${report.promoted} candidate(s) to proven`);
      }
    }
  } catch (e) {
    report.errors.push(`promote: ${e.message}`);
  }

  // Step 3: Sync to personal store
  if (syncPersonal) {
    try {
      const { syncToGlobal } = require('../core/persistence');
      const sqliteStore = oracle.store?.getSQLiteStore?.();
      if (sqliteStore) {
        const syncResult = syncToGlobal(sqliteStore, { minCoherency: 0.6 });
        report.synced = true;
        if (!silent && syncResult?.synced > 0) {
          log(`Synced ${syncResult.synced} pattern(s) to personal store`);
        }
      }
    } catch (e) {
      report.errors.push(`sync: ${e.message}`);
    }
  }

  // Step 4: Share to community store (only high-quality patterns)
  if (shareCommunity) {
    try {
      const { shareToCommunity } = require('../core/persistence');
      const sqliteStore = oracle.store?.getSQLiteStore?.();
      if (sqliteStore) {
        const shareResult = shareToCommunity(sqliteStore, { minCoherency: 0.7 });
        report.shared = true;
        if (!silent && shareResult?.shared > 0) {
          log(`Shared ${shareResult.shared} pattern(s) to community store`);
        }
      }
    } catch (e) {
      report.errors.push(`share: ${e.message}`);
    }
  }

  // Emit event for lifecycle engine
  try {
    oracle._emit({
      type: 'auto_submit_complete',
      registered: report.harvest.registered,
      promoted: report.promoted,
      synced: report.synced,
      shared: report.shared,
    });
  } catch {
    // Best-effort event emission
  }

  return report;
}

/**
 * Check if auto-submit should run based on what changed.
 * Returns false if only non-code files changed (docs, config, etc.)
 *
 * @param {string} cwd — Working directory
 * @returns {boolean}
 */
function shouldAutoSubmit(cwd) {
  try {
    const { execSync } = require('child_process');
    const changed = execSync('git diff --name-only HEAD~1 HEAD', {
      cwd,
      encoding: 'utf-8',
      timeout: 5000,
    }).trim();

    if (!changed) return false;

    const codeExts = /\.(js|ts|py|go|rs|jsx|tsx)$/;
    return changed.split('\n').some(f => codeExts.test(f));
  } catch {
    // If git command fails (initial commit, etc.), run anyway
    return true;
  }
}

module.exports = { autoSubmit, shouldAutoSubmit };
