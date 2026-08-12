'use strict';
const { c, colorScore } = require('../../colors');
const { parseDryRun } = require('../../validate-args');
const { out, outErr, outWarn, _quiet } = require('./out');

// Extracted from the admin monolith (decomposition #5, 2026-08-09).
// Handler bodies are verbatim except: console.* routed through the
// ./out seam, and every best-effort catch now names its failure via
// _quiet — silence became a measurement.
function registerAutoCommands(handlers, { oracle, jsonOut }) {
  handlers['auto-submit'] = (args) => {
    try {
      const { autoSubmit } = require('../../../ci/auto-submit');
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
        out(c.boldCyan('Auto-Submit Report:'));
        if (result.autoRegistered > 0) {
          out(`  Registered: ${c.boldGreen(String(result.autoRegistered))} new function(s) from diff`);
        }
        out(`  Harvested:  ${c.boldGreen(String(result.harvest.registered))} registered, ${c.dim(String(result.harvest.skipped))} skipped, ${c.dim(String(result.harvest.failed))} failed`);
        out(`  Promoted:   ${c.boldGreen(String(result.promoted))} candidate(s)`);
        out(`  Synced:     ${result.synced ? c.boldGreen('yes') : c.dim('no')}`);
        out(`  Shared:     ${result.shared ? c.boldGreen('yes') : c.dim('no')}`);
        if (result.debugSweep) {
          out(`  Debug:      ${c.boldGreen(String(result.debugSweep.grown || 0))} grown, ${c.boldGreen(String(result.debugSweep.synced || 0))} synced`);
        }
        if (result.retention) {
          const totalRemoved = (result.retention.candidateArchive?.removed || 0) +
            (result.retention.patternArchive?.removed || 0) +
            (result.retention.entries?.staleRemoved || 0) +
            (result.retention.entries?.duplicateRemoved || 0);
          if (totalRemoved > 0) {
            out(`  Retention:  ${c.dim(String(totalRemoved))} stale row(s) purged`);
          }
        }
        if (result.errors.length > 0) {
          out(`  Errors:     ${c.boldRed(result.errors.join(', '))}`);
        }
        out('');
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
      } catch (_) { _quiet('admin:auto', _); /* stats not critical */ }

      out(`${c.boldCyan('This session:')}`);

      const parts = [];
      if (newPatterns > 0) parts.push(`${c.bold(String(newPatterns))} new pattern${newPatterns === 1 ? '' : 's'} captured`);
      if (promoted > 0) parts.push(`${c.bold(String(promoted))} candidate${promoted === 1 ? '' : 's'} promoted to proven`);
      if (result.implicitFeedback?.successes > 0) parts.push(`${c.bold(String(result.implicitFeedback.successes))} existing pattern${result.implicitFeedback.successes === 1 ? '' : 's'} confirmed working`);
      if (syncedCount > 0) parts.push(`${c.bold(String(syncedCount))} pattern${syncedCount === 1 ? '' : 's'} synced to your personal store`);
      if (result.synced && syncedCount === 0) parts.push('personal store synced');
      if (sharedCount > 0) parts.push('shared to community');

      if (parts.length > 0) {
        for (const part of parts) {
          out(`  ${c.green('\u2713')} ${part}`);
        }
      } else if (result.errors.length === 0) {
        out(`  ${c.dim('Nothing new — library is up to date.')}`);
      }

      out(`  ${c.dim('Library now has')} ${c.bold(librarySize)} ${c.dim('proven patterns.')}`);

      if (result.errors.length > 0 && !verbose) {
        out(`  ${c.yellow('!')} ${result.errors.length} pipeline warning${result.errors.length === 1 ? '' : 's'} (use --verbose for details)`);
      }

      out('');
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Auto-submit error: ' + err.message);
    }
  };
  handlers['auto-debug-sweep'] = (args) => {
    try {
      const { debugSweep } = require('../../../ci/auto-debug');
      const dryRun = parseDryRun(args);
      const minConfidence = parseFloat(args['min-confidence']) || 0.3;
      const result = debugSweep(oracle, { dryRun, minConfidence });
      out(c.boldCyan('Auto-Debug Sweep Report:'));
      if (result.grown) {
        out(`  Grown:    ${c.boldGreen(String(result.grown.stored || 0))} variant(s) from ${c.bold(String(result.grown.processed || 0))} pattern(s)`);
      }
      if (result.synced) {
        out(`  Synced:   ${c.boldGreen(String(result.synced.synced || 0))} debug pattern(s) to personal store`);
      }
      if (result.errors.length > 0) {
        out(`  Errors:   ${c.boldRed(result.errors.join(', '))}`);
      }
      if (dryRun) out(c.yellow('\n(dry run — no changes made)'));
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Auto-debug sweep error: ' + err.message);
    }
  };
  handlers['auto-register'] = (args) => {
    try {
      const { autoRegister } = require('../../../ci/auto-register');
      const dryRun = parseDryRun(args);
      const range = args.commit || args.range || 'HEAD~1..HEAD';
      const wholeFile = args['whole-file'] === 'true' || args['whole-file'] === true;
      const qualityThreshold = args['quality-threshold'] !== undefined
        ? parseFloat(args['quality-threshold'])
        : 0.4;
      const result = autoRegister(oracle, process.cwd(), { range, dryRun, wholeFile, qualityThreshold });

      out(c.boldCyan('Auto-Register Report:'));
      out(`  Files scanned:     ${c.bold(String(result.files.length))}`);
      out(`  Discovered:        ${c.bold(String(result.discovered))}`);
      out(`  Registered:        ${c.boldGreen(String(result.registered))}`);
      out(`  Below threshold:   ${c.dim(String(result.belowThreshold))}`);
      out(`  Already exist:     ${c.dim(String(result.alreadyExists))}`);
      out(`  Skipped:           ${c.dim(String(result.skipped))}`);
      out(`  Failed:            ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);

      if (result.patterns.length > 0) {
        out(`\n${c.bold('Patterns:')}`);
        for (const p of result.patterns) {
          const scoreStr = p.score !== undefined ? ` (${p.score.toFixed(2)})` : '';
          const reasonStr = p.reasons && p.reasons.length > 0 ? ` — ${p.reasons.join(', ')}` : '';
          if (p.status === 'below-threshold') {
            out(`  ${c.dim('~')} ${c.dim(p.name)}${c.dim(scoreStr)} ${c.dim('— skipped (below threshold)')}`);
          } else if (p.status === 'registered') {
            out(`  ${c.boldGreen('+')} ${c.cyan(p.name)}${c.bold(scoreStr)}${c.dim(reasonStr)}`);
          } else if (p.status === 'dry-run') {
            out(`  ${c.yellow('+')} ${c.cyan(p.name)}${c.bold(scoreStr)}${c.dim(reasonStr)} ${c.yellow('[dry-run]')}`);
          } else {
            const statusColor = c.dim;
            out(`  ${statusColor('-')} ${statusColor(p.name)}${statusColor(scoreStr)} ${c.dim(p.file)}`);
          }
        }
      }
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Auto-register error: ' + err.message);
    }
  };
  handlers['auto-seed'] = (args) => {
    try {
      const { autoSeed } = require('../../../ci/auto-seed');
      const baseDir = args.dir || process.cwd();
      const dryRun = parseDryRun(args);
      const result = autoSeed(oracle, baseDir, { language: args.language, dryRun });
      if (dryRun) {
        out(c.boldCyan('Auto-Seed Dry Run:'));
        out(`  Discovered ${c.bold(String(result.discovered))} source file(s) with tests`);
        for (const p of result.patterns) {
          out(`  ${c.cyan(p.name)} (${c.blue(p.language)}) \u2014 ${p.functions.slice(0, 5).join(', ')}`);
        }
      } else {
        out(`${c.boldGreen('Auto-seeded:')} ${result.registered} registered, ${result.skipped} skipped, ${result.failed} failed`);
        for (const p of result.patterns) {
          out(`  ${c.cyan(p.name)} [${c.dim(p.id)}] coherency: ${colorScore(p.coherency)}`);
        }
      }
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Auto-seed error: ' + err.message);
    }
  };
  handlers['refresh-coherency'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.refreshAllCoherency !== 'function') {
        outErr(c.boldRed('Error:') + ' SQLite store required for coherency refresh');
        process.exit(1);
      }
      const result = sqliteStore.refreshAllCoherency();
      out(c.boldCyan('Coherency Refresh:'));
      out(`  Patterns:   ${c.bold(String(result.total))}`);
      out(`  Updated:    ${c.boldGreen(String(result.updated))}`);
      out(`  Avg before: ${colorScore(result.avgBefore)}`);
      out(`  Avg after:  ${colorScore(result.avgAfter)}`);
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Coherency refresh error: ' + err.message);
    }
  };
  handlers['synthesize-proven'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.synthesizeForUntested !== 'function') {
        outErr(c.boldRed('Error:') + ' SQLite store required for test synthesis');
        process.exit(1);
      }
      const result = sqliteStore.synthesizeForUntested();
      out(c.boldCyan('Test Synthesis for Proven Patterns:'));
      out(`  Untested:     ${c.bold(String(result.total))}`);
      out(`  Synthesized:  ${c.boldGreen(String(result.synthesized))}`);
      out(`  Failed:       ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);
      out(`  Avg before:   ${colorScore(result.avgBefore)}`);
      out(`  Avg after:    ${colorScore(result.avgAfter)}`);
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Synthesis error: ' + err.message);
    }
  };
  handlers['bootstrap-reliability'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.bootstrapReliability !== 'function') {
        outErr(c.boldRed('Error:') + ' SQLite store required');
        process.exit(1);
      }
      const result = sqliteStore.bootstrapReliability();
      out(c.boldCyan('Bootstrap Reliability:'));
      out(`  Zero-usage:    ${c.bold(String(result.total))}`);
      out(`  Bootstrapped:  ${c.boldGreen(String(result.bootstrapped))}`);
      out(`  Avg before:    ${colorScore(result.avgBefore)}`);
      out(`  Avg after:     ${colorScore(result.avgAfter)}`);
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Bootstrap error: ' + err.message);
    }
  };
  handlers['fix-untested'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.fixUntestedPatterns !== 'function') {
        outErr(c.boldRed('Error:') + ' SQLite store required');
        process.exit(1);
      }
      const result = sqliteStore.fixUntestedPatterns();
      out(c.boldCyan('Fix Untested Patterns:'));
      out(`  Total:     ${c.bold(String(result.total))}`);
      out(`  Fixed:     ${c.boldGreen(String(result.fixed))}`);
      out(`  Skipped:   ${c.dim(String(result.skipped))}`);
      out(`  Avg before: ${colorScore(result.avgBefore)}`);
      out(`  Avg after:  ${colorScore(result.avgAfter)}`);
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Fix error: ' + err.message);
    }
  };
  handlers['fix-completeness'] = () => {
    try {
      const sqliteStore = oracle.store.getSQLiteStore();
      if (!sqliteStore || typeof sqliteStore.fixCompleteness !== 'function') {
        outErr(c.boldRed('Error:') + ' SQLite store required');
        process.exit(1);
      }
      const result = sqliteStore.fixCompleteness();
      out(c.boldCyan('Fix Completeness:'));
      out(`  Total:     ${c.bold(String(result.total))}`);
      out(`  Fixed:     ${c.boldGreen(String(result.fixed))}`);
      out(`  Avg before: ${colorScore(result.avgBefore)}`);
      out(`  Avg after:  ${colorScore(result.avgAfter)}`);
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Fix completeness error: ' + err.message);
    }
  };
  handlers['ci-feedback'] = (args) => {
    const { CIFeedbackReporter } = require('../../../ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    const status = args.status;
    if (!status) { outErr(c.boldRed('Error:') + ` --status required (pass or fail). Usage: ${c.cyan('oracle ci-feedback --status pass')}`); process.exit(1); }
    const result = reporter.reportResults(status, {
      testOutput: args.output || '',
      commitSha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || '',
      ciProvider: process.env.GITHUB_ACTIONS ? 'github' : process.env.CI ? 'ci' : 'local',
    });
    if (result.reported === 0) {
      out(c.yellow(result.message));
    } else {
      out(`${c.boldGreen('Reported')} ${result.reported} pattern(s) as ${status === 'pass' ? c.boldGreen('PASS') : c.boldRed('FAIL')}:`);
      for (const u of result.updated) {
        out(`  ${c.cyan(u.id)} ${u.name ? c.bold(u.name) : ''} \u2192 reliability: ${colorScore(u.newReliability)}`);
      }
    }
    if (result.errors.length > 0) {
      out(`${c.boldRed('Errors:')} ${result.errors.map(e => `${e.id}: ${e.error}`).join(', ')}`);
    }
  };
  handlers['ci-stats'] = (args) => {
    const { CIFeedbackReporter } = require('../../../ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    const stats = reporter.stats();
    out(c.boldCyan('CI Feedback Stats:'));
    out(`  Tracked patterns: ${c.bold(String(stats.trackedPatterns))}`);
    out(`  Unreported: ${stats.unreported > 0 ? c.boldYellow(String(stats.unreported)) : c.dim('0')}`);
    out(`  Reported: ${c.boldGreen(String(stats.reported))}`);
    out(`  Total feedback events: ${c.bold(String(stats.totalFeedbackEvents))}`);
    if (stats.recentFeedback.length > 0) {
      out(`\n${c.bold('Recent feedback:')}`);
      for (const fb of stats.recentFeedback) {
        const statusColor = fb.status === 'pass' ? c.boldGreen : c.boldRed;
        out(`  ${c.dim(fb.timestamp)} ${statusColor(fb.status)} \u2014 ${fb.patternsReported} pattern(s) ${fb.commitSha ? c.dim(fb.commitSha.slice(0, 8)) : ''}`);
      }
    }
  };
  handlers['ci-track'] = (args) => {
    const { CIFeedbackReporter } = require('../../../ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    if (!args.id) { outErr(c.boldRed('Error:') + ' --id required'); process.exit(1); }
    const record = reporter.trackPull({ id: args.id, name: args.name || null, source: args.source || 'manual' });
    out(`${c.boldGreen('Tracking:')} ${c.cyan(record.id)} ${record.name ? c.bold(record.name) : ''}`);
  };
}
registerAutoCommands.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 14, period: 4,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'orchestration',
};

module.exports = { registerAutoCommands };
