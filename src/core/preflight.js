'use strict';

/**
 * Preflight Check — enforces session checkpoint before CLI commands.
 *
 * Checks:
 * 1. Git hooks are installed (pre-commit + post-commit)
 * 2. Last sync pull was within the configured threshold (default: 24h)
 *
 * If either check fails, prints a warning (or blocks, if strict mode).
 */

const fs = require('fs');
const path = require('path');
const { findGitHooksDir, HOOK_MARKER } = require('../ci/hooks');
const { isOracleEnabled } = require('./oracle-config');

const SYNC_STALENESS_MS = 24 * 60 * 60 * 1000; // 24 hours

// Commands that should bypass preflight (they're part of the checkpoint itself)
const BYPASS_COMMANDS = new Set([
  'hooks', 'sync', 'setup', 'init', 'help', 'config', 'mcp', 'mcp-install',
  'deploy', 'dashboard', 'plugin', 'preflight',
]);

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

/**
 * Check when the last sync pull happened.
 */
function checkLastSync(cwd = process.cwd()) {
  const personalDb = path.join(
    require('os').homedir(), '.remembrance', 'personal', 'oracle.db'
  );
  const localDb = path.join(cwd, '.remembrance', 'oracle.db');

  // Check session log for last sync pull timestamp
  const sessionLog = path.join(cwd, '.remembrance', 'sync-timestamp.json');
  if (fs.existsSync(sessionLog)) {
    try {
      const data = JSON.parse(fs.readFileSync(sessionLog, 'utf-8'));
      const lastPull = new Date(data.lastPull).getTime();
      const age = Date.now() - lastPull;
      if (age < SYNC_STALENESS_MS) {
        return { fresh: true, age, lastPull: data.lastPull };
      }
      return {
        fresh: false,
        age,
        lastPull: data.lastPull,
        reason: `Last sync pull was ${_humanAge(age)} ago (threshold: 24h)`,
      };
    } catch (_) { /* corrupt file */ }
  }

  // Fallback: check if personal store exists and local store was modified recently
  if (!fs.existsSync(personalDb)) {
    return { fresh: true, reason: 'No personal store yet (first run)' };
  }

  if (fs.existsSync(localDb)) {
    const localMtime = fs.statSync(localDb).mtimeMs;
    const age = Date.now() - localMtime;
    if (age < SYNC_STALENESS_MS) {
      return { fresh: true, age, lastPull: new Date(localMtime).toISOString() };
    }
  }

  return { fresh: false, reason: 'No sync pull timestamp found. Run: oracle sync pull' };
}

/**
 * Record a sync pull timestamp.
 */
function recordSyncPull(cwd = process.cwd()) {
  const dir = path.join(cwd, '.remembrance');
  try {
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, 'sync-timestamp.json');
    const data = { lastPull: new Date().toISOString() };
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf-8');
  } catch (_) { /* best effort */ }
}

/**
 * Run preflight checks and return warnings.
 * When oracle is disabled (config off), preflight is skipped entirely.
 */
function runPreflight(cwd = process.cwd()) {
  // When oracle is toggled off, skip all ceremony checks
  if (!isOracleEnabled()) {
    return { ok: true, warnings: [], oracleDisabled: true };
  }

  const warnings = [];

  // Hooks check:
  //   1. If the compliance ledger has already observed `hooks.installed`
  //      for this session, trust it (avoids re-probing on every command).
  //   2. Otherwise probe the filesystem.
  //   3. If the filesystem says installed but the ledger doesn't know,
  //      record the observation so future reporters stay consistent.
  const hooks = checkHooksWithLedger(cwd);
  if (!hooks.installed) {
    warnings.push({
      type: 'hooks',
      message: hooks.reason,
      fix: 'oracle hooks install',
    });
  }

  const sync = checkLastSync(cwd);
  if (!sync.fresh) {
    warnings.push({
      type: 'sync',
      message: sync.reason,
      fix: 'oracle sync pull',
    });
  }

  return { ok: warnings.length === 0, warnings };
}

/**
 * Print preflight warnings to stderr (non-blocking).
 */
function printPreflightWarnings(warnings, c) {
  if (!warnings || warnings.length === 0) return;

  const warn = c && c.boldYellow ? c.boldYellow : (s) => `[WARN] ${s}`;
  const dim = c && c.dim ? c.dim : (s) => s;
  const cyan = c && c.cyan ? c.cyan : (s) => s;

  console.error('');
  console.error(warn('Preflight check failed:'));
  for (const w of warnings) {
    console.error(`  ${warn('!')} ${w.message}`);
    console.error(`    Fix: ${cyan(w.fix)}`);
  }
  console.error('');
}

/**
 * Check if a command should bypass preflight.
 */
function shouldBypass(command) {
  return BYPASS_COMMANDS.has(command);
}

/**
 * Hooks check that consults the compliance ledger first, then falls
 * back to the filesystem — and self-heals the ledger when the two
 * sources disagree. This prevents the "Missing hooks" banner from
 * printing on every command when hooks have already been installed
 * in a previous session but the current ledger hasn't observed it yet.
 */
function checkHooksWithLedger(cwd) {
  // Ledger-first: if the active session already believes hooks are on,
  // trust it and skip the filesystem probe.
  try {
    const { getCurrentSession, recordEvent, saveSession } = require('./compliance');
    const session = getCurrentSession(cwd);
    if (session && session.endedAt == null && session.hooksInstalled) {
      return { installed: true, source: 'ledger' };
    }

    // Ledger says no (or no session). Run the filesystem probe.
    const fs = checkHooksInstalled(cwd);
    if (fs.installed && session && session.endedAt == null) {
      // Heal: filesystem says yes, so record the observation on the
      // ledger once. Subsequent commands won't re-probe.
      try {
        recordEvent(session, 'hooks.installed', { source: 'filesystem-heal' });
        saveSession(session, cwd);
      } catch { /* best-effort */ }
    }
    return fs;
  } catch {
    // If anything in the ledger path goes wrong, fall back to the raw
    // filesystem check — never break preflight over a bookkeeping error.
    return checkHooksInstalled(cwd);
  }
}

function _humanAge(ms) {
  if (ms < 60000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.round(ms / 60000)}m`;
  const h = Math.floor(ms / 3600000);
  const m = Math.round((ms % 3600000) / 60000);
  return `${h}h ${m}m`;
}

module.exports = {
  runPreflight,
  printPreflightWarnings,
  shouldBypass,
  checkHooksInstalled,
  checkLastSync,
  recordSyncPull,
  BYPASS_COMMANDS,
};
