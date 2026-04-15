/**
 * Admin CLI commands: users, audit, auto-seed, ci-feedback, ci-stats, ci-track, hooks, registry
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { c, colorScore } = require('../colors');
const { parseDryRun } = require('../validate-args');

function registerAdminCommands(handlers, { oracle, jsonOut }) {

  // Wire the unified history log on first command invocation. Every
  // event emitted on the bus is appended to .remembrance/history/events.log
  // so `oracle history` can replay it.
  try {
    const { wireHistory } = require('../../core/history');
    wireHistory(process.cwd());
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[admin] history wiring failed:', e?.message || e);
  }

  // Wire cross-subsystem reactions so every subsystem learns from
  // every other. A feedback.fix now fans out to audit calibration,
  // pattern-library reliability, and debug-oracle amplitude all at
  // once — see src/core/reactions.js for the subscription graph.
  try {
    const { wireReactions } = require('../../core/reactions');
    wireReactions(oracle, { storageRoot: process.cwd() });
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[admin] reactions wiring failed:', e?.message || e);
  }

  // Wire the session compliance ledger. Every search/write/audit/feedback
  // event on the bus is recorded into the active session so `oracle session
  // status` can compute a live compliance score, and the pre-commit hook
  // can block on non-compliance when ORACLE_WORKFLOW=enforce.
  try {
    const { wireCompliance } = require('../../core/compliance');
    wireCompliance(process.cwd());
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[admin] compliance wiring failed:', e?.message || e);
  }

  // Auto-discover + auto-wire ecosystem peers. Runs best-effort at
  // bootstrap: if the Void Compressor, Reflector, Swarm, etc. are
  // alive in the environment, their bindings install automatically
  // so every CLI command benefits from them without explicit opt-in.
  // Skipped when ORACLE_ECOSYSTEM=off.
  if ((process.env.ORACLE_ECOSYSTEM || 'on').toLowerCase() !== 'off') {
    try {
      const eco = require('../../core/ecosystem');
      // Announce ourselves so peers find us. Sync filesystem writes —
      // cheap and doesn't block the CLI. We deliberately do NOT call
      // ensureWired() here: autoWireAll runs health checks that use
      // execFileSync and can add seconds to every CLI invocation.
      // Commands that actually depend on the ecosystem being wired
      // (e.g. `oracle ecosystem connect`) call `await eco.ensureWired()`
      // themselves, which memoizes the in-flight promise.
      eco.announceModule(process.cwd());
    } catch (e) {
      if (process.env.ORACLE_DEBUG) console.warn('[admin] ecosystem init failed:', e?.message || e);
    }
  }

  handlers['users'] = (args) => {
    try {
      const { AuthManager } = require('../../auth/auth');
      const sqliteStore = oracle.store.getSQLiteStore();
      const auth = new AuthManager(sqliteStore);
      const subCmd = args._sub;

      if (subCmd === 'add') {
        const username = args.username || args.name;
        const password = args.password;
        const role = args.role || 'contributor';
        if (!username || !password) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle users add')} --username <name> --password <pass> [--role admin|contributor|viewer]`); process.exit(1); }
        const user = auth.createUser(username, password, role);
        console.log(`${c.boldGreen('User created:')} ${c.bold(user.username)} (${user.role})`);
        console.log(`  API Key: ${c.cyan(user.apiKey)}`);
      } else if (subCmd === 'delete') {
        const id = args.id;
        if (!id) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle users delete')} --id <user-id>`); process.exit(1); }
        const deleted = auth.deleteUser(id);
        console.log(deleted ? c.boldGreen('User deleted.') : c.yellow('User not found.'));
      } else {
        const users = auth.listUsers();
        console.log(c.boldCyan(`Users (${users.length}):\n`));
        for (const u of users) {
          console.log(`  ${c.bold(u.username)} [${c.cyan(u.id.slice(0, 8))}] role: ${c.magenta(u.role)} key: ${c.dim(u.apiKey.slice(0, 12) + '...')}`);
        }
      }
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Auth error: ' + err.message);
    }
  };

  // Pick the audit backend. The AST-based checker is the default because
  // it eliminates the regex-era false positives on regex flags, SQL PRAGMA
  // template literals, already-guarded null derefs, and comment content.
  // Users can opt back into the legacy regex checker via
  // ORACLE_AUDIT_BACKEND=regex if the new backend misbehaves on a file
  // the old one handled.
  function loadAuditBackend() {
    const backend = (process.env.ORACLE_AUDIT_BACKEND || 'ast').toLowerCase();
    if (backend === 'regex' || backend === 'legacy') {
      return require('../../audit/static-checkers');
    }
    return require('../../audit/ast-checkers');
  }

  handlers['audit'] = (args) => {
    const sub = args._sub;

    // Subcommand: audit check — run static checkers on files
    if (sub === 'check') {
      const { auditFiles, auditFile, BUG_CLASSES } = loadAuditBackend();
      const targetFile = args.file || args._positional[1];

      let files = [];
      if (targetFile) {
        files = [targetFile];
      } else {
        // Default: scan staged or recently changed files
        try {
          const staged = execSync('git diff --cached --name-only --diff-filter=ACM 2>/dev/null || git diff HEAD~1 --name-only --diff-filter=ACM 2>/dev/null', { encoding: 'utf-8' })
            .trim().split('\n').filter(f => /\.(js|ts)$/.test(f) && f.trim());
          files = staged;
        } catch (_) {
          // Fall back to all JS files in src/
          try {
            const allSrc = execSync('find src -name "*.js" -not -path "*/node_modules/*" 2>/dev/null | head -100', { encoding: 'utf-8' })
              .trim().split('\n').filter(f => f.trim());
            files = allSrc;
          } catch (__) { /* empty */ }
        }
      }

      if (files.length === 0) {
        console.log(c.yellow('No files to audit. Specify --file or have staged changes.'));
        return;
      }

      const bugClasses = args['bug-class'] ? args['bug-class'].split(',').map(s => s.trim()) : undefined;
      const minSeverity = args['min-severity'] || undefined;
      const result = auditFiles(files, { bugClasses, minSeverity });

      // Compliance: every audited file counts toward the audit-on-write
      // check. Emit a bus event per file so the session ledger records it.
      try {
        const { getEventBus } = require('../../core/events');
        const bus = getEventBus();
        for (const f of files) bus.emitSync('audit.file-scanned', { file: f });
      } catch { /* ignore */ }

      // ─── Tier 3: baseline + calibration + auto-fix ────────────────────
      // Each file result carries a `findings` array. Re-key them into a
      // per-file map so baseline / feedback can diff and calibrate.
      const repoRoot = process.cwd();
      const useBaseline = args['no-baseline'] !== true && args['no-baseline'] !== 'true';
      const useCalibration = args['no-calibrate'] !== true && args['no-calibrate'] !== 'true';

      const findingsByFile = {};
      for (const fr of result.files || []) {
        findingsByFile[fr.file] = fr.findings;
      }

      let diff = null;
      if (useBaseline) {
        try {
          const baselineMod = require('../../audit/baseline');
          const baselinePath = baselineMod.resolveBaselinePath(repoRoot);
          const baseline = baselineMod.readBaseline(baselinePath);
          if (baseline) {
            diff = baselineMod.diffAgainstBaseline(baseline, findingsByFile, repoRoot);
            // Replace per-file findings with NEW findings only (baseline hides known debt)
            const hiddenCount = diff.persisted.length;
            for (const fr of result.files) {
              fr.findings = fr.findings.filter(f =>
                diff.new.some(n => n.file === fr.file && n.line === f.line && n.ruleId === f.ruleId)
              );
            }
            result.files = result.files.filter(fr => fr.findings.length > 0);
            result.totalFindings = diff.new.length;
            result._baselineHidden = hiddenCount;
            result._baselineNew = diff.new.length;
            result._baselineFixed = diff.fixed.length;
          }
        } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[audit:baseline]', e.message); }
      }

      if (useCalibration) {
        try {
          const { calibrateFindings } = require('../../audit/feedback');
          for (const fr of result.files) {
            fr.findings = calibrateFindings(fr.findings, repoRoot);
          }
          // Recount after calibration (drops noise-gated findings)
          let newTotal = 0;
          for (const fr of result.files) newTotal += fr.findings.length;
          result.totalFindings = newTotal;
        } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[audit:calibration]', e.message); }
      }

      // Auto-fix pass
      let autoFixReport = null;
      if (args['auto-fix'] === true || args['auto-fix'] === 'true' || args.fix === true) {
        try {
          const { autoFixFile } = require('../../audit/auto-fix');
          autoFixReport = { fixed: 0, unfixed: 0, touched: [] };
          const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
          for (const fr of result.files) {
            const r = autoFixFile(fr.file, fr.findings, { write: !dryRun });
            autoFixReport.fixed += r.fixed;
            autoFixReport.unfixed += r.unfixed.length;
            if (r.fixed > 0) autoFixReport.touched.push({ file: fr.file, fixed: r.fixed, dryRun });
            fr.findings = r.unfixed;
          }
          let newTotal = 0;
          for (const fr of result.files) newTotal += fr.findings.length;
          result.totalFindings = newTotal;
        } catch (e) { if (process.env.ORACLE_DEBUG) console.warn('[audit:auto-fix]', e.message); }
      }

      if (args.json === true) { console.log(JSON.stringify(result)); return; }

      console.log(c.boldCyan(`Audit Check \u2014 ${result.summary.filesScanned} files scanned\n`));

      if (typeof result._baselineHidden === 'number') {
        console.log(c.dim(`  Baseline: ${result._baselineHidden} known-debt finding(s) hidden, ${result._baselineNew} new, ${result._baselineFixed} fixed since baseline.\n`));
      }

      if (autoFixReport) {
        const verb = (args['dry-run'] === true || args['dry-run'] === 'true') ? 'would fix' : 'fixed';
        console.log(c.boldGreen(`  Auto-fix: ${verb} ${autoFixReport.fixed} finding(s), ${autoFixReport.unfixed} remaining.`));
        for (const t of autoFixReport.touched) {
          console.log(c.dim(`    ${t.file}: ${t.fixed} patch(es)${t.dryRun ? ' (dry run)' : ''}`));
        }
        console.log('');
      }

      // Session compliance banner — visible on every audit check run
      // so the score stays in the developer's face until it's fixed.
      try {
        const { complianceBanner } = require('../../core/compliance');
        const banner = complianceBanner(repoRoot);
        if (banner) {
          const color = banner.score >= 0.5 ? c.yellow : c.boldRed;
          console.log(color(`  Session compliance: ${(banner.score * 100).toFixed(0)}% (${banner.status})`));
          if (banner.topViolation) {
            console.log(c.dim(`    top issue: ${banner.topViolation.message}`));
            console.log(c.dim(`    fix: ${banner.topViolation.fix}`));
          }
          console.log('');
        }
      } catch { /* ignore */ }

      if (result.totalFindings === 0) {
        console.log(c.boldGreen('  \u2713 No assumption mismatches found!\n'));
        return;
      }

      console.log(c.boldRed(`  ${result.totalFindings} assumption mismatch(es) found:\n`));

      for (const fileResult of result.files) {
        console.log(`  ${c.bold(fileResult.file)}:`);
        for (const f of fileResult.findings) {
          const sevColor = f.severity === 'high' ? c.red : f.severity === 'medium' ? c.yellow : c.dim;
          console.log(`    ${sevColor(f.severity.toUpperCase().padEnd(6))} L${String(f.line).padStart(4)} [${c.cyan(f.bugClass)}]`);
          console.log(`      ${c.dim('Assumes:')} ${f.assumption}`);
          console.log(`      ${c.dim('Reality:')} ${f.reality}`);
          console.log(`      ${c.dim('Fix:')}     ${f.suggestion}`);
        }
        console.log('');
      }

      // Cross-reference with debug patterns if oracle available
      try {
        const { crossReference, crossReferenceSummary } = require('../../audit/cross-reference');
        const allFindings = result.files.flatMap(f => f.findings);
        const enriched = crossReference(allFindings, oracle);
        const xrefSummary = crossReferenceSummary(enriched);
        if (xrefSummary.withFixes > 0) {
          console.log(c.bold('  Known Fixes:'));
          for (const item of xrefSummary.actionable) {
            console.log(`    L${String(item.line).padStart(4)} [${c.cyan(item.bugClass)}] ${c.dim('\u2192')} ${c.green(item.topFix.fixDescription || 'fix available')}`);
            if (item.alternativeFixes > 0) console.log(`          ${c.dim(`+${item.alternativeFixes} alternative fix(es)`)}`);
          }
          console.log('');
        }
      } catch (_) {
        // Cross-reference not available — non-critical
      }

      console.log(c.bold('  Summary:'));
      for (const [cls, count] of Object.entries(result.summary.byClass)) {
        console.log(`    ${c.cyan(cls.padEnd(16))} ${c.bold(String(count))}`);
      }
      return;
    }

    // Subcommand: audit cascade — detect cascading assumption mismatches
    if (sub === 'cascade') {
      const { detectCascade } = require('../../audit/cascade-detector');
      const commitRange = args.from || 'HEAD~1..HEAD';
      const result = detectCascade(commitRange, process.cwd());

      if (args.json === true) { console.log(JSON.stringify(result)); return; }

      console.log(c.boldCyan(`Cascade Detection \u2014 from ${c.bold(commitRange)}\n`));

      if (result.changedFunctions.length > 0) {
        console.log(c.bold('  Changed functions:'));
        for (const cf of result.changedFunctions) {
          console.log(`    ${c.dim(cf.file)}: ${cf.functions.map(f => c.cyan(f)).join(', ')}`);
        }
        console.log('');
      }

      if (result.cascades.length === 0) {
        console.log(c.boldGreen('  \u2713 No cascading assumption mismatches found!\n'));
        return;
      }

      console.log(c.boldRed(`  ${result.summary.cascadesFound} cascading mismatch(es):\n`));

      for (const cascade of result.cascades) {
        console.log(`    ${c.red('\u26A0')} ${c.bold(cascade.sourceFunction)} (${c.dim(cascade.sourceFile)})`);
        console.log(`      \u2192 ${c.cyan(cascade.targetFile)}:${cascade.targetLine}`);
        console.log(`      ${c.dim('Type:')} ${cascade.assumptionType}`);
        console.log(`      ${c.dim('Risk:')} ${cascade.assumptionBroken}`);
        console.log(`      ${c.dim('Code:')} ${cascade.targetCode}`);
        console.log('');
      }

      if (Object.keys(result.summary.byType).length > 0) {
        console.log(c.bold('  By type:'));
        for (const [type, count] of Object.entries(result.summary.byType)) {
          console.log(`    ${c.cyan(type.padEnd(16))} ${c.bold(String(count))}`);
        }
      }
      return;
    }

    // Subcommand: audit summary — combined audit report
    if (sub === 'summary') {
      const { auditFiles } = loadAuditBackend();
      const { smellFiles } = require('../../audit/smell-checkers');
      const { lintFiles } = require('../../audit/lint-checkers');
      const { scorePrior } = require('../../audit/bayesian-prior');
      const baselineMod = require('../../audit/baseline');
      const { summarizeStore } = require('../../audit/feedback');
      const { buildSummary, recordRun, loadHistory } = require('../../audit/rich-summary');
      const repoRoot = process.cwd();

      // Collect files: prefer tracked files, fall back to src/
      let files = [];
      try {
        const tracked = execSync('git ls-files "*.js" "*.mjs" "*.cjs" 2>/dev/null', { encoding: 'utf-8' })
          .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules')).slice(0, 300);
        files = tracked;
      } catch (_) { /* empty */ }

      // Run all three analyses in one pass
      const bugResult = auditFiles(files);
      const smellResult = smellFiles(files);
      const lintResult = lintFiles(files);

      const bugFlat = [];
      for (const fr of bugResult.files || []) {
        for (const f of fr.findings) bugFlat.push({ ...f, file: fr.file });
      }
      const smellFlat = [];
      for (const fr of smellResult.files || []) {
        for (const f of fr.findings) smellFlat.push({ ...f, file: fr.file });
      }
      const lintFlat = [];
      for (const fr of lintResult.files || []) {
        for (const f of fr.findings) lintFlat.push({ ...f, file: fr.file });
      }

      // Bayesian prior (top files only, it's cheap but let's cap)
      const priorFlat = [];
      for (const f of files.slice(0, 100)) {
        try {
          const src = fs.readFileSync(f, 'utf-8');
          const found = scorePrior(src, f);
          for (const fnd of found) priorFlat.push({ ...fnd, file: f });
        } catch { /* skip */ }
      }

      // Baseline diff
      const baselinePath = baselineMod.resolveBaselinePath(repoRoot);
      const baseline = baselineMod.readBaseline(baselinePath);
      const findingsByFile = {};
      for (const fr of bugResult.files || []) findingsByFile[fr.file] = fr.findings;
      const diff = baseline ? baselineMod.diffAgainstBaseline(baseline, findingsByFile, repoRoot) : null;

      // Feedback calibration state
      const calibration = summarizeStore(repoRoot);

      // Healing stats (best-effort)
      let healing = null;
      try {
        const oracleHealing = oracle.healing || (oracle.store && oracle.store.getSQLiteStore()?.getAllHealingStats?.());
        if (oracleHealing) {
          const stats = Array.isArray(oracleHealing) ? oracleHealing : [oracleHealing];
          let attempts = 0, succeeded = 0;
          for (const s of stats) {
            attempts += s.attempts || 0;
            succeeded += s.succeeded || 0;
          }
          if (attempts > 0) healing = { attempts, succeeded };
        }
      } catch { /* no healing data */ }

      const history = loadHistory(repoRoot);
      const rich = buildSummary({
        findings: bugFlat,
        smellFindings: smellFlat,
        lintFindings: lintFlat,
        priorFindings: priorFlat,
        diff: diff || undefined,
        calibration,
        healing,
        history,
      });
      // Record for trend tracking
      try { recordRun(repoRoot, bugFlat); } catch { /* non-fatal */ }

      if (args.json === true) { console.log(JSON.stringify(rich, null, 2)); return; }

      console.log(c.boldCyan('Audit Summary\n'));
      console.log(c.bold('  Totals:'));
      console.log(`    Bugs:          ${rich.totals.bugs > 0 ? c.boldRed(String(rich.totals.bugs)) : c.boldGreen('0')}`);
      console.log(`    Style hints:   ${c.dim(String(rich.totals.styleHints))}`);
      console.log(`    Smells:        ${c.dim(String(rich.totals.smells))}`);
      console.log(`    Prior risks:   ${c.dim(String(rich.totals.priorRisks))}`);

      if (rich.breakdown.topBugClasses.length > 0) {
        console.log('\n' + c.bold('  Top bug classes:'));
        for (const { cls, count } of rich.breakdown.topBugClasses) {
          console.log(`    ${c.cyan(cls.padEnd(20))} ${c.bold(String(count))}`);
        }
      }
      if (rich.breakdown.topRules.length > 0) {
        console.log('\n' + c.bold('  Top rules:'));
        for (const { rule, count } of rich.breakdown.topRules.slice(0, 5)) {
          console.log(`    ${c.cyan(rule.padEnd(32))} ${c.bold(String(count))}`);
        }
      }

      if (rich.baseline.hasBaseline) {
        console.log('\n' + c.bold('  Baseline diff:'));
        console.log(`    New:          ${rich.baseline.newSinceBaseline > 0 ? c.yellow(String(rich.baseline.newSinceBaseline)) : c.dim('0')}`);
        console.log(`    Fixed:        ${rich.baseline.fixedSinceBaseline > 0 ? c.green(String(rich.baseline.fixedSinceBaseline)) : c.dim('0')}`);
        console.log(`    Persisted:    ${c.dim(String(rich.baseline.persistedFromBaseline))}`);
        if (rich.baseline.regressedFiles.length > 0) {
          console.log(c.bold('  Regressed files:'));
          for (const f of rich.baseline.regressedFiles.slice(0, 10)) console.log(`    ${c.red(f)}`);
        }
        if (rich.baseline.improvedFiles.length > 0) {
          console.log(c.bold('  Improved files:'));
          for (const f of rich.baseline.improvedFiles.slice(0, 10)) console.log(`    ${c.green(f)}`);
        }
      } else {
        console.log(c.dim('\n  No baseline — run `oracle audit baseline` to snapshot current state.'));
      }

      if (rich.worstFiles.length > 0) {
        console.log('\n' + c.bold('  Worst files:'));
        for (const { file, count } of rich.worstFiles.slice(0, 5)) {
          console.log(`    ${c.cyan(String(count).padStart(3))} ${c.dim(file)}`);
        }
      }

      if (rich.healing) {
        const rate = (rich.healing.successRate * 100).toFixed(0);
        console.log('\n' + c.bold('  Healing:'));
        console.log(`    ${rich.healing.succeeded}/${rich.healing.attempts} (${rate}%) fixes succeeded`);
      }

      if (rich.calibration.downgradedRules.length > 0) {
        console.log('\n' + c.bold('  Calibration:'));
        console.log(`    ${c.dim(String(rich.calibration.downgradedRules.length) + ' rule(s) downgraded based on feedback')}`);
        for (const r of rich.calibration.downgradedRules.slice(0, 5)) {
          console.log(`    ${c.cyan(r.ruleId.padEnd(32))} conf=${r.confidence.toFixed(2)}`);
        }
      }

      if (rich.trend.recent.length > 0) {
        const arrow = rich.trend.direction === 'up' ? c.red('\u2191')
                    : rich.trend.direction === 'down' ? c.green('\u2193')
                    : c.dim('\u2192');
        console.log('\n' + c.bold(`  Trend: ${arrow} delta ${rich.trend.delta >= 0 ? '+' : ''}${rich.trend.delta}`));
      }

      console.log('');
      return;
    }

    // Subcommand: audit cross-file — real call-graph cascade analysis.
    // This loads every changed file, builds a shared call graph, runs
    // nullability inference across it, and reports call sites that
    // dereference a nullable-return function without a guard — even
    // when the caller and callee are in different files.
    if (sub === 'cross-file' || sub === 'crossfile') {
      const { parseProgram } = require('../../audit/parser');
      const { inferNullability, mergeProjectNullability } = require('../../audit/type-inference');
      const { buildCallGraph, findNullDerefCascades } = require('../../audit/call-graph');

      let files = [];
      const targetFile = args.file || args._positional[1];
      if (targetFile) {
        files = [targetFile];
      } else {
        try {
          const tracked = execSync('git ls-files "*.js" "*.mjs" "*.cjs" 2>/dev/null', { encoding: 'utf-8' })
            .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules') && !f.includes('/tests/'));
          files = tracked.slice(0, 200); // cap at 200 files for time
        } catch (_) { /* empty */ }
      }

      if (files.length === 0) {
        console.log(c.yellow('No files to analyze.'));
        return;
      }

      const parsed = [];
      const parsedByFile = new Map();
      for (const f of files) {
        try {
          const src = fs.readFileSync(f, 'utf-8');
          const program = parseProgram(src);
          parsed.push({ file: f, program });
          parsedByFile.set(f, program);
        } catch (_) { /* skip parse errors */ }
      }

      const graph = buildCallGraph(parsed);
      const perFile = parsed.map(({ program }) => inferNullability(program));
      const nullability = mergeProjectNullability(perFile);
      const findings = findNullDerefCascades(graph, nullability, parsedByFile);

      if (args.json === true) { console.log(JSON.stringify({ findings, stats: { files: parsed.length, functions: graph.defs.size } })); return; }

      console.log(c.boldCyan(`Cross-File Cascade Analysis \u2014 ${parsed.length} files, ${graph.defs.size} function(s)\n`));
      if (findings.length === 0) {
        console.log(c.boldGreen('  \u2713 No cross-file nullable-deref cascades found.\n'));
        return;
      }
      console.log(c.boldRed(`  ${findings.length} cross-file cascade(s):\n`));
      for (const f of findings) {
        console.log(`  ${c.bold(f.file)}:${f.line}`);
        console.log(`    ${c.dim('Assumes:')} ${f.assumption}`);
        console.log(`    ${c.dim('Reality:')} ${f.reality}`);
        console.log(`    ${c.dim('Fix:')}     ${f.suggestion}`);
      }
      return;
    }

    // ─── Subcommand: audit baseline ───────────────────────────────────
    // Snapshot current findings. Subsequent `audit check` runs hide
    // everything already in the baseline and only report new findings.
    if (sub === 'baseline') {
      const baselineMod = require('../../audit/baseline');
      const { auditFiles } = loadAuditBackend();
      const repoRoot = process.cwd();
      const baselinePath = baselineMod.resolveBaselinePath(repoRoot);

      if (args.show === true || args.show === 'true') {
        const existing = baselineMod.readBaseline(baselinePath);
        if (args.json === true) { console.log(JSON.stringify(existing || {})); return; }
        if (!existing) { console.log(c.yellow('No baseline exists.')); return; }
        console.log(c.boldCyan('Baseline'));
        console.log(`  Created:  ${existing.createdAt}`);
        console.log(`  Total:    ${existing.totalFindings}`);
        console.log(`  Files:    ${Object.keys(existing.files).length}`);
        return;
      }

      if (args.clear === true || args.clear === 'true') {
        if (fs.existsSync(baselinePath)) fs.unlinkSync(baselinePath);
        console.log(c.yellow('Baseline cleared.'));
        return;
      }

      // Default: snapshot current findings
      let files = [];
      try {
        const tracked = execSync('git ls-files "*.js" "*.mjs" "*.cjs" 2>/dev/null', { encoding: 'utf-8' })
          .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules'));
        files = tracked;
      } catch (_) { /* empty */ }
      if (files.length === 0) {
        console.log(c.yellow('No files found to baseline.'));
        return;
      }
      const result = auditFiles(files);
      const findingsByFile = {};
      for (const fr of result.files || []) findingsByFile[fr.file] = fr.findings;
      const baseline = baselineMod.buildBaseline(findingsByFile, repoRoot);
      baselineMod.writeBaseline(baseline, baselinePath);
      console.log(c.boldGreen(`Baseline written: ${baselinePath}`));
      console.log(`  ${baseline.totalFindings} finding(s) across ${Object.keys(baseline.files).length} file(s).`);
      console.log(c.dim(`  Future \`audit check\` runs will hide these and only report new findings.`));
      console.log(c.dim(`  To rebuild: \`oracle audit baseline\` again, or delete with \`--clear\`.`));
      return;
    }

    // ─── Subcommand: audit explain <rule> ─────────────────────────────
    if (sub === 'explain') {
      const { explain, listRules } = require('../../audit/explain');
      const ruleId = args.rule || args._positional[1];
      if (!ruleId) {
        // List all rules
        const category = args.category || null;
        const rules = listRules(category);
        if (args.json === true) { console.log(JSON.stringify(rules)); return; }
        console.log(c.boldCyan(`Audit rules (${rules.length}):\n`));
        const groups = { bug: [], style: [], smell: [] };
        for (const r of rules) (groups[r.category] || []).push(r);
        for (const g of ['bug', 'style', 'smell']) {
          if (groups[g].length === 0) continue;
          console.log(c.bold(`  ${g.toUpperCase()}:`));
          for (const r of groups[g]) {
            const sev = r.severity === 'high' ? c.red : r.severity === 'medium' ? c.yellow : c.dim;
            console.log(`    ${sev((r.severity || 'info').padEnd(6))} ${c.cyan(r.ruleId.padEnd(32))} ${c.dim(r.summary)}`);
          }
          console.log('');
        }
        console.log(c.dim('  Use `oracle audit explain <rule>` for a worked example.'));
        return;
      }
      const info = explain(ruleId);
      if (args.json === true) { console.log(JSON.stringify(info || {})); return; }
      if (!info) {
        console.log(c.yellow(`Unknown rule: ${ruleId}`));
        console.log(c.dim('  Run `oracle audit explain` to list all rules.'));
        return;
      }
      console.log(c.boldCyan(`${ruleId}`));
      console.log(c.dim(`  category: ${info.category}  severity: ${info.severity}`));
      console.log('');
      console.log(c.bold('  Summary:'));
      console.log(`    ${info.summary}`);
      console.log('');
      console.log(c.bold('  Why it matters:'));
      console.log(`    ${info.why}`);
      console.log('');
      console.log(c.bold('  Bad:'));
      for (const line of info.bad.split('\n')) console.log(c.red(`    ${line}`));
      console.log('');
      console.log(c.bold('  Good:'));
      for (const line of info.good.split('\n')) console.log(c.green(`    ${line}`));
      console.log('');
      // Surface matching library patterns via the secondary indexes.
      // We look up by both ruleId (the explain key) and patternTag
      // so authors can associate patterns either way.
      try {
        const library = oracle.patterns;
        const matches = new Set();
        if (typeof library.findByRuleId === 'function') {
          for (const p of library.findByRuleId(ruleId)) matches.add(p);
        }
        if (info.patternTag && typeof library.findByTag === 'function') {
          for (const p of library.findByTag(info.patternTag)) matches.add(p);
        }
        if (matches.size > 0) {
          console.log(c.bold('  Library patterns:'));
          for (const p of Array.from(matches).slice(0, 3)) {
            console.log(`    ${c.cyan(p.name)} (${c.dim(p.language || 'unknown')})`);
          }
          if (info.patternTag) {
            console.log(c.dim('  Pull with: `oracle resolve --description "..." --tag ' + info.patternTag + '`'));
          }
        }
      } catch { /* no library */ }
      return;
    }

    // ─── Subcommand: audit feedback ───────────────────────────────────
    // Record fix/dismiss events against a rule. Used for severity calibration.
    if (sub === 'feedback') {
      const { recordFeedback, summarizeStore } = require('../../audit/feedback');
      const action = args.action || args._positional[1]; // 'fix' | 'dismiss' | 'show'
      const ruleId = args.rule || args._positional[2];
      const repoRoot = process.cwd();

      if (!action || action === 'show') {
        const summary = summarizeStore(repoRoot);
        if (args.json === true) { console.log(JSON.stringify(summary)); return; }
        console.log(c.boldCyan(`Audit feedback (${summary.total} rule(s) observed):\n`));
        for (const row of summary.rules) {
          const conf = row.confidence == null ? '—' : row.confidence.toFixed(2);
          const sev = row.confidence != null && row.confidence < 0.4 ? c.red
            : row.confidence != null && row.confidence < 0.7 ? c.yellow : c.dim;
          console.log(`  ${c.cyan(row.ruleId.padEnd(32))} fixed=${row.fixed} dismissed=${row.dismissed} conf=${sev(conf)}`);
        }
        return;
      }

      if (action !== 'fix' && action !== 'dismiss') {
        console.log(c.yellow('Usage: oracle audit feedback fix|dismiss <ruleId> [--file <path> --line <n>]'));
        return;
      }
      if (!ruleId) {
        console.log(c.yellow('Usage: oracle audit feedback ' + action + ' <ruleId>'));
        return;
      }
      const rule = recordFeedback(repoRoot, action, ruleId, { file: args.file, line: args.line });
      console.log(c.boldGreen(`Recorded: ${ruleId} ${action}ed`));
      if (rule) {
        console.log(c.dim(`  fixed=${rule.fixed} dismissed=${rule.dismissed}`));
      }
      return;
    }

    // ─── Subcommand: audit prior ──────────────────────────────────────
    // Run the Bayesian bug-prior risk signal against files.
    if (sub === 'prior') {
      const { scorePrior, loadPrior } = require('../../audit/bayesian-prior');
      const targetFile = args.file || args._positional[1];
      if (args.show === true || args.show === 'true') {
        const prior = loadPrior();
        console.log(c.boldCyan(`Bayesian bug-prior (${prior.patterns?.length || 0} entries):\n`));
        for (const e of (prior.patterns || [])) {
          console.log(`  ${c.cyan(e.name)} (${e.language || 'any'}) prior=${(e.priorBugRate || 0).toFixed(2)}`);
          console.log(`    ${c.dim(e.suggestion || '')}`);
        }
        return;
      }
      let files = [];
      if (targetFile) files = [targetFile];
      else {
        try {
          const tracked = execSync('git ls-files "*.js" 2>/dev/null', { encoding: 'utf-8' })
            .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules')).slice(0, 100);
          files = tracked;
        } catch { /* empty */ }
      }
      const allFindings = [];
      for (const f of files) {
        try {
          const src = fs.readFileSync(f, 'utf-8');
          const found = scorePrior(src, f);
          for (const fnd of found) allFindings.push({ ...fnd, file: f });
        } catch { /* skip */ }
      }
      if (args.json === true) { console.log(JSON.stringify(allFindings)); return; }
      if (allFindings.length === 0) {
        console.log(c.boldGreen('  \u2713 No bug-prior matches.'));
        return;
      }
      console.log(c.boldCyan(`Bug-prior matches (${allFindings.length}):\n`));
      for (const f of allFindings) {
        const sev = f.severity === 'medium' ? c.yellow : c.dim;
        console.log(`  ${sev(f.severity.toUpperCase().padEnd(6))} ${c.bold(f.file)}  (${c.dim(f.evidence.matchedPattern)} sim=${f.evidence.similarity.toFixed(2)})`);
        console.log(`    ${c.dim(f.suggestion)}`);
      }
      return;
    }

    // ─── Subcommand: audit prior-promote ──────────────────────────────
    // Walk the debug oracle and promote high-amplitude bug patterns
    // into the Bayesian bug-prior seed file. Closes the substrate ↔
    // prior learning loop — the prior strengthens as the debug
    // oracle's quantum field learns.
    if (sub === 'prior-promote' || sub === 'promote-prior') {
      const { promoteFromSubstrate } = require('../../audit/prior-promoter');
      const opts = {
        amplitudeThreshold: args.threshold ? Number(args.threshold) : 0.7,
        maxPromote: args['max-promote'] ? Number(args['max-promote']) : 50,
        dryRun: args['dry-run'] === true || args['dry-run'] === 'true',
      };
      const result = promoteFromSubstrate(oracle, opts);
      if (args.json === true) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(c.boldCyan('Bayesian bug-prior promotion'));
      console.log(`  Considered: ${result.considered}`);
      console.log(`  Promoted:   ${result.promoted > 0 ? c.boldGreen(String(result.promoted)) : c.dim('0')}`);
      console.log(`  Updated:    ${result.updated > 0 ? c.yellow(String(result.updated)) : c.dim('0')}`);
      console.log(`  Skipped:    ${c.dim(String(result.skipped))}`);
      if (result.dryRun) console.log(c.yellow('  DRY RUN — seed file not written'));
      if (result.reason) console.log(c.dim('  ' + result.reason));
      if (result.entries.length > 0) {
        console.log('');
        for (const e of result.entries.slice(0, 10)) {
          const icon = e.action === 'promote' ? c.green('+') : c.yellow('~');
          console.log(`  ${icon} ${c.cyan(e.name)}  amp=${(e.amplitude || 0).toFixed(2)}  prior=${e.priorBugRate.toFixed(2)}`);
        }
      }
      return;
    }

    // Subcommand: audit xref — cross-reference findings with debug patterns
    if (sub === 'xref') {
      const { auditFiles } = loadAuditBackend();
      const { crossReference, crossReferenceSummary } = require('../../audit/cross-reference');

      let files = [];
      const targetFile = args.file || args._positional[1];
      if (targetFile) {
        files = [targetFile];
      } else {
        try {
          const changed = execSync('git diff HEAD~1 --name-only --diff-filter=ACM 2>/dev/null', { encoding: 'utf-8' })
            .trim().split('\n').filter(f => /\.(js|ts)$/.test(f) && f.trim());
          files = changed;
        } catch (_) { /* empty */ }
      }

      if (files.length === 0) {
        console.log(c.yellow('No files to cross-reference.'));
        return;
      }

      const result = auditFiles(files);
      const allFindings = result.files.flatMap(f => f.findings);
      const enriched = crossReference(allFindings, oracle);
      const summary = crossReferenceSummary(enriched);

      if (args.json === true) { console.log(JSON.stringify({ findings: enriched, summary })); return; }

      console.log(c.boldCyan(`Cross-Reference Report \u2014 ${files.length} file(s)\n`));
      console.log(`  Findings:    ${c.bold(String(summary.totalFindings))}`);
      console.log(`  With fixes:  ${summary.withFixes > 0 ? c.boldGreen(String(summary.withFixes)) : c.dim('0')}`);
      console.log(`  Fix rate:    ${c.bold(summary.fixRate)}\n`);

      if (summary.actionable.length > 0) {
        console.log(c.bold('  Actionable items:'));
        for (const item of summary.actionable) {
          console.log(`    L${String(item.line).padStart(4)} [${c.cyan(item.bugClass)}]`);
          console.log(`      ${c.dim('Issue:')}  ${item.assumption}`);
          console.log(`      ${c.dim('Fix:')}    ${c.green(item.topFix.fixDescription || item.topFix.fixCode?.slice(0, 80) || 'available')}`);
          console.log(`      ${c.dim('Source:')} ${item.topFix.errorMessage || 'debug pattern'} (amplitude: ${c.bold(String((item.topFix.amplitude || 0).toFixed(2)))})`);
          if (item.alternativeFixes > 0) console.log(`      ${c.dim(`+${item.alternativeFixes} alternative(s)`)}`);
        }
        console.log('');
      }

      if (Object.keys(summary.coverage).length > 0) {
        console.log(c.bold('  Coverage by bug class:'));
        for (const [cls, cov] of Object.entries(summary.coverage)) {
          const rate = cov.total > 0 ? (cov.withFix / cov.total * 100).toFixed(0) : '0';
          console.log(`    ${c.cyan(cls.padEnd(16))} ${cov.withFix}/${cov.total} (${rate}%)`);
        }
      }
      return;
    }

    // Default: show audit log (existing behavior)
    const sqliteStore = oracle.store.getSQLiteStore();
    if (!sqliteStore) {
      console.log(c.yellow('Audit log requires SQLite backend.'));
      return;
    }

    // If no subcommand, show help for new audit commands
    if (!sub) {
      console.log(`
${c.boldCyan('Audit Commands')} \u2014 bug detection (AST-based, zero dependencies)

${c.bold('Subcommands:')}
  ${c.cyan('audit check')}       Run static checkers on files (6 bug classes)
  ${c.cyan('audit baseline')}    Snapshot current findings as known-debt
  ${c.cyan('audit explain')}     Worked example for a rule, good + bad
  ${c.cyan('audit feedback')}    Record fix/dismiss events for severity calibration
  ${c.cyan('audit prior')}       Bayesian bug-prior risk signal (substrate-driven)
  ${c.cyan('audit cascade')}     Detect cascading mismatches from a commit (diff-based)
  ${c.cyan('audit cross-file')}  Real call-graph analysis across the project
  ${c.cyan('audit xref')}        Cross-reference findings with debug pattern fixes
  ${c.cyan('audit summary')}     Rich summary (totals + baseline diff + trend + healing)
  ${c.cyan('audit log')}         Show audit log entries (default)

${c.bold('Check flags:')}
  ${c.yellow('--file')} <path>        Specific file to check
  ${c.yellow('--auto-fix')}           Apply confident fixes in-place
  ${c.yellow('--dry-run')}            With --auto-fix, show patches without writing
  ${c.yellow('--no-baseline')}        Do not hide findings already in the baseline
  ${c.yellow('--no-calibrate')}       Skip feedback-driven severity calibration
  ${c.yellow('--bug-class')} <class>  Filter by bug class
  ${c.yellow('--min-severity')} <s>   Minimum severity (high,medium,low)
  ${c.yellow('--json')}               JSON output

${c.bold('Explain flags:')}
  ${c.yellow('<ruleId>')}             Show the worked example for one rule
  ${c.yellow('--category')} <c>       Filter list by bug|style|smell

${c.bold('Feedback flags:')}
  ${c.cyan('oracle audit feedback show')}                List current calibration state
  ${c.cyan('oracle audit feedback fix <ruleId>')}        Mark a rule as a true positive
  ${c.cyan('oracle audit feedback dismiss <ruleId>')}    Mark a rule as a false positive

${c.bold('Baseline flags:')}
  ${c.yellow('--show')}                Show current baseline contents
  ${c.yellow('--clear')}               Delete the baseline

${c.bold('Suppression:')}
  Inline:   ${c.dim('// oracle-ignore-next-line: type')}
  File:     ${c.dim('// oracle-ignore-file: security')}
  Project:  ${c.dim('.oracle-ignore file with glob patterns')}

${c.bold('Backend:')}
  Default is AST-based. Set ${c.yellow('ORACLE_AUDIT_BACKEND=regex')} to use the legacy checker.

${c.bold('Related commands:')}
  ${c.cyan('oracle lint')}        Style checks (parameter validation, TODOs, var)
  ${c.cyan('oracle smell')}       Architectural smells (long fns, deep nesting, god files)
      `);
      return;
    }

    if (sub === 'log') {
      // Original audit log behavior
      const entries = sqliteStore.getAuditLog({
        limit: parseInt(args.limit, 10) || 20,
        table: args.table,
        id: args.id,
        action: args.action,
      });
      if (entries.length === 0) {
        console.log(c.yellow('No audit log entries found.'));
      } else {
        console.log(c.boldCyan(`Audit Log (${entries.length} entries):\n`));
        for (const e of entries) {
          const actionColor = e.action === 'add' ? c.green : e.action === 'prune' || e.action === 'retire' ? c.red : c.yellow;
          console.log(`  ${c.dim(e.timestamp)} ${actionColor(e.action.padEnd(7))} ${c.cyan(e.table.padEnd(8))} ${c.dim(e.id)} ${c.dim(JSON.stringify(e.detail))}`);
        }
      }
      return;
    }

    console.error(c.boldRed('Error:') + ` Unknown audit subcommand: ${sub}. Run ${c.cyan('oracle audit')} for help.`);
  };

  // `oracle lint` — style / opinion checks that used to live as low-severity
  // findings in `audit check`. These are NOT bugs — they're conventions
  // you opt into. Split out so the bug audit stays focused on real bugs.
  handlers['lint'] = (args) => {
    const { lintFiles } = require('../../audit/lint-checkers');
    const targetFile = args.file || args._positional[1];

    let files = [];
    if (targetFile) {
      files = [targetFile];
    } else {
      try {
        const staged = execSync('git diff --cached --name-only --diff-filter=ACM 2>/dev/null || git diff HEAD~1 --name-only --diff-filter=ACM 2>/dev/null', { encoding: 'utf-8' })
          .trim().split('\n').filter(f => /\.(js|ts|mjs|cjs)$/.test(f) && f.trim());
        files = staged;
      } catch (_) { /* empty */ }
    }

    if (files.length === 0) {
      console.log(c.yellow('No files to lint. Specify --file or have staged changes.'));
      return;
    }

    const result = lintFiles(files);
    if (args.json === true) { console.log(JSON.stringify(result)); return; }

    console.log(c.boldCyan(`Lint \u2014 ${result.summary.filesScanned} files scanned\n`));

    if (result.totalFindings === 0) {
      console.log(c.boldGreen('  \u2713 No lint findings.\n'));
      return;
    }

    console.log(c.bold(`  ${result.totalFindings} finding(s):\n`));
    for (const fileResult of result.files) {
      console.log(`  ${c.bold(fileResult.file)}:`);
      for (const f of fileResult.findings) {
        const sevColor = f.severity === 'warn' ? c.yellow : c.dim;
        console.log(`    ${sevColor((f.severity || 'info').toUpperCase().padEnd(5))} L${String(f.line).padStart(4)} [${c.cyan(f.ruleId)}]`);
        console.log(`      ${f.message}`);
        if (f.suggestion) console.log(`      ${c.dim('Fix:')}  ${f.suggestion}`);
      }
      console.log('');
    }

    console.log(c.bold('  Summary:'));
    for (const [rule, count] of Object.entries(result.summary.byRule)) {
      console.log(`    ${c.cyan(rule.padEnd(28))} ${c.bold(String(count))}`);
    }
  };

  // `oracle risk-score` — file-level bug-probability score. Combines
  // Oracle's semantic coherency (ρ = -0.30 vs audit findings) and
  // cyclomatic complexity (ρ = +0.35) into a 0..1 probability with
  // a risk level (LOW|MEDIUM|HIGH), component breakdown, and
  // actionable recommendations. See docs/benchmarks/risk-score-
  // phase2.md for the empirical basis.
  handlers['risk-score'] = (args) => {
    const { computeBugProbability } = require('../../quality/risk-score');
    const targetFile = args.file || args._positional[1];
    if (!targetFile) {
      console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle risk-score <file>')} [--json]`);
      process.exit(1);
    }
    const fs = require('fs');
    if (!fs.existsSync(targetFile)) {
      console.error(c.boldRed('Error:') + ` File not found: ${targetFile}`);
      process.exit(1);
    }
    const code = fs.readFileSync(targetFile, 'utf-8');
    const result = computeBugProbability(code, { filePath: targetFile });
    if (jsonOut()) { console.log(JSON.stringify(result)); return; }

    const color =
      result.riskLevel === 'HIGH'   ? c.boldRed   :
      result.riskLevel === 'MEDIUM' ? c.boldYellow :
      c.boldGreen;
    console.log('');
    console.log(`${c.boldCyan('Risk score —')} ${c.bold(targetFile)}`);
    console.log(`  ${color(result.riskLevel.padEnd(6))}  probability: ${c.bold(result.probability.toFixed(4))}`);
    console.log('');
    console.log(c.bold('  Components:'));
    console.log(`    coherency risk:  ${result.components.coherencyRisk.toFixed(4)}`);
    console.log(`    cyclomatic risk: ${result.components.cyclomaticRisk.toFixed(4)}`);
    console.log('');
    console.log(c.bold('  Signals:'));
    console.log(`    total coherency:   ${result.signals.totalCoherency}`);
    console.log(`    cyclomatic:        ${result.signals.cyclomatic}`);
    console.log(`    max depth:         ${result.signals.maxDepth}`);
    console.log(`    lines:             ${result.signals.lines}`);
    console.log(`    fractal alignment: ${result.signals.fractalAlignment}`);
    console.log('');
    if (result.topFactors.length > 0) {
      console.log(c.bold('  Top risk factors:'));
      for (const f of result.topFactors) {
        console.log(`    ${c.yellow('•')} ${c.bold(f.name)}  severity: ${f.severity.toFixed(3)}`);
        console.log(`      ${c.dim(f.message)}`);
      }
      console.log('');
    }
    if (result.recommendations.length > 0) {
      console.log(c.bold('  Recommendations:'));
      for (const rec of result.recommendations) {
        console.log(`    ${c.cyan('→')} ${rec}`);
      }
      console.log('');
    }
  };

  // `oracle risk-scan` — batch risk scan across a directory tree.
  // Walks the tree, scores every source file, and reports the
  // distribution + top N worst offenders. Excludes node_modules,
  // .git, .remembrance, dist, build, and digital-cathedral (which
  // holds intentionally-buggy fixtures) by default.
  handlers['risk-scan'] = (args) => {
    const { scanDirectory } = require('../../quality/risk-scanner');
    const targetDir = args.dir || args._positional[1] || process.cwd();
    const topN = Number(args.top) || 10;
    const filter = args.filter || null; // 'HIGH' | 'MEDIUM' | 'LOW'

    const report = scanDirectory(targetDir, {
      topN,
      onFile: args.verbose
        ? (file, idx, total) => console.error(c.dim(`[${idx}/${total}] ${file}`))
        : null,
    });

    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    if (report.error) {
      console.error(c.boldRed('Error:') + ' ' + report.error);
      process.exit(1);
    }

    console.log('');
    console.log(`${c.boldCyan('Risk scan —')} ${c.bold(report.root)}`);
    console.log(`  ${c.dim(report.scannedAt)}`);
    console.log('');
    console.log(c.bold('  Summary:'));
    console.log(`    files scanned:      ${report.stats.total}`);
    console.log(`    mean probability:   ${report.stats.meanProbability.toFixed(4)}`);
    console.log(`    median probability: ${report.stats.medianProbability.toFixed(4)}`);
    console.log('');
    console.log(c.bold('  By risk level:'));
    console.log(`    ${c.boldRed('HIGH  ')}  ${String(report.stats.byRisk.HIGH).padStart(4)}`);
    console.log(`    ${c.boldYellow('MEDIUM')}  ${String(report.stats.byRisk.MEDIUM).padStart(4)}`);
    console.log(`    ${c.boldGreen('LOW   ')}  ${String(report.stats.byRisk.LOW).padStart(4)}`);
    if (report.stats.byRisk.SKIPPED > 0) {
      console.log(`    ${c.dim('SKIPPED')} ${String(report.stats.byRisk.SKIPPED).padStart(4)}  ${c.dim('(unparseable / empty)')}`);
    }
    console.log('');

    const toShow = filter
      ? report.files.filter(f => f.riskLevel === filter.toUpperCase()).slice(0, topN)
      : report.stats.top;

    if (toShow.length > 0) {
      const label = filter ? `All ${filter.toUpperCase()} files (top ${topN}):` : `Top ${topN} worst offenders:`;
      console.log(c.bold(`  ${label}`));
      for (const f of toShow) {
        const color =
          f.riskLevel === 'HIGH'   ? c.red   :
          f.riskLevel === 'MEDIUM' ? c.yellow :
          c.green;
        console.log(`    ${color(f.riskLevel.padEnd(6))} ${c.bold(f.probability.toFixed(4))}  ${f.file}  ${c.dim('cyc:' + f.signals.cyclomatic + ' lines:' + f.signals.lines)}`);
      }
      console.log('');
    }
  };

  // `oracle void-scan` — sliding-window Void coherence diagnostic.
  // Calls Void Compressor's /coherence endpoint on each window and
  // surfaces the regions with the lowest coherence. DIAGNOSTIC ONLY:
  // the empirical study in docs/benchmarks/ found this hits known
  // bugs ~33% of the time, not enough to be a detector, but enough
  // to be a useful "weirdest regions of this file" signal.
  handlers['void-scan'] = async (args) => {
    const targetFile = args.file || args._positional[1];
    if (!targetFile) {
      console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle void-scan <file>')} [--window 20] [--stride 5] [--top 5]`);
      process.exit(1);
    }
    if (!process.env.VOID_API_KEY) {
      console.error(c.boldRed('Error:') + ' VOID_API_KEY is not set. Start Void and export a key.');
      process.exit(1);
    }
    const { voidScanFile } = require('../../audit/void-scan');
    const result = await voidScanFile(targetFile, {
      windowLines: Number(args.window) || 20,
      stride: Number(args.stride) || 5,
      topN: Number(args.top) || 5,
    });
    if (jsonOut()) { console.log(JSON.stringify(result)); return; }
    if (result.error) {
      console.error(c.boldRed('Error:') + ' ' + result.error);
      process.exit(1);
    }
    console.log(c.boldCyan(`Void-scan — ${result.file}`));
    console.log(`  ${result.totalLines} lines, ${result.windowsScored} windows scored\n`);
    console.log(c.dim('  DIAGNOSTIC: low coherence = unfamiliar to Void substrate, NOT always a bug.\n'));
    console.log(c.bold(`  Lowest-coherence windows (${result.candidates.length}):`));
    for (const w of result.candidates) {
      console.log(`    ${c.yellow('L' + String(w.startLine).padStart(4) + '-' + String(w.endLine).padEnd(4))}  coh: ${c.bold(w.coherence.toFixed(4))}  bytes: ${w.bytes}  ratio: ${w.voidRatio}x`);
    }
    console.log('');
  };

  // `oracle smell` — architectural smell detectors. These are structural
  // hints (long functions, deep nesting, too many params, god files,
  // feature envy) that aren't bugs but suggest maintainability trouble.
  handlers['smell'] = (args) => {
    const { smellFiles } = require('../../audit/smell-checkers');
    const targetFile = args.file || args._positional[1];
    let files = [];
    if (targetFile) files = [targetFile];
    else {
      try {
        const tracked = execSync('git ls-files "*.js" "*.mjs" "*.cjs" 2>/dev/null', { encoding: 'utf-8' })
          .trim().split('\n').filter(f => f.trim() && !f.includes('node_modules'));
        files = tracked;
      } catch (_) { /* empty */ }
    }
    if (files.length === 0) {
      console.log(c.yellow('No files found.'));
      return;
    }

    // Parse --threshold k=v flags
    const thresholds = {};
    if (args.threshold) {
      const parts = (Array.isArray(args.threshold) ? args.threshold : [args.threshold]);
      for (const p of parts) {
        const [k, v] = String(p).split('=');
        if (k && v != null) thresholds[k] = Number(v) || v;
      }
    }

    const result = smellFiles(files, { thresholds });
    if (args.json === true) { console.log(JSON.stringify(result)); return; }

    console.log(c.boldCyan(`Smell \u2014 ${result.summary.filesScanned} files scanned\n`));
    if (result.totalFindings === 0) {
      console.log(c.boldGreen('  \u2713 No smells found.\n'));
      return;
    }
    console.log(c.bold(`  ${result.totalFindings} finding(s):\n`));
    for (const fileResult of result.files) {
      console.log(`  ${c.bold(fileResult.file)}:`);
      for (const f of fileResult.findings) {
        console.log(`    ${c.dim('INFO ')} L${String(f.line).padStart(4)} [${c.cyan(f.ruleId)}]`);
        console.log(`      ${f.message}`);
        if (f.suggestion) console.log(`      ${c.dim('Fix:')}  ${f.suggestion}`);
      }
      console.log('');
    }
    console.log(c.bold('  Summary:'));
    for (const [rule, count] of Object.entries(result.summary.byRule)) {
      console.log(`    ${c.cyan(rule.padEnd(28))} ${c.bold(String(count))}`);
    }
  };

  // `oracle history` — unified event timeline across every subsystem.
  // Reads from the history namespace populated by src/core/events via
  // wireHistory. Supports --type, --prefix, --since, --until, --limit.
  // `oracle session` — compliance ledger for agent / human sessions.
  // Makes the CLAUDE.md mandates operational: start / status / end /
  // bypass / record. The pre-commit hook reads from this ledger and
  // blocks commits when ORACLE_WORKFLOW=enforce is set and
  // compliance is incomplete.
  // `oracle ecosystem` — discover peer modules (Oracle, Void, Reflector,
  // Swarm, Dialer, API Key Plugger) and auto-wire any that are alive.
  // Layer 1: static manifests (filesystem walk for remembrance.json)
  // Layer 2: runtime registry (~/.remembrance/modules/*.json)
  // Layer 3: event-bus reactions (ecosystem.peer.found / lost)
  handlers['ecosystem'] = async (args) => {
    const eco = require('../../core/ecosystem');
    const repoRoot = process.cwd();
    const sub = args._sub || 'status';

    if (sub === 'status' || sub === 'discover') {
      const result = await eco.discoverEcosystem({ repoRoot, checkHealth: true, emit: false });
      if (args.json === true) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(c.boldCyan('Ecosystem discovery'));
      console.log(`  Found: ${c.bold(String(result.modules.length))} module(s)`);
      console.log(`  Alive: ${result.alive.length > 0 ? c.boldGreen(String(result.alive.length)) : c.dim('0')}`);
      console.log(`  Stale: ${result.stale.length > 0 ? c.yellow(String(result.stale.length)) : c.dim('0')}`);
      console.log('');
      for (const m of result.modules) {
        const status = m.health?.alive ? c.boldGreen('UP  ')
          : m.health?.error ? c.red('DOWN')
          : c.dim('???? ');
        const lang = c.dim(`[${m.language || '?'}]`);
        console.log(`  ${status}  ${c.cyan(m.name.padEnd(32))} ${c.dim('v' + (m.version || '?'))} ${lang}`);
        console.log(`        ${c.dim(m.repoRoot)}`);
        if (m.role) console.log(`        role: ${c.magenta(m.role)}`);
        if (m.health?.error) console.log(`        ${c.red('error: ' + m.health.error)}`);
        if (m.live?.port) console.log(`        live: ${m.live.host}:${m.live.port} pid=${m.live.pid}`);
        if (Array.isArray(m.capabilities) && m.capabilities.length > 0) {
          const caps = m.capabilities.slice(0, 5).join(', ');
          console.log(`        capabilities: ${c.dim(caps)}${m.capabilities.length > 5 ? c.dim(' …') : ''}`);
        }
        console.log('');
      }
      return;
    }

    if (sub === 'connect' || sub === 'wire') {
      const result = await eco.autoWireAll({ repoRoot });
      if (args.json === true) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(c.boldCyan('Ecosystem auto-wire'));
      if (result.wired.length === 0) {
        console.log(c.yellow('  No peers were wired. Check `oracle ecosystem status` for reachability.'));
        return;
      }
      for (const w of result.wired) {
        console.log(`  ${c.boldGreen('✓')} ${c.cyan(w.peer.padEnd(32))} → ${c.dim(w.role)}`);
      }
      console.log('');
      console.log(c.dim(`  ${result.wired.length} binding(s) active. Subsystems that depend on these peers have switched from fallback mode to the live service.`));
      return;
    }

    if (sub === 'announce') {
      // Write this module's runtime record to the registry.
      const record = eco.announceModule(repoRoot, {
        port: args.port ? Number(args.port) : undefined,
        host: args.host,
      });
      if (!record) {
        console.log(c.yellow('No remembrance.json found in ' + repoRoot));
        return;
      }
      console.log(c.boldGreen('Announced:'));
      console.log(`  name:  ${c.cyan(record.name)}`);
      console.log(`  pid:   ${record.pid}`);
      console.log(`  host:  ${record.host}`);
      if (record.port) console.log(`  port:  ${record.port}`);
      console.log(`  role:  ${c.magenta(record.role || '?')}`);
      return;
    }

    if (sub === 'help' || !sub) {
      console.log(`
${c.boldCyan('Oracle ecosystem — discovery + auto-wire')}

${c.bold('Subcommands:')}
  ${c.cyan('ecosystem status')}     Show all discovered modules + health
  ${c.cyan('ecosystem connect')}    Auto-wire live peers into the running toolkit
  ${c.cyan('ecosystem announce')}   Register this module in the runtime registry

${c.bold('Discovery layers:')}
  1. remembrance.json manifests in sibling repos and $HOME
  2. runtime registry at ~/.remembrance/modules/
  3. event bus: ecosystem.peer.found / ecosystem.peer.lost

${c.bold('Environment:')}
  ${c.yellow('ORACLE_ECOSYSTEM_ROOTS')}  Colon-separated list of additional root dirs to scan
  ${c.yellow('VOID_API_KEY')}              API key for the Void Compressor's cascade endpoint
`);
      return;
    }

    console.error(c.boldRed('Error:') + ` Unknown ecosystem subcommand: ${sub}`);
  };

  handlers['session'] = (args) => {
    const {
      startSession, endSession, getCurrentSession, saveSession,
      recordEvent, scoreCompliance,
    } = require('../../core/compliance');
    const repoRoot = process.cwd();
    const sub = args._sub || 'status';

    if (sub === 'start') {
      const s = startSession(repoRoot, { agent: args.agent || process.env.ORACLE_AGENT });
      console.log(c.boldGreen('Session started:'));
      console.log(`  id:      ${c.cyan(s.id)}`);
      console.log(`  started: ${c.dim(s.startedAt)}`);
      console.log(c.dim('  Every search / write / audit from now on is tracked.'));
      console.log(c.dim('  Run `oracle session status` to see compliance live.'));
      console.log(c.dim('  Run `oracle session end` when the session is done.'));
      return;
    }

    if (sub === 'status') {
      const s = getCurrentSession(repoRoot);
      if (!s) {
        console.log(c.yellow('No active session. Start one with: oracle session start'));
        return;
      }
      const score = scoreCompliance(s);
      if (args.json === true) { console.log(JSON.stringify({ session: s, score }, null, 2)); return; }
      const scoreColor = score.score >= 0.9 ? c.boldGreen : score.score >= 0.5 ? c.yellow : c.boldRed;
      console.log(c.boldCyan('Session status'));
      console.log(`  id:      ${c.cyan(s.id)}`);
      console.log(`  agent:   ${c.dim(s.agent || 'unknown')}`);
      console.log(`  started: ${c.dim(s.startedAt)}`);
      console.log(`  ended:   ${s.endedAt ? c.dim(s.endedAt) : c.yellow('(open)')}`);
      console.log('');
      console.log(`  Compliance:  ${scoreColor((score.score * 100).toFixed(0) + '%')}  [${score.status}]`);
      console.log(`  Stats:       written=${score.stats.filesWritten} searched=${score.stats.filesSearched} audited=${score.stats.filesAudited} pulled=${score.stats.patternsPulled} fedBack=${score.stats.patternsFedBack}`);
      if (score.violations.length > 0) {
        console.log('');
        console.log(c.bold('  Violations:'));
        for (const v of score.violations) {
          console.log(`    ${c.red('✗')} ${v.check} (weight ${v.weight})`);
          console.log(`      ${v.message}`);
          console.log(`      ${c.dim('fix:')} ${c.cyan(v.fix)}`);
          if (v.files && v.files.length > 0) {
            console.log(`      ${c.dim('files:')} ${v.files.slice(0, 5).join(', ')}${v.files.length > 5 ? ' …' : ''}`);
          }
        }
      } else {
        console.log('');
        console.log(c.boldGreen('  ✓ Fully compliant'));
      }
      return;
    }

    if (sub === 'end') {
      const s = endSession(repoRoot);
      if (!s) { console.log(c.yellow('No session to end.')); return; }
      const score = scoreCompliance(s);
      console.log(c.boldCyan('Session ended:'));
      console.log(`  id:     ${c.cyan(s.id)}`);
      console.log(`  duration: ${c.dim(s.startedAt)} → ${c.dim(s.endedAt)}`);
      console.log(`  final compliance: ${(score.score * 100).toFixed(0)}% (${score.status})`);
      if (score.violations.length > 0) {
        console.log('');
        console.log(c.yellow('  Final violations:'));
        for (const v of score.violations.slice(0, 5)) {
          console.log(`    ${c.red('✗')} ${v.check}: ${v.message}`);
        }
      }
      return;
    }

    if (sub === 'bypass') {
      const s = getCurrentSession(repoRoot) || startSession(repoRoot);
      const reason = args.reason || args._positional[1];
      if (!reason) { console.log(c.yellow('Usage: oracle session bypass <reason> [--files f1,f2]')); return; }
      const files = args.files ? String(args.files).split(',').map(f => f.trim()) : [];
      recordEvent(s, 'bypass', { reason, files });
      saveSession(s, repoRoot);
      console.log(c.boldGreen('Bypass recorded:'));
      console.log(`  reason: ${c.yellow(reason)}`);
      if (files.length > 0) console.log(`  files:  ${files.join(', ')}`);
      console.log(c.dim('  These files will not count as query-before-write violations.'));
      return;
    }

    if (sub === 'todo') {
      // Friction-exit mitigation: the agent self-reports open/close/defer
      // for each task. If the session ends with any 'open' todo, the
      // todosAllClosed compliance check drops the score.
      //   oracle session todo open  --id t1 --content "Write parser"
      //   oracle session todo close --id t1
      //   oracle session todo defer --id t1 --reason "waiting on user"
      const action = args.action || args._positional[1];
      const s = getCurrentSession(repoRoot) || startSession(repoRoot);
      if (action === 'open') {
        recordEvent(s, 'todo.open', { id: args.id, content: args.content });
      } else if (action === 'close') {
        recordEvent(s, 'todo.close', { id: args.id });
      } else if (action === 'defer') {
        recordEvent(s, 'todo.defer', { id: args.id, reason: args.reason });
      } else if (action === 'list' || !action) {
        const todos = s.todos || [];
        if (todos.length === 0) { console.log(c.dim('no todos recorded')); return; }
        for (const t of todos) {
          const mark = t.status === 'closed' ? c.green('✓')
            : t.status === 'deferred' ? c.yellow('⏸')
            : c.red('✗');
          console.log(`  ${mark} ${c.cyan(t.id.padEnd(16))} ${c.dim(t.status.padEnd(9))} ${t.content || ''}`);
        }
        return;
      } else {
        console.log(c.yellow('Usage: oracle session todo <open|close|defer|list> [--id <id>] [--content "..."] [--reason "..."]'));
        return;
      }
      saveSession(s, repoRoot);
      console.log(c.dim(`todo ${action}: ${args.id || '(no id)'}`));
      return;
    }

    if (sub === 'record') {
      // Manual event recording for harnesses that can't emit bus events.
      //   oracle session record search --file foo.js
      //   oracle session record write  --file foo.js
      //   oracle session record audit  --file foo.js
      const kind = args.kind || args._positional[1];
      if (!kind) { console.log(c.yellow('Usage: oracle session record <search|write|audit> --file <f>')); return; }
      const s = getCurrentSession(repoRoot) || startSession(repoRoot);
      recordEvent(s, kind, { file: args.file });
      saveSession(s, repoRoot);
      console.log(c.dim(`recorded: ${kind} ${args.file || ''}`));
      return;
    }

    if (sub === 'help' || !sub) {
      console.log(`
${c.boldCyan('Oracle session — compliance ledger')}

${c.bold('Subcommands:')}
  ${c.cyan('session start')}                 Begin a tracked session
  ${c.cyan('session status')}                Show compliance score + violations
  ${c.cyan('session end')}                   Close the session + final report
  ${c.cyan('session bypass <reason>')}       Record an explicit bypass
  ${c.cyan('session record <kind>')}         Manually record search/write/audit

${c.bold('Environment:')}
  ${c.yellow('ORACLE_WORKFLOW=enforce')}     Pre-commit blocks commits below 100% compliance
  ${c.yellow('ORACLE_AGENT=<name>')}         Tags the session with an agent identifier
`);
      return;
    }

    console.error(c.boldRed('Error:') + ` Unknown session subcommand: ${sub}`);
  };

  handlers['history'] = (args) => {
    const { readHistory, summarizeHistory } = require('../../core/history');
    const repoRoot = process.cwd();

    if (args.summary === true || args.summary === 'true') {
      const summary = summarizeHistory(repoRoot, { since: args.since });
      if (args.json === true) { console.log(JSON.stringify(summary, null, 2)); return; }
      console.log(c.boldCyan('Oracle history summary'));
      console.log(`  Since:  ${summary.since}`);
      console.log(`  Total:  ${summary.total}`);
      console.log('');
      const rows = Object.entries(summary.byType).sort((a, b) => b[1] - a[1]);
      for (const [type, count] of rows.slice(0, 20)) {
        console.log(`  ${c.cyan(type.padEnd(32))} ${c.bold(String(count))}`);
      }
      return;
    }

    const filters = {
      limit: args.limit ? Number(args.limit) : 50,
      since: args.since,
      until: args.until,
      type: args.type,
      typePrefix: args.prefix,
    };
    const entries = readHistory(repoRoot, filters);
    if (args.json === true) { console.log(JSON.stringify(entries, null, 2)); return; }

    if (entries.length === 0) {
      console.log(c.yellow('No history entries match the filters.'));
      console.log(c.dim('  Tip: run `oracle hooks install` to start capturing events.'));
      return;
    }

    console.log(c.boldCyan(`Oracle history (${entries.length} entries)`));
    console.log('');
    for (const e of entries) {
      const when = (e._at || '').slice(11, 19);
      const dim = c.dim;
      console.log(`  ${dim(when)}  ${c.cyan(e.type.padEnd(24))}  ${formatPayload(e.payload)}`);
    }
  };

  // Compact payload summary for the history timeline.
  function formatPayload(p) {
    if (!p || typeof p !== 'object') return c.dim(String(p || ''));
    const bits = [];
    if (p.ruleId) bits.push(c.cyan(p.ruleId));
    if (p.file)   bits.push(c.dim(String(p.file).slice(-40)));
    if (p.level)  bits.push(`level=${p.level}`);
    if (p.success !== undefined) bits.push(p.success ? c.green('ok') : c.red('fail'));
    if (p.patchCount !== undefined) bits.push('patches=' + p.patchCount);
    return bits.join(' ');
  }

  handlers['auto-submit'] = (args) => {
    try {
      const { autoSubmit } = require('../../ci/auto-submit');
      const dryRun = parseDryRun(args);
      const syncPersonal = args.sync !== 'false' && args.sync !== false;
      const shareCommunity = args.share === 'true' || args.share === true;
      const result = autoSubmit(oracle, process.cwd(), {
        syncPersonal,
        shareCommunity,
        dryRun,
        language: args.language,
      });

      // Technical report (shown with --verbose or ORACLE_DEBUG)
      const verbose = args.verbose === true || process.env.ORACLE_DEBUG;
      if (verbose) {
        console.log(c.boldCyan('Auto-Submit Report:'));
        if (result.autoRegistered > 0) {
          console.log(`  Registered: ${c.boldGreen(String(result.autoRegistered))} new function(s) from diff`);
        }
        console.log(`  Harvested:  ${c.boldGreen(String(result.harvest.registered))} registered, ${c.dim(String(result.harvest.skipped))} skipped, ${c.dim(String(result.harvest.failed))} failed`);
        console.log(`  Promoted:   ${c.boldGreen(String(result.promoted))} candidate(s)`);
        console.log(`  Synced:     ${result.synced ? c.boldGreen('yes') : c.dim('no')}`);
        console.log(`  Shared:     ${result.shared ? c.boldGreen('yes') : c.dim('no')}`);
        if (result.debugSweep) {
          console.log(`  Debug:      ${c.boldGreen(String(result.debugSweep.grown || 0))} grown, ${c.boldGreen(String(result.debugSweep.synced || 0))} synced`);
        }
        if (result.retention) {
          const totalRemoved = (result.retention.candidateArchive?.removed || 0) +
            (result.retention.patternArchive?.removed || 0) +
            (result.retention.entries?.staleRemoved || 0) +
            (result.retention.entries?.duplicateRemoved || 0);
          if (totalRemoved > 0) {
            console.log(`  Retention:  ${c.dim(String(totalRemoved))} stale row(s) purged`);
          }
        }
        if (result.errors.length > 0) {
          console.log(`  Errors:     ${c.boldRed(result.errors.join(', '))}`);
        }
        console.log('');
      }

      // Plain-language summary (always shown)
      const newPatterns = (result.autoRegistered || 0) + result.harvest.registered;
      const promoted = result.promoted || 0;
      const syncedCount = result.syncDetails?.synced || 0;
      const sharedCount = result.shared ? 1 : 0;

      // Get total library size for context
      let librarySize = '?';
      try {
        const patternStats = oracle.patternStats();
        librarySize = String(patternStats.totalPatterns || patternStats.total || 0);
      } catch (_) { /* stats not critical */ }

      console.log(`${c.boldCyan('This session:')}`);

      const parts = [];
      if (newPatterns > 0) parts.push(`${c.bold(String(newPatterns))} new pattern${newPatterns === 1 ? '' : 's'} captured`);
      if (promoted > 0) parts.push(`${c.bold(String(promoted))} candidate${promoted === 1 ? '' : 's'} promoted to proven`);
      if (result.implicitFeedback?.successes > 0) parts.push(`${c.bold(String(result.implicitFeedback.successes))} existing pattern${result.implicitFeedback.successes === 1 ? '' : 's'} confirmed working`);
      if (syncedCount > 0) parts.push(`${c.bold(String(syncedCount))} pattern${syncedCount === 1 ? '' : 's'} synced to your personal store`);
      if (result.synced && syncedCount === 0) parts.push('personal store synced');
      if (sharedCount > 0) parts.push('shared to community');

      if (parts.length > 0) {
        for (const part of parts) {
          console.log(`  ${c.green('\u2713')} ${part}`);
        }
      } else if (result.errors.length === 0) {
        console.log(`  ${c.dim('Nothing new — library is up to date.')}`);
      }

      console.log(`  ${c.dim('Library now has')} ${c.bold(librarySize)} ${c.dim('proven patterns.')}`);

      if (result.errors.length > 0 && !verbose) {
        console.log(`  ${c.yellow('!')} ${result.errors.length} pipeline warning${result.errors.length === 1 ? '' : 's'} (use --verbose for details)`);
      }

      console.log('');
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Auto-submit error: ' + err.message);
    }
  };

  handlers['auto-debug-sweep'] = (args) => {
    try {
      const { debugSweep } = require('../../ci/auto-debug');
      const dryRun = parseDryRun(args);
      const minConfidence = parseFloat(args['min-confidence']) || 0.3;
      const result = debugSweep(oracle, { dryRun, minConfidence });
      console.log(c.boldCyan('Auto-Debug Sweep Report:'));
      if (result.grown) {
        console.log(`  Grown:    ${c.boldGreen(String(result.grown.stored || 0))} variant(s) from ${c.bold(String(result.grown.processed || 0))} pattern(s)`);
      }
      if (result.synced) {
        console.log(`  Synced:   ${c.boldGreen(String(result.synced.synced || 0))} debug pattern(s) to personal store`);
      }
      if (result.errors.length > 0) {
        console.log(`  Errors:   ${c.boldRed(result.errors.join(', '))}`);
      }
      if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Auto-debug sweep error: ' + err.message);
    }
  };

  handlers['auto-register'] = (args) => {
    try {
      const { autoRegister } = require('../../ci/auto-register');
      const dryRun = parseDryRun(args);
      const range = args.commit || args.range || 'HEAD~1..HEAD';
      const wholeFile = args['whole-file'] === 'true' || args['whole-file'] === true;
      const result = autoRegister(oracle, process.cwd(), { range, dryRun, wholeFile });

      console.log(c.boldCyan('Auto-Register Report:'));
      console.log(`  Files scanned: ${c.bold(String(result.files.length))}`);
      console.log(`  Registered:    ${c.boldGreen(String(result.registered))}`);
      console.log(`  Already exist: ${c.dim(String(result.alreadyExists))}`);
      console.log(`  Skipped:       ${c.dim(String(result.skipped))}`);
      console.log(`  Failed:        ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);

      if (result.patterns.length > 0) {
        console.log(`\n${c.bold('Patterns:')}`);
        for (const p of result.patterns) {
          const statusColor = p.status === 'registered' ? c.boldGreen : p.status === 'dry-run' ? c.yellow : c.dim;
          console.log(`  ${statusColor(p.status.padEnd(10))} ${c.cyan(p.name)} ${c.dim(p.file)}`);
        }
      }
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Auto-register error: ' + err.message);
    }
  };

  handlers['auto-seed'] = (args) => {
    try {
      const { autoSeed } = require('../../ci/auto-seed');
      const baseDir = args.dir || process.cwd();
      const dryRun = parseDryRun(args);
      const result = autoSeed(oracle, baseDir, { language: args.language, dryRun });
      if (dryRun) {
        console.log(c.boldCyan('Auto-Seed Dry Run:'));
        console.log(`  Discovered ${c.bold(String(result.discovered))} source file(s) with tests`);
        for (const p of result.patterns) {
          console.log(`  ${c.cyan(p.name)} (${c.blue(p.language)}) \u2014 ${p.functions.slice(0, 5).join(', ')}`);
        }
      } else {
        console.log(`${c.boldGreen('Auto-seeded:')} ${result.registered} registered, ${result.skipped} skipped, ${result.failed} failed`);
        for (const p of result.patterns) {
          console.log(`  ${c.cyan(p.name)} [${c.dim(p.id)}] coherency: ${colorScore(p.coherency)}`);
        }
      }
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Auto-seed error: ' + err.message);
    }
  };

  handlers['refresh-coherency'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.refreshAllCoherency !== 'function') {
        console.error(c.boldRed('Error:') + ' SQLite store required for coherency refresh');
        process.exit(1);
      }
      const result = sqliteStore.refreshAllCoherency();
      console.log(c.boldCyan('Coherency Refresh:'));
      console.log(`  Patterns:   ${c.bold(String(result.total))}`);
      console.log(`  Updated:    ${c.boldGreen(String(result.updated))}`);
      console.log(`  Avg before: ${colorScore(result.avgBefore)}`);
      console.log(`  Avg after:  ${colorScore(result.avgAfter)}`);
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Coherency refresh error: ' + err.message);
    }
  };

  handlers['synthesize-proven'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.synthesizeForUntested !== 'function') {
        console.error(c.boldRed('Error:') + ' SQLite store required for test synthesis');
        process.exit(1);
      }
      const result = sqliteStore.synthesizeForUntested();
      console.log(c.boldCyan('Test Synthesis for Proven Patterns:'));
      console.log(`  Untested:     ${c.bold(String(result.total))}`);
      console.log(`  Synthesized:  ${c.boldGreen(String(result.synthesized))}`);
      console.log(`  Failed:       ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);
      console.log(`  Avg before:   ${colorScore(result.avgBefore)}`);
      console.log(`  Avg after:    ${colorScore(result.avgAfter)}`);
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Synthesis error: ' + err.message);
    }
  };

  handlers['bootstrap-reliability'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.bootstrapReliability !== 'function') {
        console.error(c.boldRed('Error:') + ' SQLite store required');
        process.exit(1);
      }
      const result = sqliteStore.bootstrapReliability();
      console.log(c.boldCyan('Bootstrap Reliability:'));
      console.log(`  Zero-usage:    ${c.bold(String(result.total))}`);
      console.log(`  Bootstrapped:  ${c.boldGreen(String(result.bootstrapped))}`);
      console.log(`  Avg before:    ${colorScore(result.avgBefore)}`);
      console.log(`  Avg after:     ${colorScore(result.avgAfter)}`);
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Bootstrap error: ' + err.message);
    }
  };

  handlers['fix-untested'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.fixUntestedPatterns !== 'function') {
        console.error(c.boldRed('Error:') + ' SQLite store required');
        process.exit(1);
      }
      const result = sqliteStore.fixUntestedPatterns();
      console.log(c.boldCyan('Fix Untested Patterns:'));
      console.log(`  Total:     ${c.bold(String(result.total))}`);
      console.log(`  Fixed:     ${c.boldGreen(String(result.fixed))}`);
      console.log(`  Skipped:   ${c.dim(String(result.skipped))}`);
      console.log(`  Avg before: ${colorScore(result.avgBefore)}`);
      console.log(`  Avg after:  ${colorScore(result.avgAfter)}`);
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Fix error: ' + err.message);
    }
  };

  handlers['fix-completeness'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.fixCompleteness !== 'function') {
        console.error(c.boldRed('Error:') + ' SQLite store required');
        process.exit(1);
      }
      const result = sqliteStore.fixCompleteness();
      console.log(c.boldCyan('Fix Completeness:'));
      console.log(`  Total:     ${c.bold(String(result.total))}`);
      console.log(`  Fixed:     ${c.boldGreen(String(result.fixed))}`);
      console.log(`  Avg before: ${colorScore(result.avgBefore)}`);
      console.log(`  Avg after:  ${colorScore(result.avgAfter)}`);
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Fix completeness error: ' + err.message);
    }
  };

  handlers['ci-feedback'] = (args) => {
    const { CIFeedbackReporter } = require('../../ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    const status = args.status;
    if (!status) { console.error(c.boldRed('Error:') + ` --status required (pass or fail). Usage: ${c.cyan('oracle ci-feedback --status pass')}`); process.exit(1); }
    const result = reporter.reportResults(status, {
      testOutput: args.output || '',
      commitSha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || '',
      ciProvider: process.env.GITHUB_ACTIONS ? 'github' : process.env.CI ? 'ci' : 'local',
    });
    if (result.reported === 0) {
      console.log(c.yellow(result.message));
    } else {
      console.log(`${c.boldGreen('Reported')} ${result.reported} pattern(s) as ${status === 'pass' ? c.boldGreen('PASS') : c.boldRed('FAIL')}:`);
      for (const u of result.updated) {
        console.log(`  ${c.cyan(u.id)} ${u.name ? c.bold(u.name) : ''} \u2192 reliability: ${colorScore(u.newReliability)}`);
      }
    }
    if (result.errors.length > 0) {
      console.log(`${c.boldRed('Errors:')} ${result.errors.map(e => `${e.id}: ${e.error}`).join(', ')}`);
    }
  };

  handlers['ci-stats'] = (args) => {
    const { CIFeedbackReporter } = require('../../ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    const stats = reporter.stats();
    console.log(c.boldCyan('CI Feedback Stats:'));
    console.log(`  Tracked patterns: ${c.bold(String(stats.trackedPatterns))}`);
    console.log(`  Unreported: ${stats.unreported > 0 ? c.boldYellow(String(stats.unreported)) : c.dim('0')}`);
    console.log(`  Reported: ${c.boldGreen(String(stats.reported))}`);
    console.log(`  Total feedback events: ${c.bold(String(stats.totalFeedbackEvents))}`);
    if (stats.recentFeedback.length > 0) {
      console.log(`\n${c.bold('Recent feedback:')}`);
      for (const fb of stats.recentFeedback) {
        const statusColor = fb.status === 'pass' ? c.boldGreen : c.boldRed;
        console.log(`  ${c.dim(fb.timestamp)} ${statusColor(fb.status)} \u2014 ${fb.patternsReported} pattern(s) ${fb.commitSha ? c.dim(fb.commitSha.slice(0, 8)) : ''}`);
      }
    }
  };

  handlers['ci-track'] = (args) => {
    const { CIFeedbackReporter } = require('../../ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
    const record = reporter.trackPull({ id: args.id, name: args.name || null, source: args.source || 'manual' });
    console.log(`${c.boldGreen('Tracking:')} ${c.cyan(record.id)} ${record.name ? c.bold(record.name) : ''}`);
  };

  handlers['hooks'] = (args) => {
    const { installHooks, uninstallHooks, runPreCommitCheck } = require('../../ci/hooks');
    const subCmd = args._sub;
    if (subCmd === 'install') {
      const result = installHooks(process.cwd());
      if (result.installed) {
        console.log(`${c.boldGreen('Hooks installed:')} ${result.hooks.join(', ')}`);
        console.log(`  ${c.dim('Location:')} ${result.hooksDir}`);
        console.log(`  ${c.cyan('pre-commit')}  \u2014 Covenant check on staged files`);
        console.log(`  ${c.cyan('post-commit')} \u2014 Auto-seed patterns from committed files`);
        // Compliance: emit so session.hooksInstalled flips true.
        try {
          const { getEventBus } = require('../../core/events');
          getEventBus().emitSync('hooks.installed', { hooks: result.hooks });
        } catch { /* ignore */ }
      } else {
        console.error(c.boldRed('Error:') + ' ' + result.error);
      }
    } else if (subCmd === 'uninstall') {
      const result = uninstallHooks(process.cwd());
      if (result.uninstalled) {
        console.log(`${c.boldGreen('Hooks removed:')} ${result.removed.join(', ') || 'none found'}`);
      } else {
        console.error(c.boldRed('Error:') + ' ' + result.error);
      }
    } else if (subCmd === 'run') {
      const hookName = args._positional[1];
      if (hookName === 'pre-commit') {
        const files = args._positional.slice(2);
        if (files.length === 0) {
          try {
            const staged = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' })
              .trim().split('\n').filter(f => /\.(js|ts|py|go|rs)$/.test(f));
            files.push(...staged);
          } catch (e) {
            if (process.env.ORACLE_DEBUG) console.warn('[admin:init] not in a git repo:', e?.message || e);
          }
        }
        if (files.length === 0) { console.log(c.dim('No staged source files to check.')); return; }
        const result = runPreCommitCheck(files);
        if (result.passed) {
          console.log(`${c.boldGreen('All files pass Covenant check')} (${result.total} files)`);
        } else {
          console.log(`${c.boldRed('Covenant violations in ' + result.blocked + ' file(s):')}`);
          for (const r of result.results.filter(r => !r.sealed)) {
            for (const v of r.violations) {
              console.log(`  ${c.red(r.file)}: [${c.bold(v.name)}] ${v.reason}`);
            }
          }
          process.exit(1);
        }
      } else {
        console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle hooks run pre-commit [files...]')}`);
      }
    } else {
      console.log(`Usage: ${c.cyan('oracle hooks')} <install|uninstall|run>`);
    }
  };

  handlers['registry'] = (args) => {
    const sub = args._sub;
    const {
      listRegistry, searchRegistry, getRegistryEntry, batchImport,
      discoverReposSync, checkLicense, getProvenance, findDuplicates,
    } = require('../../ci/open-source-registry');

    if (!sub || sub === 'help') {
      console.log(`
${c.boldCyan('Open Source Registry')} \u2014 import proven patterns from curated repositories

${c.bold('Subcommands:')}
  ${c.cyan('registry list')}            List curated repos (${c.yellow('--language')} js, ${c.yellow('--topic')} algo)
  ${c.cyan('registry search')} <query>  Search repos by keyword (${c.yellow('--language')} py, ${c.yellow('--limit')} 5)
  ${c.cyan('registry import')} <name>   Import from a curated repo (${c.yellow('--dry-run')}, ${c.yellow('--split')} function)
  ${c.cyan('registry batch')}           Batch import all repos for a language (${c.yellow('--language')} js)
  ${c.cyan('registry discover')} <q>    Search GitHub for repos (${c.yellow('--min-stars')} 1000, ${c.yellow('--language')} go)
  ${c.cyan('registry license')} <spdx>  Check license compatibility (e.g. MIT, GPL-3.0)
  ${c.cyan('registry provenance')}      Show source/license info for imported patterns
  ${c.cyan('registry duplicates')}      Find duplicate patterns across sources
      `);
      return;
    }

    if (sub === 'list') {
      const repos = listRegistry({ language: args.language, topic: args.topic });
      if (jsonOut()) { console.log(JSON.stringify(repos)); return; }
      console.log(`\n${c.boldCyan('Curated Open Source Repos')} (${repos.length} repos)\n`);
      for (const r of repos) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue(r.language.padEnd(12));
        const lic = c.dim(r.license.padEnd(14));
        console.log(`  ${stars} ${c.green('\u2605')}  ${lang} ${c.bold(r.name.padEnd(25))} ${lic} ${c.dim(r.description.slice(0, 60))}`);
      }
      console.log(`\n${c.dim('Filter: --language <lang> --topic <topic>')}`);
      return;
    }

    if (sub === 'search') {
      const query = args._positional[1];
      if (!query) { console.error(c.boldRed('Error:') + ' provide a search query'); process.exit(1); }
      const results = searchRegistry(query, { language: args.language, limit: parseInt(args.limit, 10) || 10 });
      if (jsonOut()) { console.log(JSON.stringify(results)); return; }
      if (results.length === 0) {
        console.log(c.yellow('\nNo repos found matching: ') + c.bold(query));
        return;
      }
      console.log(`\n${c.boldCyan('Registry Search:')} ${c.bold(query)} (${results.length} results)\n`);
      for (const r of results) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue(r.language.padEnd(12));
        const scoreBar = c.green('\u2588'.repeat(Math.min(r.score, 10)));
        console.log(`  ${stars} ${c.green('\u2605')}  ${lang} ${c.bold(r.name.padEnd(25))} ${scoreBar} ${c.dim(r.description.slice(0, 50))}`);
      }
      return;
    }

    if (sub === 'import') {
      const name = args._positional[1];
      if (!name) { console.error(c.boldRed('Error:') + ` provide a repo name. Usage: ${c.cyan('oracle registry import lodash')}`); process.exit(1); }
      const entry = getRegistryEntry(name);
      if (!entry) {
        console.error(c.boldRed('Error:') + ` "${name}" not found in registry. Run ${c.cyan('oracle registry list')} to see available repos.`);
        process.exit(1);
      }
      const dryRun = parseDryRun(args);
      const licCheck = checkLicense(entry.license);
      if (!licCheck.allowed && !args['allow-copyleft']) {
        console.error(c.boldRed('Error:') + ` License blocked: ${entry.license} \u2014 ${licCheck.reason}`);
        console.error(c.dim('Use --allow-copyleft to override'));
        process.exit(1);
      }
      console.log(`\n${c.boldCyan('Registry Import:')} ${c.bold(entry.name)}`);
      console.log(`  ${c.dim('URL:')}     ${entry.url}`);
      console.log(`  ${c.dim('License:')} ${licCheck.allowed ? c.green(entry.license) : c.yellow(entry.license)} (${licCheck.category})`);
      console.log(`  ${c.dim('Lang:')}    ${c.blue(entry.language)}`);
      if (dryRun) console.log(`  ${c.dim('(dry run \u2014 no changes)')}`);
      console.log('');
      try {
        const result = batchImport(oracle, [name], {
          language: args.language,
          dryRun,
          splitMode: args.split || 'file',
          maxFiles: parseInt(args['max-files'], 10) || 200,
          skipLicenseCheck: true,
        });
        const r = result.results[0];
        if (r.status === 'success') {
          console.log(`  ${c.boldGreen('\u2713')} Harvested: ${c.bold(String(r.harvested))}  Registered: ${c.boldGreen(String(r.registered))}  Skipped: ${c.yellow(String(r.skipped))}`);
        } else {
          console.log(`  ${c.boldRed('\u2717')} ${r.reason}`);
        }
      } catch (err) {
        console.error(c.boldRed('Error:') + ' Import error: ' + err.message);
        process.exit(1);
      }
      return;
    }

    if (sub === 'batch') {
      const dryRun = parseDryRun(args);
      const language = args.language;
      const repos = listRegistry({ language });
      if (repos.length === 0) {
        console.error(c.boldRed('Error:') + ' No repos found' + (language ? ` for language: ${language}` : ''));
        process.exit(1);
      }
      console.log(`\n${c.boldCyan('Batch Import')} \u2014 ${repos.length} repos${language ? ' (' + c.blue(language) + ')' : ''}`);
      if (dryRun) console.log(c.dim('(dry run \u2014 no changes)\n'));
      else console.log('');
      const names = repos.map(r => r.name);
      const result = batchImport(oracle, names, {
        language: args.language,
        dryRun,
        splitMode: args.split || 'file',
        maxFiles: parseInt(args['max-files'], 10) || 100,
      });
      for (const r of result.results) {
        const icon = r.status === 'success' ? c.green('\u2713') : r.status === 'skipped' ? c.yellow('\u25CB') : c.red('\u2717');
        const detail = r.status === 'success'
          ? `harvested: ${r.harvested}, registered: ${c.boldGreen(String(r.registered))}`
          : r.reason;
        console.log(`  ${icon} ${c.bold(r.source.padEnd(25))} ${detail}`);
      }
      console.log(`\n  ${c.bold('Total:')} ${result.succeeded} succeeded, ${result.skipped} skipped, ${result.failed} failed`);
      return;
    }

    if (sub === 'discover') {
      const query = args._positional[1];
      if (!query) { console.error(c.boldRed('Error:') + ` provide a search query. Usage: ${c.cyan('oracle registry discover "sorting algorithms"')}`); process.exit(1); }
      console.log(c.dim('\nSearching GitHub...'));
      const repos = discoverReposSync(query, {
        language: args.language,
        minStars: parseInt(args['min-stars'], 10) || 100,
        limit: parseInt(args.limit, 10) || 10,
      });
      if (jsonOut()) { console.log(JSON.stringify(repos)); return; }
      if (repos.length === 0) {
        console.log(c.yellow('No repos found on GitHub for: ') + c.bold(query));
        return;
      }
      console.log(`\n${c.boldCyan('GitHub Discovery:')} ${c.bold(query)} (${repos.length} results)\n`);
      for (const r of repos) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue((r.language || 'unknown').padEnd(12));
        const lic = r.license !== 'unknown' ? c.dim(r.license) : c.red('no license');
        console.log(`  ${stars} ${c.green('\u2605')}  ${lang} ${c.bold(r.name.padEnd(25))} ${lic}`);
        console.log(`  ${' '.repeat(10)}  ${c.dim(r.url)}`);
        if (r.description) console.log(`  ${' '.repeat(10)}  ${c.dim(r.description.slice(0, 70))}`);
      }
      console.log(`\n${c.dim('To import: oracle harvest <url> or oracle registry import <name>')}`);
      return;
    }

    if (sub === 'license') {
      const spdx = args._positional[1];
      if (!spdx) { console.error(c.boldRed('Error:') + ' provide an SPDX license ID (e.g. MIT, GPL-3.0, Apache-2.0)'); process.exit(1); }
      const result = checkLicense(spdx, { allowCopyleft: args['allow-copyleft'] === true });
      if (jsonOut()) { console.log(JSON.stringify(result)); return; }
      const icon = result.allowed ? c.boldGreen('\u2713 ALLOWED') : c.boldRed('\u2717 BLOCKED');
      console.log(`\n  ${icon}  ${c.bold(spdx)}`);
      console.log(`  Category: ${c.cyan(result.category)}`);
      console.log(`  ${c.dim(result.reason)}\n`);
      return;
    }

    if (sub === 'provenance') {
      const patterns = getProvenance(oracle, { source: args.source, license: args.license });
      if (jsonOut()) { console.log(JSON.stringify(patterns)); return; }
      if (patterns.length === 0) {
        console.log(c.yellow('\nNo imported patterns found') + (args.source ? ` from source: ${args.source}` : ''));
        return;
      }
      console.log(`\n${c.boldCyan('Pattern Provenance')} (${patterns.length} imported patterns)\n`);
      const grouped = {};
      for (const p of patterns) {
        if (!grouped[p.source]) grouped[p.source] = [];
        grouped[p.source].push(p);
      }
      for (const [source, pats] of Object.entries(grouped)) {
        const lic = pats[0].license;
        console.log(`  ${c.bold(source)} (${c.dim(lic)}) \u2014 ${pats.length} patterns`);
        for (const p of pats.slice(0, 10)) {
          console.log(`    ${c.cyan(p.name.padEnd(30))} ${c.blue(p.language.padEnd(12))} coherency: ${colorScore(p.coherency)}`);
        }
        if (pats.length > 10) console.log(c.dim(`    ... and ${pats.length - 10} more`));
      }
      return;
    }

    if (sub === 'duplicates') {
      console.log(c.dim('\nScanning for duplicates...'));
      const dupes = findDuplicates(oracle, {
        threshold: args.threshold != null ? parseFloat(args.threshold) : 0.85,
        language: args.language,
      });
      if (jsonOut()) { console.log(JSON.stringify(dupes)); return; }
      if (dupes.length === 0) {
        console.log(c.boldGreen('\n  \u2713 No duplicates found\n'));
        return;
      }
      console.log(`\n${c.boldCyan('Duplicate Patterns')} (${dupes.length} pairs)\n`);
      for (const d of dupes.slice(0, 30)) {
        const simColor = d.similarity >= 0.95 ? c.red : c.yellow;
        const typeIcon = d.type === 'exact' ? c.red('EXACT') : c.yellow('NEAR');
        console.log(`  ${typeIcon}  ${simColor((d.similarity * 100).toFixed(0) + '%')}  ${c.bold(d.pattern1.name)} ${c.dim('\u2194')} ${c.bold(d.pattern2.name)}`);
      }
      if (dupes.length > 30) console.log(c.dim(`  ... and ${dupes.length - 30} more`));
      console.log(`\n${c.dim('Tip: use oracle deep-clean to remove duplicates')}`);
      return;
    }

    console.error(c.boldRed('Error:') + ` Unknown registry subcommand: ${sub}. Run ${c.cyan('oracle registry help')} for usage.`);
    process.exit(1);
  };
}

module.exports = { registerAdminCommands };
