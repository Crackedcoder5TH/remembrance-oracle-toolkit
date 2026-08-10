'use strict';

/**
 * hooks-probe — "are the git hooks on disk?", as a leaf.
 *
 * This is a pure filesystem question: look in the repo's hooks dir and see
 * whether pre-commit and post-commit carry our marker. It depends on nothing
 * but fs, path, and the hook constants.
 *
 * It lives alone because two modules need the answer and each needs the
 * other for a different reason, which formed a require cycle:
 *
 *   compliance  needs the probe   (a fresh session must not report
 *               "hooks not installed" when a previous session installed them)
 *   preflight   needs the ledger  (checkHooksWithLedger consults the active
 *               session first, and heals the ledger when the two disagree)
 *
 * compliance → preflight → compliance. Neither direction was wrong; the
 * shared fact just had no home of its own. Extracting the probe gives both
 * a leaf to depend on, and the loop is gone:
 *
 *   compliance → hooks-probe          preflight → hooks-probe, compliance
 *
 * preflight still re-exports checkHooksInstalled, so its public surface is
 * unchanged for anyone importing it from there.
 */

const fs = require('fs');
const path = require('path');
const { findGitHooksDir, HOOK_MARKER } = require('../ci/hooks');

/**
 * Check if git hooks are installed.
 */
function checkHooksInstalled(cwd = process.cwd()) {
  const hooksDir = findGitHooksDir(cwd);
  if (!hooksDir) return { installed: false, reason: 'Not a git repository' };

  const preCommit = path.join(hooksDir, 'pre-commit');
  const postCommit = path.join(hooksDir, 'post-commit');

  const preOk = fs.existsSync(preCommit) &&
    fs.readFileSync(preCommit, 'utf-8').includes(HOOK_MARKER);
  const postOk = fs.existsSync(postCommit) &&
    fs.readFileSync(postCommit, 'utf-8').includes(HOOK_MARKER);

  if (preOk && postOk) return { installed: true };
  const missing = [];
  if (!preOk) missing.push('pre-commit');
  if (!postOk) missing.push('post-commit');
  return { installed: false, reason: `Missing hooks: ${missing.join(', ')}` };
}
checkHooksInstalled.atomicProperties = {
  charge: 0, valence: 2, mass: 'light', spin: 'even', phase: 'gas',
  reactivity: 'inert', electronegativity: 0.4, group: 12, period: 2,
  harmPotential: 'none', alignment: 'healing', intention: 'benevolent',
  domain: 'security',
};

module.exports = { checkHooksInstalled };
