/**
 * Remembrance Reflector BOT — Auto-Commit Safety (Section 5)
 *
 * Extracted from report.js. Provides the auto-commit safety pipeline:
 * safety branches, test gates, merge-if-passing, and commit history.
 *
 * Uses lazy requires for ./scoring and ./multi to avoid circular deps.
 */

const { writeFileSync, existsSync } = require('fs');
const { join, relative } = require('path');
const { execSync } = require('child_process');

// ─── Lazy Require Helpers (avoid circular deps) ───
const { scoring: _scoring, github: _github, history: _history } = require('./report-lazy');

// =====================================================================
// Auto-Commit Safety
// =====================================================================

/**
 * Create a safety branch at current HEAD before any healing begins.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { label }
 * @returns {object} { branch, headCommit, baseBranch, timestamp }
 */
function createSafetyBranch(rootDir, options = {}) {
  const { git, getCurrentBranch } = _github();
  const { label = '' } = options;
  const timestamp = new Date().toISOString();
  const baseBranch = getCurrentBranch(rootDir);
  const headCommit = git('rev-parse HEAD', rootDir);
  const safetyBranch = `remembrance/safety-${Date.now()}`;

  git(`branch ${safetyBranch}`, rootDir);

  return {
    branch: safetyBranch,
    headCommit,
    baseBranch,
    timestamp,
    label: label || `Safety snapshot before healing at ${timestamp}`,
  };
}

/**
 * Run build/test commands on the current branch.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { testCommand, buildCommand, timeoutMs }
 * @returns {object} { passed, steps[] }
 */
function runTestGate(rootDir, options = {}) {
  const { resolveConfig } = _scoring();
  const config = resolveConfig(rootDir, { env: process.env });
  const {
    testCommand = config.autoCommit?.testCommand || 'npm test',
    buildCommand = config.autoCommit?.buildCommand || '',
    timeoutMs = config.autoCommit?.testTimeoutMs || 120000,
  } = options;

  const result = {
    timestamp: new Date().toISOString(),
    passed: true,
    steps: [],
  };

  const commands = [];
  if (buildCommand) commands.push({ name: 'build', command: buildCommand });
  if (testCommand) commands.push({ name: 'test', command: testCommand });

  for (const step of commands) {
    const stepResult = runCommand(step.command, rootDir, timeoutMs);
    stepResult.name = step.name;
    result.steps.push(stepResult);

    if (!stepResult.passed) {
      result.passed = false;
      result.failedStep = step.name;
      result.failReason = stepResult.error || `${step.name} command exited with non-zero code`;
      break;
    }
  }

  return result;
}

/**
 * Execute a single command with timeout, capturing output.
 */
function runCommand(command, cwd, timeoutMs = 120000) {
  const start = Date.now();
  try {
    const stdout = execSync(command, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: timeoutMs,
      env: { ...process.env, CI: 'true', NODE_ENV: 'test' },
    });
    return {
      command,
      passed: true,
      durationMs: Date.now() - start,
      stdout: truncate(stdout, 5000),
    };
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString() : '';
    const stdout = err.stdout ? err.stdout.toString() : '';
    return {
      command,
      passed: false,
      durationMs: Date.now() - start,
      exitCode: err.status || 1,
      stdout: truncate(stdout, 5000),
      stderr: truncate(stderr, 5000),
      error: err.message,
    };
  }
}

/**
 * Truncate a string to maxLen characters.
 */
function truncate(str, maxLen) {
  if (!str || str.length <= maxLen) return str || '';
  return str.slice(0, maxLen) + `\n... (truncated, ${str.length} total chars)`;
}

/**
 * Merge healing branch into base only if test gate passed.
 *
 * @param {string} rootDir - Repository root
 * @param {object} options - { healingBranch, baseBranch, safetyBranch, testResult, squash }
 * @returns {object} { merged, aborted, reason }
 */
