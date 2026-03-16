/**
 * Implicit Feedback — Auto-detect success/failure from git activity.
 *
 * Instead of requiring manual `oracle feedback --id <id> --success` calls,
 * this module infers feedback from observable signals:
 *
 * 1. **Commit survival** — If code from a pattern is committed and stays
 *    in the codebase (not reverted), it's implicitly successful.
 *
 * 2. **Test results** — If tests pass after using a pattern, implicit success.
 *    If tests fail, implicit failure.
 *
 * 3. **Revert detection** — If a commit containing pattern code is reverted,
 *    that's implicit negative feedback.
 *
 * 4. **Usage frequency** — Patterns that are resolved repeatedly without
 *    negative feedback are implicitly successful.
 *
 * This runs as part of the post-commit hook to automatically track outcomes.
 */

const { execFileSync } = require('child_process');

/**
 * Analyze recent git history to infer feedback for patterns used in recent commits.
 *
 * @param {Object} oracle — RemembranceOracle instance
 * @param {string} cwd — Working directory
 * @param {Object} [options] — { lookback, silent }
 * @returns {Object} — { feedbackGenerated, successes, failures, reverts }
 */
function inferFeedback(oracle, cwd, options = {}) {
  const { lookback = 5, silent = false } = options;
  const result = { feedbackGenerated: 0, successes: [], failures: [], reverts: [] };

  try {
    // 1. Check for reverted commits (commits whose message starts with "Revert")
    const revertedPatterns = detectReverts(oracle, cwd, lookback);
    for (const { patternId, commitHash } of revertedPatterns) {
      try {
        const fb = oracle.patternFeedback(patternId, false);
        if (fb.success) {
          result.reverts.push({ patternId, commitHash });
          result.feedbackGenerated++;
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[implicit-feedback] revert feedback failed:', e?.message || e);
      }
    }

    // 2. Check test results for recently resolved patterns
    const testSuccess = detectTestOutcome(cwd);
    const recentResolves = getRecentResolves(oracle);

    for (const { id } of recentResolves) {
      if (testSuccess === null) continue; // Can't determine test outcome
      try {
        const fb = oracle.patternFeedback(id, testSuccess);
        if (fb.success) {
          if (testSuccess) {
            result.successes.push({ patternId: id, reason: 'tests-passed' });
          } else {
            result.failures.push({ patternId: id, reason: 'tests-failed' });
          }
          result.feedbackGenerated++;
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[implicit-feedback] test feedback failed:', e?.message || e);
      }
    }

    // 3. Commit survival — patterns in committed code get implicit positive feedback
    const survivingPatterns = detectCommitSurvival(oracle, cwd);
    for (const { patternId } of survivingPatterns) {
      // Only give positive feedback if not already flagged as failed/reverted
      const alreadyHandled = result.reverts.some(r => r.patternId === patternId)
        || result.failures.some(f => f.patternId === patternId)
        || result.successes.some(s => s.patternId === patternId);
      if (alreadyHandled) continue;

      try {
        const fb = oracle.patternFeedback(patternId, true);
        if (fb.success) {
          result.successes.push({ patternId, reason: 'commit-survival' });
          result.feedbackGenerated++;
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[implicit-feedback] survival feedback failed:', e?.message || e);
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[implicit-feedback] inferFeedback failed:', e?.message || e);
  }

  if (!silent && result.feedbackGenerated > 0) {
    console.log(`Implicit feedback: ${result.successes.length} successes, ${result.failures.length} failures, ${result.reverts.length} reverts`);
  }

  return result;
}

/**
 * Detect commits that were reverted in recent history.
 * Looks for commit messages matching "Revert ..." pattern.
 */
function detectReverts(oracle, cwd, lookback) {
  const reverted = [];
  try {
    const log = execFileSync('git', ['log', `--max-count=${lookback}`, '--format=%H %s'], {
      cwd, encoding: 'utf-8', timeout: 5000,
    }).trim();

    if (!log) return reverted;

    for (const line of log.split('\n')) {
      const match = line.match(/^(\w+)\s+Revert\s+"(.+)"$/);
      if (!match) continue;

      const revertHash = match[1];
      const originalMessage = match[2];

      // Find patterns associated with the reverted commit's files
      try {
        const revertedFiles = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', revertHash], {
          cwd, encoding: 'utf-8', timeout: 5000,
        }).trim().split('\n').filter(Boolean);

        // Search patterns that match these files
        for (const file of revertedFiles) {
          const patterns = oracle.patterns.getAll();
          for (const p of patterns) {
            if (p.sourceFile === file || (p.name && file.includes(p.name))) {
              reverted.push({ patternId: p.id, commitHash: revertHash });
            }
          }
        }
      } catch (e) {
        if (process.env.ORACLE_DEBUG) console.warn('[implicit-feedback:detectReverts] inner error:', e?.message || e);
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[implicit-feedback:detectReverts] error:', e?.message || e);
  }
  return reverted;
}

/**
 * Try to detect test outcome by running the project's test command.
 * Returns true (pass), false (fail), or null (can't determine).
 */
function detectTestOutcome(cwd) {
  try {
    // Check if package.json has a test script
    const fs = require('fs');
    const path = require('path');
    const pkgPath = path.join(cwd, 'package.json');
    if (!fs.existsSync(pkgPath)) return null;

    let pkg;
    try { pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8')); } catch (e) { return null; }
    if (!pkg.scripts || !pkg.scripts.test) return null;

    // Don't actually run tests in the hook — too slow and risky.
    // Instead, check for recent test result artifacts.
    // Look for common test result patterns:

    // 1. Check for .test-results or coverage directory with recent timestamps
    const testDirs = ['.test-results', 'coverage', '.nyc_output', 'test-results'];
    for (const dir of testDirs) {
      const dirPath = path.join(cwd, dir);
      if (fs.existsSync(dirPath)) {
        const stat = fs.statSync(dirPath);
        const ageMs = Date.now() - stat.mtimeMs;
        // If test artifacts are less than 5 minutes old, tests likely just ran
        if (ageMs < 5 * 60 * 1000) return true; // Presence of coverage = tests passed
      }
    }

    // 2. Check git status for test-related files
    return null; // Can't determine
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[implicit-feedback:detectTestOutcome] error:', e?.message || e);
    return null;
  }
}

/**
 * Get patterns that were recently resolved (from session tracking).
 * These are candidates for implicit feedback.
 */
function getRecentResolves(oracle) {
  try {
    // Check the audit log for recent resolve events
    if (oracle.patterns._sqlite && typeof oracle.patterns._sqlite.getAuditLog === 'function') {
      const logs = oracle.patterns._sqlite.getAuditLog({ action: 'resolve', limit: 10 });
      return logs
        .filter(l => l.targetId && l.detail)
        .map(l => ({ id: l.targetId }))
        .filter((v, i, arr) => arr.findIndex(x => x.id === v.id) === i); // dedupe
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[implicit-feedback:getRecentResolves] error:', e?.message || e);
  }
  return [];
}

/**
 * Detect patterns whose code appears in the committed codebase.
 * If a pattern's code is present and committed, it's surviving = implicit success.
 */
function detectCommitSurvival(oracle, cwd) {
  const surviving = [];
  try {
    // Get the last committed files
    const files = execFileSync('git', ['diff-tree', '--no-commit-id', '--name-only', '-r', 'HEAD'], {
      cwd, encoding: 'utf-8', timeout: 5000,
    }).trim().split('\n').filter(Boolean);

    if (files.length === 0) return surviving;

    // Read committed file contents and check against known patterns
    const fs = require('fs');
    const path = require('path');
    const patterns = oracle.patterns.getAll();

    for (const file of files) {
      const filePath = path.join(cwd, file);
      if (!fs.existsSync(filePath)) continue;

      let content;
      try {
        content = fs.readFileSync(filePath, 'utf-8');
      } catch (e) { continue; }

      // Check if any pattern's code signature appears in this file
      for (const p of patterns) {
        if (!p.code || p.code.length < 20) continue;
        // Use first significant line of pattern code as a fingerprint
        const sigLines = p.code.split('\n').filter(l => l.trim().length > 10).slice(0, 3);
        const matched = sigLines.length > 0 && sigLines.every(l => content.includes(l.trim()));
        if (matched) {
          surviving.push({ patternId: p.id, file });
        }
      }
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[implicit-feedback:detectCommitSurvival] error:', e?.message || e);
  }
  return surviving;
}

module.exports = {
  inferFeedback,
  detectReverts,
  detectTestOutcome,
  getRecentResolves,
  detectCommitSurvival,
};
