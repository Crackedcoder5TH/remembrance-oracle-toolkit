/**
 * Git Hook Integration — Pre-commit covenant check and post-commit auto-submit.
 *
 * Install:
 *   oracle hooks install         # Installs pre-commit + post-commit hooks
 *   oracle hooks uninstall       # Removes them
 *   oracle hooks run pre-commit  # Run the pre-commit check manually
 *
 * Pre-commit: Checks all staged .js/.ts/.py/.go/.rs files against the Covenant.
 *             Blocks commit if any file violates the Kingdom's Weave.
 *
 * Post-commit: Runs full auto-submit pipeline — harvest, promote, and sync patterns.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const HOOK_MARKER = '# remembrance-oracle-hook';

/**
 * Find the .git/hooks directory from a given working directory.
 */
function findGitHooksDir(cwd) {
  try {
    const gitDir = execFileSync('git', ['rev-parse', '--git-dir'], { cwd, encoding: 'utf-8' }).trim();
    return path.resolve(cwd, gitDir, 'hooks');
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[hooks:findGitHooksDir] returning null on error:', e?.message || e);
    return null;
  }
}

/**
 * Generate pre-commit hook script.
 */
function preCommitScript() {
  return `#!/bin/sh
${HOOK_MARKER}
# Remembrance Oracle — Covenant pre-commit check
# Checks staged files against the Kingdom's Weave
# Uses portable path resolution — survives forks and clones

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(js|ts|py|go|rs)$')

if [ -z "$STAGED" ]; then
  exit 0
fi

# Resolve repo root portably (works after fork/clone)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

FAILED=0
for file in $STAGED; do
  if [ -f "$file" ]; then
    result=$(ORACLE_CHECK_FILE="$file" ORACLE_REPO_ROOT="$REPO_ROOT" node -e '
      try {
        const path = require("path");
        const root = process.env.ORACLE_REPO_ROOT || process.cwd();
        const { covenantCheck } = require(path.join(root, "src/core/covenant"));
        const fs = require("fs");
        const f = process.env.ORACLE_CHECK_FILE;
        const code = fs.readFileSync(f, "utf-8");
        const r = covenantCheck(code, { description: f, trusted: true });
        if (!r.sealed) {
          r.violations.forEach(v => console.error("COVENANT BROKEN [" + v.name + "]: " + v.reason + " — " + f));
          process.exit(1);
        }
      } catch(e) {
        // Covenant module not found — skip
      }
    ' 2>&1)
    if [ $? -ne 0 ]; then
      echo "$result"
      FAILED=1
    fi
  fi
done

if [ $FAILED -ne 0 ]; then
  echo ""
  echo "Commit blocked by Remembrance Oracle Covenant."
  echo "Fix the violations above or use --no-verify to skip."
  exit 1
fi
`;
}

/**
 * Generate post-commit hook script.
 * Runs the full auto-submit pipeline: harvest → promote → sync.
 */
function postCommitScript() {
  return `#!/bin/sh
${HOOK_MARKER}
# Remembrance Oracle — Post-commit auto-submit
# Harvests patterns, promotes candidates, and syncs to personal store
# Uses portable path resolution — survives forks and clones

# Resolve repo root portably (works after fork/clone)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

ORACLE_REPO_ROOT="$REPO_ROOT" node -e "
  try {
    const path = require('path');
    const root = process.env.ORACLE_REPO_ROOT || process.cwd();
    const { shouldAutoSubmit, autoSubmit } = require(path.join(root, 'src/ci/auto-submit'));
    if (!shouldAutoSubmit(process.cwd())) process.exit(0);
    const { RemembranceOracle } = require(path.join(root, 'src/api/oracle'));
    const oracle = new RemembranceOracle({ autoSeed: false });
    const result = autoSubmit(oracle, process.cwd(), { syncPersonal: true, silent: true });
    const total = (result.harvest.registered || 0) + (result.promoted || 0);
    var debugInfo = '';
    if (result.debugSweep && (result.debugSweep.grown > 0 || result.debugSweep.synced > 0)) {
      debugInfo = ', debug: ' + (result.debugSweep.grown || 0) + ' grown/' + (result.debugSweep.synced || 0) + ' synced';
    }
    if (total > 0 || debugInfo) {
      console.log('Oracle: ' + (result.harvest.registered || 0) + ' harvested, ' + (result.promoted || 0) + ' promoted' + (result.synced ? ', synced' : '') + debugInfo);
    }
    if (result.errors && result.errors.length > 0) {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), '.remembrance');
      try { fs.mkdirSync(logDir, { recursive: true }); } catch(_) {}
      const logPath = path.join(logDir, 'hook-errors.log');
      const entry = new Date().toISOString() + ' [post-commit] ' + result.errors.join('; ') + '\\n';
      try { fs.appendFileSync(logPath, entry); } catch(_) {}
    }
  } catch(e) {
    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), '.remembrance');
      try { fs.mkdirSync(logDir, { recursive: true }); } catch(_) {}
      const logPath = path.join(logDir, 'hook-errors.log');
      const entry = new Date().toISOString() + ' [post-commit] FATAL: ' + (e.message || e) + '\\n';
      try { fs.appendFileSync(logPath, entry); } catch(_) {}
    } catch(_) {}
    if (process.env.ORACLE_DEBUG) console.warn('[hooks:postCommitScript] failure:', e?.message || e);
  }
" 2>/dev/null || true
`;
}

