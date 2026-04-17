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

STAGED=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\\.(js|ts|py|go|rs)$' | grep -v '^tests/')

if [ -z "$STAGED" ]; then
  exit 0
fi

# Resolve repo root portably (works after fork/clone)
REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

# Check if oracle is enabled — skip ceremony when toggled off
ORACLE_ENABLED=$(ORACLE_REPO_ROOT="$REPO_ROOT" node -e "
  try {
    const path = require('path');
    const root = process.env.ORACLE_REPO_ROOT || process.cwd();
    const { isOracleEnabled } = require(path.join(root, 'src/core/oracle-config'));
    process.stdout.write(isOracleEnabled() ? 'true' : 'false');
  } catch(e) { process.stdout.write('true'); }
" 2>/dev/null || echo "true")

if [ "$ORACLE_ENABLED" = "false" ]; then
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
  echo "Fix the violations above. The covenant is structural and cannot be bypassed."
  exit 1
fi

# Query-before-write check (warning only, non-blocking)
ORACLE_REPO_ROOT="$REPO_ROOT" node -e "
  try {
    const path = require('path');
    const root = process.env.ORACLE_REPO_ROOT || process.cwd();
    const { wasSearchRecent, getPendingFeedback } = require(path.join(root, 'src/core/session-tracker'));
    if (!wasSearchRecent(600000)) {
      console.error('\\x1b[33m[oracle] Warning: No oracle search in the last 10 minutes.\\x1b[0m');
      console.error('\\x1b[33m  Consider: oracle search [what you need] before writing new code.\\x1b[0m');
    }
    const pending = getPendingFeedback();
    if (pending.length > 0) {
      console.error('\\x1b[33m[oracle] Warning: ' + pending.length + ' pattern(s) pulled without feedback.\\x1b[0m');
      console.error('\\x1b[33m  Run: oracle pending-feedback\\x1b[0m');
    }
  } catch(e) {
    console.error('[oracle:pre-commit] ' + (e.message || e));
  }
" 2>&1 || true

# Session compliance gate. When ORACLE_WORKFLOW=enforce is set, commits
# are blocked if any staged file was written without a preceding
# oracle search / audit / bypass. The gate also reports the current
# session compliance score so the developer sees it on every commit,
# regardless of whether enforcement is on. Staged code files are
# auto-recorded as 'write' events before the check so the ledger
# always reflects reality — the agent can't bypass by just not
# emitting a write event.
STAGED_FILES="$STAGED" ORACLE_REPO_ROOT="$REPO_ROOT" node -e "
  try {
    const path = require('path');
    const root = process.env.ORACLE_REPO_ROOT || process.cwd();
    const { checkCommitAllowed, complianceBanner, getCurrentSession, startSession, recordEvent, saveSession } = require(path.join(root, 'src/core/compliance'));
    const files = (process.env.STAGED_FILES || '').split(' ').filter(Boolean);

    // Auto-record every staged code file as a write. If the agent
    // forgot (or chose not to) emit a write event explicitly, the
    // hook synthesizes one here so the compliance check sees reality.
    if (files.length > 0) {
      let session = getCurrentSession(root);
      if (!session) session = startSession(root);
      for (const f of files) {
        if (!/\\.(js|ts|mjs|cjs|jsx|tsx|py|go|rs)$/.test(f)) continue;
        recordEvent(session, 'write', { file: f, source: 'pre-commit-autorecord' });
      }
      saveSession(session, root);
    }

    const result = checkCommitAllowed(root, files);
    if (result.score != null) {
      const scoreStr = Math.round(result.score * 100) + '%';
      if (result.score >= 0.9) {
        console.error('\\x1b[32m[oracle] Session compliance: ' + scoreStr + '\\x1b[0m');
      } else if (result.score >= 0.5) {
        console.error('\\x1b[33m[oracle] Session compliance: ' + scoreStr + ' (partial) — run: oracle session status\\x1b[0m');
      } else {
        console.error('\\x1b[31m[oracle] Session compliance: ' + scoreStr + ' — run: oracle session status\\x1b[0m');
      }
    }
    if (result.stagedViolations && result.stagedViolations.length > 0) {
      console.error('\\x1b[33m[oracle] ' + result.stagedViolations.length + ' staged file(s) lack query-before-write proof:\\x1b[0m');
      for (const v of result.stagedViolations.slice(0, 5)) {
        console.error('  ' + v.file + ' — ' + v.reason);
      }
      if (!result.allowed) {
        console.error('\\x1b[31m[oracle] ORACLE_WORKFLOW=enforce — commit BLOCKED.\\x1b[0m');
        console.error('\\x1b[31m  Fix: run \\x1b[1moracle search\\x1b[22m, \\x1b[1moracle audit check\\x1b[22m, or \\x1b[1moracle session bypass\\x1b[22m for each file.\\x1b[0m');
        process.exit(1);
      }
    }
  } catch(e) {
    if (process.env.ORACLE_DEBUG) console.error('[oracle:pre-commit-compliance] ' + (e.message || e));
  }
" 2>&1
COMPLIANCE_EXIT=$?
if [ $COMPLIANCE_EXIT -ne 0 ]; then
  exit $COMPLIANCE_EXIT
fi

# Audit / Lint / Smell sweep on staged files.
# By default: warning only, non-blocking.
# If ORACLE_CI_STRICT=1 is set, HIGH-severity audit findings block the commit.
STAGED_FILES="$STAGED" ORACLE_REPO_ROOT="$REPO_ROOT" node -e "
  try {
    const path = require('path');
    const root = process.env.ORACLE_REPO_ROOT || process.cwd();
    // Prefer the AST-based checker, fall back to the legacy regex checker
    let auditFiles;
    try { ({ auditFiles } = require(path.join(root, 'src/audit/ast-checkers'))); }
    catch { ({ auditFiles } = require(path.join(root, 'src/audit/static-checkers'))); }
    const lint = (() => { try { return require(path.join(root, 'src/audit/lint-checkers')); } catch { return null; } })();
    const smell = (() => { try { return require(path.join(root, 'src/audit/smell-checkers')); } catch { return null; } })();
    const staged = process.env.STAGED_FILES;
    if (!staged) process.exit(0);
    const files = staged.split(' ').filter(f => f.trim());
    if (files.length === 0) process.exit(0);

    // Baseline-aware audit: findings that already existed before the
    // commit are hidden so the developer only sees NEW problems.
    const auditOpts = { minSeverity: 'high' };
    const auditResult = auditFiles(files, auditOpts);
    let auditFindings = auditResult.totalFindings || 0;
    try {
      const baselineMod = require(path.join(root, 'src/audit/baseline'));
      const baseline = baselineMod.readBaseline(baselineMod.resolveBaselinePath(root));
      if (baseline) {
        const byFile = {};
        for (const fr of auditResult.files || []) byFile[fr.file] = fr.findings;
        const diff = baselineMod.diffAgainstBaseline(baseline, byFile, root);
        auditFindings = diff.new.length;
      }
    } catch { /* baseline optional */ }

    if (auditFindings > 0) {
      console.error('\\x1b[33m[oracle] Audit: ' + auditFindings + ' high-severity finding(s) in staged files.\\x1b[0m');
      console.error('\\x1b[33m  Run: oracle audit check for details.\\x1b[0m');
      if (process.env.ORACLE_CI_STRICT === '1' || process.env.ORACLE_CI_STRICT === 'true') {
        console.error('\\x1b[31m[oracle] ORACLE_CI_STRICT is set — commit BLOCKED until the findings are fixed or suppressed.\\x1b[0m');
        process.exit(1);
      }
    }

    // Lint (style hints) — warning only, always non-blocking
    if (lint && typeof lint.lintFiles === 'function') {
      const r = lint.lintFiles(files);
      if (r.totalFindings > 0) {
        console.error('\\x1b[90m[oracle] Lint: ' + r.totalFindings + ' style hint(s). Run: oracle lint\\x1b[0m');
      }
    }

    // Smell (architectural) — warning only, always non-blocking
    if (smell && typeof smell.smellFiles === 'function') {
      const r = smell.smellFiles(files);
      if (r.totalFindings > 0) {
        console.error('\\x1b[90m[oracle] Smell: ' + r.totalFindings + ' architectural hint(s). Run: oracle smell\\x1b[0m');
      }
    }
  } catch(e) {
    // Audit module not available — skip gracefully
    if (process.env.ORACLE_DEBUG) console.error('[oracle:pre-commit-audit] ' + (e.message || e));
  }
" 2>&1 || true
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

# Check if oracle is enabled — skip auto-submit when toggled off
ORACLE_ENABLED=$(ORACLE_REPO_ROOT="$REPO_ROOT" node -e "
  try {
    const path = require('path');
    const root = process.env.ORACLE_REPO_ROOT || process.cwd();
    const { isOracleEnabled } = require(path.join(root, 'src/core/oracle-config'));
    process.stdout.write(isOracleEnabled() ? 'true' : 'false');
  } catch(e) { process.stdout.write('true'); }
" 2>/dev/null || echo "true")

if [ "$ORACLE_ENABLED" = "false" ]; then
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
      console.error('[oracle:post-commit] pipeline errors: ' + result.errors.join('; '));
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), '.remembrance');
      try { fs.mkdirSync(logDir, { recursive: true }); } catch(_m) { console.error('[oracle:post-commit] log dir failed: ' + _m.message); }
      const logPath = path.join(logDir, 'hook-errors.log');
      const entry = new Date().toISOString() + ' [post-commit] ' + result.errors.join('; ') + '\\n';
      try { fs.appendFileSync(logPath, entry); } catch(_w) { console.error('[oracle:post-commit] log write failed: ' + _w.message); }
    }

    // ── Coherency monitoring: scan only the changed files ──────
    try {
      const { CoherencyDirector } = require(path.join(root, 'src/orchestrator/coherency-director'));
      const { execSync } = require('child_process');
      const fs = require('fs');
      const changed = execSync('git diff --name-only HEAD~1 HEAD 2>/dev/null', { encoding: 'utf-8' })
        .trim().split('\\n').filter(f => /\\.js$/.test(f) && fs.existsSync(f));
      if (changed.length > 0) {
        const items = changed.map(f => ({ id: f, filePath: f, language: 'javascript', code: fs.readFileSync(f, 'utf-8') }));
        const d = new CoherencyDirector();
        d.scan(items); d.measureWithOracle();
        const targets = d.field.findHealingTargets();
        if (targets.length > 0) {
          console.log('Oracle: ' + targets.length + ' changed file(s) below coherency threshold:');
          for (const t of targets.slice(0, 5)) console.log('  - ' + t.id + ' (' + t.coherency.toFixed(3) + ')');
        }
      }
    } catch(_c) { /* coherency check is advisory, never block */ }

    // ── Generator radiation: run one cycle after each commit ──────
    // The sun radiates on every commit. Advisory, never blocks.
    try {
      const { CoherencyGenerator } = require(path.join(root, 'src/orchestrator/coherency-generator'));
      const gen = new CoherencyGenerator();
      gen.ignite(0.1);
      gen.runCycle().catch(function() {});
    } catch(_g) { /* generator is advisory */ }

    // ── Tier-coverage check on changed files ──────────────────────
    // New files should be checked for fractal alignment at commit time.
    try {
      const tierCov = require(path.join(root, 'src/audit/tier-coverage'));
      for (const f of changed || []) {
        const tc = tierCov.checkFile(f);
        if (tc && tc.findings && tc.findings.length > 0) {
          console.log('Oracle: tier-coverage gap in ' + f + ' (' + tc.tiersTouched.join(',') + ')');
        }
      }
    } catch(_t) { /* tier-coverage is advisory */ }

    // ── Atomic analyze on changed files ───────────────────────────
    // Auto-extract atomic properties and register in periodic table.
    try {
      const { extractAtomicProperties } = require(path.join(root, 'src/atomic/property-extractor'));
      const { PeriodicTable, encodeSignature } = require(path.join(root, 'src/atomic/periodic-table'));
      const ptPath = path.join(process.cwd(), '.remembrance', 'atomic-table.json');
      const table = new PeriodicTable({ storagePath: ptPath });
      for (const f of changed || []) {
        try {
          const code = fs.readFileSync(f, 'utf-8');
          const props = extractAtomicProperties(code);
          const sig = encodeSignature(props);
          if (!table.getElement(sig)) {
            table.addElement(props, { name: f, source: 'post-commit-auto' });
          }
        } catch(_a) { /* per-file atomic is advisory */ }
      }
    } catch(_at) { /* atomic analyze is advisory */ }
  } catch(e) {
    // Always emit to stderr so errors are never fully silent.
    console.error('[oracle:post-commit] ' + (e.message || e));
    try {
      const fs = require('fs');
      const path = require('path');
      const logDir = path.join(process.cwd(), '.remembrance');
      try { fs.mkdirSync(logDir, { recursive: true }); } catch(_m) { console.error('[oracle:post-commit] log dir failed: ' + _m.message); }
      const logPath = path.join(logDir, 'hook-errors.log');
      const entry = new Date().toISOString() + ' [post-commit] FATAL: ' + (e.message || e) + '\\n';
      try { fs.appendFileSync(logPath, entry); } catch(_w) { console.error('[oracle:post-commit] log write failed: ' + _w.message); }
    } catch(_) {}
  }
