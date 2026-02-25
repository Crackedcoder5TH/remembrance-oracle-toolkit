/**
 * Remembrance Reflector BOT — GitHub Sub-Module
 *
 * Git/GitHub operations extracted from report.js Section 4.
 * Uses lazy require for ./multi to avoid circular deps.
 */

const { execSync } = require('child_process');
const { join } = require('path');
const { existsSync, writeFileSync } = require('fs');

// ─── Lazy Require Helper (avoid circular deps with multi) ───
const { multi: _multi } = require('./report-lazy');

// =====================================================================
// GitHub — Git/GitHub Operations
// =====================================================================

/**
 * Generate a unique healing branch name.
 * Format: remembrance/heal-YYYY-MM-DD-HHMMSS
 */
function generateBranchName() {
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const date = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const time = `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  return `remembrance/heal-${date}-${time}`;
}

/**
 * Execute a git command in the given directory.
 * Returns stdout as a string.
 */
function git(command, cwd) {
  try {
    return execSync(`git ${command}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 30000,
    }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    throw new Error(`git ${command} failed: ${stderr || err.message}`);
  }
}

/**
 * Execute a gh CLI command.
 */
function gh(command, cwd) {
  try {
    return execSync(`gh ${command}`, {
      cwd,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
      timeout: 60000,
      env: { ...process.env },
    }).trim();
  } catch (err) {
    const stderr = err.stderr ? err.stderr.toString().trim() : '';
    throw new Error(`gh ${command} failed: ${stderr || err.message}`);
  }
}

/**
 * Check if gh CLI is available and authenticated.
 */
function isGhAvailable(cwd) {
  try {
    gh('auth status', cwd);
    return true;
  } catch {
    return false;
  }
}

/**
 * Get the current git branch name.
 */
function getCurrentBranch(cwd) {
  return git('rev-parse --abbrev-ref HEAD', cwd);
}

/**
 * Get the default remote branch (main or master).
 */
function getDefaultBranch(cwd) {
  try {
    const remote = git('remote show origin', cwd);
    const match = remote.match(/HEAD branch:\s*(\S+)/);
    if (match) return match[1];
  } catch {
    // Fallback
  }
  try {
    git('rev-parse --verify main', cwd);
    return 'main';
  } catch {
    try {
      git('rev-parse --verify master', cwd);
      return 'master';
    } catch {
      return 'main';
    }
  }
}

/**
 * Check if the working tree is clean (no uncommitted changes).
 */
function isCleanWorkingTree(cwd) {
  const status = git('status --porcelain', cwd);
  return status === '';
}

/**
 * Create a healing branch, commit healed files, and optionally push + open PR.
 *
 * @param {object} report - Reflector report from engine.reflect()
 * @param {object} options - { push, openPR, autoMerge, baseBranch, cwd }
 * @returns {object} { branch, commits, prUrl, prNumber }
 */
function createHealingBranch(report, options = {}) {
  const {
    push = false,
    openPR = false,
    autoMerge = false,
    baseBranch,
    cwd = report.rootDir,
    branchName,
  } = options;

  if (!report.healedFiles || report.healedFiles.length === 0) {
    return { branch: null, commits: 0, message: 'No files to heal' };
  }

  const currentBranch = getCurrentBranch(cwd);
  const base = baseBranch || currentBranch;
  const branch = branchName || generateBranchName();
  const result = { branch, baseBranch: base, commits: 0, files: [] };

  let stashed = false;
  if (!isCleanWorkingTree(cwd)) {
    git('stash push -m "reflector: stash before healing"', cwd);
    stashed = true;
  }

  try {
    git(`checkout -b ${branch}`, cwd);

    for (const file of report.healedFiles) {
      const absPath = file.absolutePath || join(cwd, file.path);
      writeFileSync(absPath, file.code, 'utf-8');
      git(`add "${file.path}"`, cwd);
      result.files.push(file.path);
    }

    const healingCount = report.healedFiles?.length ?? 0;
    const commitMsg = `Remembrance Pull: Healed ${healingCount} file(s)\n\n${report.collectiveWhisper?.message ?? ''}\n\nAvg improvement: +${(report.summary?.avgImprovement ?? 0).toFixed(3)}\nOverall health: ${report.collectiveWhisper?.overallHealth ?? 'unknown'}`;

    try {
      execSync('git commit -m "$REMEMBRANCE_COMMIT_MSG"', {
        cwd,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
        timeout: 30000,
        env: { ...process.env, REMEMBRANCE_COMMIT_MSG: commitMsg },
      });
    } catch (err) {
      const stderr = err.stderr ? err.stderr.toString().trim() : '';
      throw new Error(`git commit failed: ${stderr || err.message}`);
    }
    result.commits = 1;

    if (push) {
      git(`push -u origin ${branch}`, cwd);
      result.pushed = true;
    }

    if (openPR && push) {
      const prResult = openHealingPR(report, {
        branch,
        baseBranch: base,
        autoMerge,
        cwd,
      });
      result.prUrl = prResult.url;
      result.prNumber = prResult.number;
    }
  } finally {
    try {
      git(`checkout ${currentBranch}`, cwd);
    } catch {
      // Best effort
    }

    if (stashed) {
      try {
        git('stash pop', cwd);
      } catch {
        // Best effort
      }
    }
  }

  return result;
}