/**
 * Install git hooks in the given repo.
 */
function installHooks(cwd = process.cwd()) {
  const hooksDir = findGitHooksDir(cwd);
  if (!hooksDir) {
    return { installed: false, error: 'Not a git repository' };
  }

  fs.mkdirSync(hooksDir, { recursive: true });

  const installed = [];

  // Pre-commit
  const preCommitPath = path.join(hooksDir, 'pre-commit');
  if (fs.existsSync(preCommitPath)) {
    const existing = fs.readFileSync(preCommitPath, 'utf-8');
    if (existing.includes(HOOK_MARKER)) {
      // Already installed — overwrite
      fs.writeFileSync(preCommitPath, preCommitScript());
    } else {
      // Append to existing hook (strip shebang to avoid duplicate)
      fs.appendFileSync(preCommitPath, '\n' + preCommitScript().replace(/^#!\/bin\/sh\n/, ''));
    }
  } else {
    fs.writeFileSync(preCommitPath, preCommitScript());
  }
  fs.chmodSync(preCommitPath, '755');
  installed.push('pre-commit');

  // Post-commit
  const postCommitPath = path.join(hooksDir, 'post-commit');
  if (fs.existsSync(postCommitPath)) {
    const existing = fs.readFileSync(postCommitPath, 'utf-8');
    if (existing.includes(HOOK_MARKER)) {
      fs.writeFileSync(postCommitPath, postCommitScript());
    } else {
      fs.appendFileSync(postCommitPath, '\n' + postCommitScript().replace(/^#!\/bin\/sh\n/, ''));
    }
  } else {
    fs.writeFileSync(postCommitPath, postCommitScript());
  }
  fs.chmodSync(postCommitPath, '755');
  installed.push('post-commit');

  return { installed: true, hooks: installed, hooksDir };
}

/**
 * Uninstall Oracle git hooks.
 */
function uninstallHooks(cwd = process.cwd()) {
  const hooksDir = findGitHooksDir(cwd);
  if (!hooksDir) {
    return { uninstalled: false, error: 'Not a git repository' };
  }

  const removed = [];

  for (const hook of ['pre-commit', 'post-commit']) {
    const hookPath = path.join(hooksDir, hook);
    if (!fs.existsSync(hookPath)) continue;

    const content = fs.readFileSync(hookPath, 'utf-8');
    if (!content.includes(HOOK_MARKER)) continue;

    // If the whole file is ours, delete it. Otherwise, remove our section.
    const lines = content.split('\n');
    const markerIdx = lines.findIndex(l => l.includes(HOOK_MARKER));
    if (markerIdx < 0) continue; // No marker found, skip (shouldn't happen after includes check)
    if (markerIdx <= 1) {
      // The whole file is ours (marker is at line 0 or 1)
      fs.unlinkSync(hookPath);
    } else {
      // Keep lines before our marker
      const kept = lines.slice(0, markerIdx).join('\n');
      fs.writeFileSync(hookPath, kept);
    }
    removed.push(hook);
  }

  return { uninstalled: true, removed };
}

/**
 * Run a hook check manually (without being inside git hook).
 */
function runPreCommitCheck(files, options = {}) {
  const { covenantCheck } = require('../core/covenant');
  const results = [];

  for (const file of files) {
    if (!fs.existsSync(file)) continue;
    try {
      const code = fs.readFileSync(file, 'utf-8');
      const check = covenantCheck(code, { description: file });
      results.push({
        file,
        sealed: check.sealed,
        violations: check.violations || [],
      });
    } catch (err) {
      results.push({ file, sealed: false, violations: [{ name: 'Error', reason: err.message }] });
    }
  }

  const blocked = results.filter(r => !r.sealed);
  return {
    passed: blocked.length === 0,
    total: results.length,
    blocked: blocked.length,
    results,
  };
}

module.exports = {
  installHooks,
  uninstallHooks,
  runPreCommitCheck,
  findGitHooksDir,
  preCommitScript,
  postCommitScript,
  HOOK_MARKER,
};