" 2>/dev/null || true
`;
}

/**
 * Generate pre-push hook script.
 * Runs the cross-file cascade analysis over the whole repo so a push
 * that introduces a cross-file assumption mismatch (nullable return
 * dereferenced without a guard from another file) surfaces before it
 * hits CI. Warning by default; blocks the push when ORACLE_CI_STRICT=1.
 */
function prePushScript() {
  return `#!/bin/sh
${HOOK_MARKER}
# Remembrance Oracle — pre-push cross-file cascade check

REPO_ROOT=$(git rev-parse --show-toplevel 2>/dev/null)
if [ -z "$REPO_ROOT" ]; then
  exit 0
fi

# Honor the oracle toggle
ORACLE_ENABLED=$(ORACLE_REPO_ROOT="$REPO_ROOT" node -e "
  try {
    const path = require('path');
    const root = process.env.ORACLE_REPO_ROOT || process.cwd();
    const { isOracleEnabled } = require(path.join(root, 'src/core/oracle-config'));
    process.stdout.write(isOracleEnabled() ? 'true' : 'false');
  } catch(e) { process.stdout.write('true'); }
" 2>/dev/null || echo "true")

if [ "$ORACLE_ENABLED" = "false" ]; then
  exit 0
fi

ORACLE_REPO_ROOT="$REPO_ROOT" node -e "
  try {
    const path = require('path');
    const fs = require('fs');
    const root = process.env.ORACLE_REPO_ROOT || process.cwd();
    const { analyzeFiles, crossFileCallGraph } = require(path.join(root, 'src/core/analyze'));
    const { execFileSync } = require('child_process');

    // Collect tracked JS/TS files (cap to keep the hook fast)
    let tracked;
    try {
      tracked = execFileSync('git', ['ls-files', '*.js', '*.mjs', '*.cjs', '*.ts'], { encoding: 'utf-8' })
        .trim().split('\\n').filter(f => f.trim() && !f.includes('node_modules')).slice(0, 300);
    } catch { tracked = []; }
    if (tracked.length === 0) process.exit(0);

    const envs = analyzeFiles(tracked.map(f => path.join(root, f)));
    const cross = crossFileCallGraph(envs);
    const cascades = cross.cascades || [];
    if (cascades.length === 0) process.exit(0);

    console.error('\\x1b[33m[oracle] Pre-push: ' + cascades.length + ' cross-file cascade(s) detected.\\x1b[0m');
    for (const c of cascades.slice(0, 5)) {
      console.error('  ' + (c.file || '') + ':' + (c.line || '') + '  ' + (c.reality || c.ruleId || ''));
    }
    if (cascades.length > 5) console.error('  ... and ' + (cascades.length - 5) + ' more.');

    if (process.env.ORACLE_CI_STRICT === '1' || process.env.ORACLE_CI_STRICT === 'true') {
      console.error('\\x1b[31m[oracle] ORACLE_CI_STRICT is set — push BLOCKED.\\x1b[0m');
      console.error('\\x1b[31m  Run: oracle audit cross-file\\x1b[0m');
      process.exit(1);
    }
  } catch(e) {
    if (process.env.ORACLE_DEBUG) console.error('[oracle:pre-push] ' + (e.message || e));
  }
" 2>&1 || true
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

  // Pre-push — runs the cross-file cascade check before the push goes out
  const prePushPath = path.join(hooksDir, 'pre-push');
  if (fs.existsSync(prePushPath)) {
    const existing = fs.readFileSync(prePushPath, 'utf-8');
    if (existing.includes(HOOK_MARKER)) {
      fs.writeFileSync(prePushPath, prePushScript());
    } else {
      fs.appendFileSync(prePushPath, '\n' + prePushScript().replace(/^#!\/bin\/sh\n/, ''));
    }
  } else {
    fs.writeFileSync(prePushPath, prePushScript());
  }
  fs.chmodSync(prePushPath, '755');
  installed.push('pre-push');

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

  for (const hook of ['pre-commit', 'post-commit', 'pre-push']) {
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
