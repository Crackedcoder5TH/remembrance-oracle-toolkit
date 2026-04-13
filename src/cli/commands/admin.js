/**
 * Admin CLI commands: users, audit, auto-seed, ci-feedback, ci-stats, ci-track, hooks, registry
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { c, colorScore } = require('../colors');
const { parseDryRun } = require('../validate-args');

function registerAdminCommands(handlers, { oracle, jsonOut }) {

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

  handlers['audit'] = (args) => {
    const sub = args._sub;

    // Subcommand: audit check — run static checkers on files
    if (sub === 'check') {
      const { auditFiles, auditFile, BUG_CLASSES } = require('../../audit/static-checkers');
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

      if (args.json === true) { console.log(JSON.stringify(result)); return; }

      console.log(c.boldCyan(`Audit Check \u2014 ${result.summary.filesScanned} files scanned\n`));

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
      const { auditFiles } = require('../../audit/static-checkers');
      const { detectCascade } = require('../../audit/cascade-detector');

      // Get recently changed files — try HEAD~1, fall back to all tracked files
      let files = [];
      try {
        const changed = execSync('git diff HEAD~1 --name-only --diff-filter=ACM 2>/dev/null', { encoding: 'utf-8' })
          .trim().split('\n').filter(f => /\.(js|ts)$/.test(f) && f.trim());
        files = changed;
      } catch (_) {
        // No prior commit or git error — fall back to staged or tracked .js/.ts files
        try {
          const tracked = execSync('git ls-files "*.js" "*.ts" 2>/dev/null', { encoding: 'utf-8' })
            .trim().split('\n').filter(f => f.trim()).slice(0, 50); // cap at 50 files
          files = tracked;
        } catch (_2) { /* empty */ }
      }

      console.log(c.boldCyan('Audit Summary\n'));

      // Static checks
      if (files.length > 0) {
        const staticResult = auditFiles(files);
        console.log(c.bold('  Static Checks:'));
        console.log(`    Files:     ${c.bold(String(staticResult.summary.filesScanned))}`);
        console.log(`    Findings:  ${staticResult.totalFindings > 0 ? c.boldRed(String(staticResult.totalFindings)) : c.boldGreen('0')}`);
        if (staticResult.totalFindings > 0) {
          for (const [cls, count] of Object.entries(staticResult.summary.byClass)) {
            console.log(`      ${c.cyan(cls.padEnd(16))} ${c.bold(String(count))}`);
          }
        }
      } else {
        console.log(c.dim('  Static Checks: no .js/.ts files found to audit'));
      }

      // Cascade detection
      try {
        const cascadeResult = detectCascade('HEAD~1..HEAD', process.cwd());
        console.log(`\n${c.bold('  Cascade Detection:')}`);
        console.log(`    Functions changed: ${c.bold(String(cascadeResult.summary.functionsChanged))}`);
        console.log(`    Cascades found:    ${cascadeResult.summary.cascadesFound > 0 ? c.boldRed(String(cascadeResult.summary.cascadesFound)) : c.boldGreen('0')}`);
        if (cascadeResult.summary.cascadesFound > 0) {
          for (const [type, count] of Object.entries(cascadeResult.summary.byType)) {
            console.log(`      ${c.cyan(type.padEnd(16))} ${c.bold(String(count))}`);
          }
        }
      } catch (_) {
        console.log(c.dim('\n  Cascade Detection: unable to analyze'));
      }

      console.log('');
      return;
    }

    // Subcommand: audit xref — cross-reference findings with debug patterns
    if (sub === 'xref') {
      const { auditFiles } = require('../../audit/static-checkers');
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
${c.boldCyan('Audit Commands')} \u2014 assumption mismatch detection

${c.bold('Subcommands:')}
  ${c.cyan('audit check')}       Run static checkers on files (6 bug classes)
  ${c.cyan('audit cascade')}     Detect cascading mismatches from a commit
  ${c.cyan('audit xref')}        Cross-reference findings with debug pattern fixes
  ${c.cyan('audit summary')}     Combined audit report (static + cascade + xref)
  ${c.cyan('audit log')}         Show audit log entries (default)

${c.bold('Options:')}
  ${c.yellow('--file')} <path>        Specific file to check
  ${c.yellow('--from')} <commit>      Commit range for cascade detection
  ${c.yellow('--bug-class')} <class>  Filter by bug class (state-mutation,security,concurrency,type,integration,edge-case)
  ${c.yellow('--min-severity')} <s>   Minimum severity (high,medium,low)
  ${c.yellow('--json')}               JSON output
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
      const qualityThreshold = args['quality-threshold'] !== undefined
        ? parseFloat(args['quality-threshold'])
        : 0.4;
      const result = autoRegister(oracle, process.cwd(), { range, dryRun, wholeFile, qualityThreshold });

      console.log(c.boldCyan('Auto-Register Report:'));
      console.log(`  Files scanned:     ${c.bold(String(result.files.length))}`);
      console.log(`  Discovered:        ${c.bold(String(result.discovered))}`);
      console.log(`  Registered:        ${c.boldGreen(String(result.registered))}`);
      console.log(`  Below threshold:   ${c.dim(String(result.belowThreshold))}`);
      console.log(`  Already exist:     ${c.dim(String(result.alreadyExists))}`);
      console.log(`  Skipped:           ${c.dim(String(result.skipped))}`);
      console.log(`  Failed:            ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);

      if (result.patterns.length > 0) {
        console.log(`\n${c.bold('Patterns:')}`);
        for (const p of result.patterns) {
          const scoreStr = p.score !== undefined ? ` (${p.score.toFixed(2)})` : '';
          const reasonStr = p.reasons && p.reasons.length > 0 ? ` — ${p.reasons.join(', ')}` : '';
          if (p.status === 'below-threshold') {
            console.log(`  ${c.dim('~')} ${c.dim(p.name)}${c.dim(scoreStr)} ${c.dim('— skipped (below threshold)')}`);
          } else if (p.status === 'registered') {
            console.log(`  ${c.boldGreen('+')} ${c.cyan(p.name)}${c.bold(scoreStr)}${c.dim(reasonStr)}`);
          } else if (p.status === 'dry-run') {
            console.log(`  ${c.yellow('+')} ${c.cyan(p.name)}${c.bold(scoreStr)}${c.dim(reasonStr)} ${c.yellow('[dry-run]')}`);
          } else {
            const statusColor = c.dim;
            console.log(`  ${statusColor('-')} ${statusColor(p.name)}${statusColor(scoreStr)} ${c.dim(p.file)}`);
          }
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

  handlers['forge'] = (args) => {
    try {
      const { TestForge } = require('../../test-forge');
      const forge = new TestForge(oracle);
      const dryRun = parseDryRun(args);
      const id = args.id;
      const limit = args.limit ? parseInt(args.limit, 10) : undefined;

      // forge --score — score all existing tests
      if (args.score === true || args.score === 'true') {
        const result = forge.scoreTests();
        if (jsonOut()) { console.log(JSON.stringify(result)); return; }
        console.log(c.boldCyan(`Test Quality Scores — ${result.total} pattern(s)\n`));
        console.log(`  Average score: ${colorScore(result.avgScore)}\n`);
        for (const r of result.results.slice(0, 30)) {
          const scoreBar = c.green('\u2588'.repeat(Math.round(r.score * 10)));
          console.log(`  ${colorScore(r.score)} ${scoreBar} ${c.bold(r.name)}`);
          if (r.suggestions.length > 0) {
            console.log(`    ${c.dim(r.suggestions[0])}`);
          }
        }
        if (result.results.length > 30) console.log(c.dim(`  ... and ${result.results.length - 30} more`));
        return;
      }

      // forge --run — generate + run tests
      if (args.run === true || args.run === 'true') {
        const result = forge.runTests();
        if (jsonOut()) { console.log(JSON.stringify(result)); return; }
        console.log(c.boldCyan(`Test Run Results — ${result.total} pattern(s)\n`));
        console.log(`  Passed: ${c.boldGreen(String(result.passed))}  Failed: ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}\n`);
        for (const r of result.results) {
          const icon = r.passed ? c.green('\u2713') : c.red('\u2717');
          console.log(`  ${icon} ${c.bold(r.name)} ${c.dim(`(${r.duration}ms)`)}`);
          if (!r.passed && r.error) {
            console.log(`    ${c.red(r.error.slice(0, 120))}`);
          }
        }
        return;
      }

      // forge --promote — full pipeline
      if (args.promote === true || args.promote === 'true') {
        const result = forge.forgeAndPromote({ limit });
        if (jsonOut()) { console.log(JSON.stringify(result)); return; }
        console.log(c.boldCyan(`Test Forge — Full Pipeline\n`));
        console.log(`  Untested:   ${c.bold(String(result.total))}`);
        console.log(`  Generated:  ${c.boldGreen(String(result.generated))}`);
        console.log(`  Passed:     ${c.boldGreen(String(result.passed))}`);
        console.log(`  Failed:     ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);
        console.log(`  Promoted:   ${c.boldGreen(String(result.promoted))}`);
        console.log(`  Avg score:  ${colorScore(result.avgScore)}`);
        if (result.newlyEligible.length > 0) {
          console.log(`\n${c.bold('  Newly publication-eligible:')}`);
          for (const p of result.newlyEligible) {
            console.log(`    ${c.green('\u2713')} ${c.bold(p.name)} (coherency: ${colorScore(p.coherency)})`);
          }
        }
        return;
      }

      // forge --id <id> — single pattern
      if (id) {
        const result = forge.forgeTest(id, { dryRun });
        if (jsonOut()) { console.log(JSON.stringify(result)); return; }
        if (result.success) {
          console.log(`${c.boldGreen('Test generated')} for pattern ${c.cyan(id)}`);
          console.log(`  Strategy:    ${c.bold(result.strategy)}`);
          console.log(`  Assertions:  ${c.bold(String(result.assertions))}`);
          console.log(`  Duration:    ${c.dim(result.duration + 'ms')}`);
          if (dryRun) console.log(c.yellow('\n(dry run — test not stored)'));
          if (args.verbose === true) {
            console.log(`\n${c.dim('Generated test code:')}`);
            console.log(result.testCode);
          }
        } else {
          console.error(c.boldRed('Error:') + ' ' + result.error);
          if (result.testCode && args.verbose === true) {
            console.log(`\n${c.dim('Generated test code (failed):')}`);
            console.log(result.testCode);
          }
        }
        return;
      }

      // Default: forge — generate tests for all untested
      const result = forge.forgeTests({ dryRun, limit });
      if (jsonOut()) { console.log(JSON.stringify(result)); return; }
      console.log(c.boldCyan(`Test Forge — Generate Tests\n`));
      console.log(`  Untested:   ${c.bold(String(result.total))}`);
      console.log(`  Generated:  ${c.boldGreen(String(result.generated))}`);
      console.log(`  Skipped:    ${c.dim(String(result.skipped))}`);
      console.log(`  Failed:     ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);

      if (result.results.length > 0) {
        console.log('');
        for (const r of result.results.slice(0, 30)) {
          if (r.status === 'generated' || r.status === 'dry-run') {
            const tag = r.status === 'dry-run' ? c.yellow(' [dry-run]') : '';
            console.log(`  ${c.green('\u2713')} ${c.bold(r.name)} — ${r.strategy} (${r.assertions} assertions, ${r.duration}ms)${tag}`);
          } else if (r.status === 'failed' || r.status === 'error') {
            console.log(`  ${c.red('\u2717')} ${c.bold(r.name)} — ${c.dim(r.reason || 'failed')}`);
          } else {
            console.log(`  ${c.dim('-')} ${c.dim(r.name)} — ${c.dim(r.reason || 'skipped')}`);
          }
        }
        if (result.results.length > 30) console.log(c.dim(`  ... and ${result.results.length - 30} more`));
      }

      if (dryRun) console.log(c.yellow('\n(dry run — no tests stored)'));
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Test forge error: ' + err.message);
    }
  };
}

module.exports = { registerAdminCommands };