function mergeIfPassing(rootDir, options = {}) {
  const { git } = _github();
  const {
    healingBranch,
    baseBranch,
    safetyBranch,
    testResult,
    squash = true,
  } = options;

  if (!testResult || !testResult.passed) {
    try {
      git(`checkout ${baseBranch}`, rootDir);
    } catch {
      // Best effort
    }

    try {
      git(`branch -D ${healingBranch}`, rootDir);
    } catch {
      // Best effort
    }

    return {
      merged: false,
      aborted: true,
      reason: testResult
        ? `Test gate failed at step: ${testResult.failedStep || 'unknown'}. ${testResult.failReason || ''}`
        : 'No test result provided',
      safetyBranch,
    };
  }

  try {
    git(`checkout ${baseBranch}`, rootDir);

    if (squash) {
      git(`merge --squash ${healingBranch}`, rootDir);
      git(`commit -m "Remembrance Pull: Healed refinement (test-verified)"`, rootDir);
    } else {
      git(`merge ${healingBranch} --no-ff -m "Remembrance Pull: Healed refinement (test-verified)"`, rootDir);
    }

    try {
      git(`branch -D ${safetyBranch}`, rootDir);
    } catch {
      // Keep safety branch if delete fails
    }

    return {
      merged: true,
      aborted: false,
      reason: 'All tests passed. Healing merged successfully.',
      baseBranch,
      healingBranch,
    };
  } catch (err) {
    try {
      git('merge --abort', rootDir);
    } catch {
      // Best effort
    }

    return {
      merged: false,
      aborted: true,
      reason: `Merge failed: ${err.message}`,
      safetyBranch,
    };
  }
}

/**
 * Full auto-commit safety pipeline.
 *
 * @param {string} rootDir - Repository root
 * @param {object} healedFiles - Array of { path, code } from reflector
 * @param {object} options - { testCommand, buildCommand, timeoutMs, squash, dryRun }
 * @returns {object} Full pipeline result
 */
function safeAutoCommit(rootDir, healedFiles, options = {}) {
  const { git, isCleanWorkingTree, generateBranchName } = _github();
  const {
    testCommand,
    buildCommand,
    timeoutMs,
    squash = true,
    dryRun: dryRunFlag = false,
    commitMessage,
  } = options;

  const startTime = Date.now();
  const result = {
    timestamp: new Date().toISOString(),
    mode: dryRunFlag ? 'dry-run' : 'live',
    pipeline: [],
  };

  if (!healedFiles || healedFiles.length === 0) {
    result.skipped = true;
    result.reason = 'No healed files to commit';
    result.durationMs = Date.now() - startTime;
    return result;
  }

  if (!isCleanWorkingTree(rootDir)) {
    result.skipped = true;
    result.reason = 'Working tree has uncommitted changes. Stash or commit them first.';
    result.durationMs = Date.now() - startTime;
    return result;
  }

  let safetyInfo;
  try {
    safetyInfo = createSafetyBranch(rootDir);
    result.pipeline.push({ step: 'safety-branch', status: 'ok', branch: safetyInfo.branch });
  } catch (err) {
    result.pipeline.push({ step: 'safety-branch', status: 'error', error: err.message });
    result.aborted = true;
    result.reason = `Failed to create safety branch: ${err.message}`;
    result.durationMs = Date.now() - startTime;
    recordAutoCommit(rootDir, result);
    return result;
  }

  const autoCommitBaseBranch = safetyInfo.baseBranch;
  const healingBranch = generateBranchName();

  if (dryRunFlag) {
    result.pipeline.push({ step: 'dry-run', status: 'ok', message: 'Would create healing branch, apply files, run tests, and merge if passing.' });
    result.dryRun = {
      safetyBranch: safetyInfo.branch,
      healingBranch,
      filesCount: healedFiles.length,
      testCommand: testCommand || 'npm test',
      buildCommand: buildCommand || '(none)',
    };
    try { git(`branch -D ${safetyInfo.branch}`, rootDir); } catch { /* ignore */ }
    result.durationMs = Date.now() - startTime;
    recordAutoCommit(rootDir, result);
    return result;
  }

  try {
    git(`checkout -b ${healingBranch}`, rootDir);
    result.pipeline.push({ step: 'healing-branch', status: 'ok', branch: healingBranch });

    for (const file of healedFiles) {
      const absPath = file.absolutePath || join(rootDir, file.path);
      writeFileSync(absPath, file.code, 'utf-8');
      git(`add "${file.path}"`, rootDir);
    }

    const msg = commitMessage || `Remembrance Pull: Healed ${healedFiles.length} file(s)`;
    git(`commit -m "${msg.replace(/"/g, '\\"')}"`, rootDir);
    result.pipeline.push({ step: 'commit', status: 'ok', files: healedFiles.length });
  } catch (err) {
    result.pipeline.push({ step: 'commit', status: 'error', error: err.message });
    try { git(`checkout ${autoCommitBaseBranch}`, rootDir); } catch { /* ignore */ }
    try { git(`branch -D ${healingBranch}`, rootDir); } catch { /* ignore */ }
    try { git(`branch -D ${safetyInfo.branch}`, rootDir); } catch { /* ignore */ }
    result.aborted = true;
    result.reason = `Failed to commit healed files: ${err.message}`;
    result.durationMs = Date.now() - startTime;
    recordAutoCommit(rootDir, result);
    return result;
  }

  const testResult = runTestGate(rootDir, { testCommand, buildCommand, timeoutMs });
  result.pipeline.push({
    step: 'test-gate',
    status: testResult.passed ? 'ok' : 'failed',
    steps: testResult.steps.map(s => ({ name: s.name, passed: s.passed, durationMs: s.durationMs })),
  });
  result.testResult = testResult;

  const mergeResult = mergeIfPassing(rootDir, {
    healingBranch,
    baseBranch: autoCommitBaseBranch,
    safetyBranch: safetyInfo.branch,
    testResult,
    squash,
  });
  result.pipeline.push({
    step: 'merge',
    status: mergeResult.merged ? 'ok' : 'aborted',
    reason: mergeResult.reason,
  });
  result.merged = mergeResult.merged;
  result.aborted = mergeResult.aborted || false;
  result.reason = mergeResult.reason;
  result.safetyBranch = safetyInfo.branch;
  result.healingBranch = healingBranch;
  result.durationMs = Date.now() - startTime;

  recordAutoCommit(rootDir, result);

  return result;
}