/**
 * Open a Healing PR with the reflector report as the body.
 *
 * @param {object} report - Reflector report
 * @param {object} options - { branch, baseBranch, autoMerge, cwd }
 * @returns {object} { url, number }
 */
function openHealingPR(report, options = {}) {
  const {
    branch,
    baseBranch = 'main',
    autoMerge = false,
    cwd,
  } = options;

  if (!isGhAvailable(cwd)) {
    return { url: null, error: 'gh CLI not available or not authenticated' };
  }

  const { formatPRBody } = _multi();
  const body = formatPRBody(report);

  const title = `Remembrance Pull: Healed Refinement (+${(report.summary?.avgImprovement ?? 0).toFixed(3)})`;
  const labels = 'remembrance,auto-heal';

  const escapedBody = body.replace(/'/g, "'\\''");

  try {
    const output = gh(
      `pr create --title '${title}' --body '${escapedBody}' --base ${baseBranch} --head ${branch} --label '${labels}'`,
      cwd
    );

    const urlMatch = output.match(/https:\/\/github\.com\/[^\s]+/);
    const numberMatch = output.match(/\/pull\/(\d+)/);

    const prResult = {
      url: urlMatch ? urlMatch[0] : output,
      number: numberMatch ? parseInt(numberMatch[1]) : null,
    };

    if (autoMerge && report.summary?.autoMergeRecommended && prResult.number) {
      try {
        gh(`pr merge ${prResult.number} --auto --squash`, cwd);
        prResult.autoMergeEnabled = true;
      } catch {
        prResult.autoMergeEnabled = false;
      }
    }

    return prResult;
  } catch (err) {
    return { url: null, error: err.message };
  }
}

/**
 * Check if there's already an open reflector PR.
 *
 * @param {string} cwd - Repository directory
 * @returns {object|null} Existing PR info or null
 */
function findExistingReflectorPR(cwd) {
  if (!isGhAvailable(cwd)) return null;

  try {
    const output = gh('pr list --label remembrance --state open --json number,title,url', cwd);
    const prs = JSON.parse(output);
    return prs.length > 0 ? prs[0] : null;
  } catch {
    return null;
  }
}

/**
 * Generate the GitHub Actions workflow YAML for the Reflector BOT.
 */
function generateReflectorWorkflow(config) {
  const {
    schedule = '0 */6 * * *',
    minCoherence = 0.7,
    autoMerge = false,
    nodeVersion = '22',
  } = config || {};

  return `name: Remembrance Reflector BOT

on:
  schedule:
    - cron: '${schedule}'
  push:
    branches: [main, master]
  pull_request:
    types: [opened, synchronize]
  workflow_dispatch:
    inputs:
      min_coherence:
        description: 'Minimum coherence threshold (0-1)'
        required: false
        default: '${minCoherence}'
      auto_merge:
        description: 'Auto-merge high-coherence PRs'
        required: false
        default: '${autoMerge}'
        type: boolean

permissions:
  contents: write
  pull-requests: write

jobs:
  reflect:
    name: Self-Reflect & Heal
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
        with:
          fetch-depth: 0

      - uses: actions/setup-node@v4
        with:
          node-version: '${nodeVersion}'

      - name: Run Reflector BOT
        run: |
          MIN_COHERENCE=\${{ github.event.inputs.min_coherence || '${minCoherence}' }}
          AUTO_MERGE=\${{ github.event.inputs.auto_merge || '${autoMerge}' }}
          node src/cli.js reflector run --min-coherence "$MIN_COHERENCE" --push --open-pr \\
            \${{ env.AUTO_MERGE == 'true' && '--auto-merge' || '' }} --json
        env:
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}

      - name: Upload Report
        if: always()
        uses: actions/upload-artifact@v4
        with:
          name: reflector-report
          path: .remembrance/reflector-report.json
          retention-days: 30
`;
}

module.exports = {
  generateBranchName,
  git,
  gh,
  isGhAvailable,
  getCurrentBranch,
  getDefaultBranch,
  isCleanWorkingTree,
  createHealingBranch,
  openHealingPR,
  findExistingReflectorPR,
  generateReflectorWorkflow,
};
