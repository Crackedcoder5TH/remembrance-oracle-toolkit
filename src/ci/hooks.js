/**
 * Git Hook Integration — Pre-commit covenant check and post-commit auto-seed.
 *
 * Install:
 *   oracle hooks install         # Installs pre-commit + post-commit hooks
 *   oracle hooks uninstall       # Removes them
 *   oracle hooks run pre-commit  # Run the pre-commit check manually
 *
 * Pre-commit: Checks all staged .js/.ts/.py/.go/.rs files against the Covenant.
 *             Blocks commit if any file violates the Kingdom's Weave.
 *
 * Post-commit: Auto-discovers patterns from the committed files and seeds them.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const HOOK_MARKER = '# remembrance-oracle-hook';

/**
 * Find the .git/hooks directory from a given working directory.
 */
function findGitHooksDir(cwd) {
  try {
    const gitDir = execSync('git rev-parse --git-dir', { cwd, encoding: 'utf-8' }).trim();
    return path.resolve(cwd, gitDir, 'hooks');
  } catch {
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

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(js|ts|py|go|rs)$')

if [ -z "$STAGED" ]; then
  exit 0
fi

FAILED=0
for file in $STAGED; do
  if [ -f "$file" ]; then
    result=$(ORACLE_CHECK_FILE="$file" node -e "
      try {
        const { covenantCheck } = require('${path.resolve(__dirname, '../core/covenant')}');
        const fs = require('fs');
        const f = process.env.ORACLE_CHECK_FILE;
        const code = fs.readFileSync(f, 'utf-8');
        const r = covenantCheck(code, { description: f });
        if (!r.sealed) {
          r.violations.forEach(v => console.error('COVENANT BROKEN [' + v.name + ']: ' + v.reason + ' — ' + f));
          process.exit(1);
        }
      } catch(e) {
        // Covenant module not found — skip
      }
    " 2>&1)
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
 */
function postCommitScript() {
  return `#!/bin/sh
${HOOK_MARKER}
# Remembrance Oracle — Post-commit auto-seed
# Seeds any newly committed source files into the pattern library

node -e "
  try {
    const { autoSeed } = require('${path.resolve(__dirname, './auto-seed')}');
    const { RemembranceOracle } = require('${path.resolve(__dirname, '../api/oracle')}');
    const oracle = new RemembranceOracle();
    const result = autoSeed(oracle, process.cwd(), { dryRun: false });
    if (result.registered > 0) {
      console.log('Oracle: Auto-seeded ' + result.registered + ' pattern(s)');
    }
  } catch(e) {
    // Silently fail — don't block workflow
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
      // Append to existing hook
      fs.appendFileSync(preCommitPath, '\n' + preCommitScript());
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
      fs.appendFileSync(postCommitPath, '\n' + postCommitScript());
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