function getAutoCommitHistoryPath(rootDir) {
  return join(rootDir, '.remembrance', 'auto-commit-history.json');
}

/**
 * Record an auto-commit result to history.
 */
function recordAutoCommit(rootDir, result) {
  const { ensureDir, loadJSON, saveJSON, trimArray } = _scoring();
  const historyPath = getAutoCommitHistoryPath(rootDir);
  ensureDir(join(rootDir, '.remembrance'));
  const history = loadJSON(historyPath, []);
  history.push({
    timestamp: result.timestamp,
    mode: result.mode,
    merged: result.merged || false,
    aborted: result.aborted || false,
    skipped: result.skipped || false,
    reason: result.reason,
    durationMs: result.durationMs,
    testPassed: result.testResult ? result.testResult.passed : null,
  });
  trimArray(history, 100);
  saveJSON(historyPath, history);
}

/**
 * Load auto-commit history.
 */
function loadAutoCommitHistory(rootDir) {
  const { loadJSON } = _scoring();
  return loadJSON(getAutoCommitHistoryPath(rootDir), []);
}

/**
 * Get auto-commit stats from history.
 */
function autoCommitStats(rootDir) {
  const history = loadAutoCommitHistory(rootDir);
  if (history.length === 0) {
    return { totalRuns: 0, merged: 0, aborted: 0, skipped: 0, successRate: 0 };
  }

  const merged = history.filter(h => h.merged).length;
  const aborted = history.filter(h => h.aborted).length;
  const skipped = history.filter(h => h.skipped).length;
  const tested = history.filter(h => h.testPassed !== null).length;
  const testsPassed = history.filter(h => h.testPassed === true).length;

  return {
    totalRuns: history.length,
    merged,
    aborted,
    skipped,
    successRate: tested > 0 ? Math.round((testsPassed / tested) * 1000) / 1000 : 0,
    avgDurationMs: Math.round(history.reduce((s, h) => s + (h.durationMs || 0), 0) / history.length),
    lastRun: history[history.length - 1],
  };
}

/**
 * Format auto-commit result as human-readable text.
 */
function formatAutoCommit(result) {
  const lines = [];
  lines.push('\u2500\u2500 Auto-Commit Safety Report \u2500\u2500');
  lines.push('');
  lines.push(`Mode:      ${result.mode || 'live'}`);
  lines.push(`Time:      ${result.timestamp}`);
  lines.push(`Duration:  ${result.durationMs}ms`);
  lines.push('');

  if (result.skipped) {
    lines.push(`SKIPPED: ${result.reason}`);
    return lines.join('\n');
  }

  lines.push('Pipeline Steps:');
  for (const step of (result.pipeline || [])) {
    const icon = step.status === 'ok' ? '[OK]' : step.status === 'failed' ? '[FAIL]' : '[SKIP]';
    lines.push(`  ${icon} ${step.step}${step.branch ? ` (${step.branch})` : ''}${step.reason ? ` \u2014 ${step.reason}` : ''}`);
  }
  lines.push('');

  if (result.merged) {
    lines.push('RESULT: Healing merged successfully (test-verified).');
  } else if (result.aborted) {
    lines.push(`RESULT: Aborted \u2014 ${result.reason}`);
    if (result.safetyBranch) {
      lines.push(`Safety branch preserved: ${result.safetyBranch}`);
    }
  }

  return lines.join('\n');
}

module.exports = {
  createSafetyBranch,
  runTestGate,
  runCommand,
  truncate,
  mergeIfPassing,
  safeAutoCommit,
  getAutoCommitHistoryPath,
  recordAutoCommit,
  loadAutoCommitHistory,
  autoCommitStats,
  formatAutoCommit,
};
