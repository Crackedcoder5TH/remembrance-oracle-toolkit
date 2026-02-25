/**
 * Reflector CLI commands: self-reflector bot with 22 subcommands.
 */

const fs = require('fs');
const path = require('path');
const { c, colorScore } = require('../colors');

function registerReflectorCommands(handlers, { jsonOut }) {

  handlers['reflector'] = (args) => {
    const sub = args._sub;

    if (sub === 'help' || !sub) {
      console.log(`
${c.boldCyan('Remembrance Self-Reflector Bot')}

${c.bold('Subcommands:')}
  ${c.cyan('run')}        Run the self-reflector on the current codebase
  ${c.cyan('snapshot')}   Take a coherence snapshot without healing
  ${c.cyan('config')}     Show or update reflector configuration
  ${c.cyan('status')}     Show reflector status and recent runs
  ${c.cyan('workflow')}   Generate GitHub Actions workflow YAML
  ${c.cyan('evaluate')}   Evaluate a single file's coherence
  ${c.cyan('heal')}       Heal a single file via SERF reflection
  ${c.cyan('multi')}      Multi-repo: snapshot + compare + drift + heal two repos together
  ${c.cyan('compare')}    Compare dimensions between two repos side-by-side
  ${c.cyan('drift')}      Detect pattern drift (diverged shared functions) between repos
  ${c.cyan('dry-run')}    Simulate healing without modifying files (safety preview)
  ${c.cyan('rollback')}   Revert to the last backup state (undo healing)
  ${c.cyan('safe-run')}   Run reflector with full safety protections (backup + guard + approval)
  ${c.cyan('backups')}    List available backup manifests
  ${c.cyan('deep-score')} Deep coherence analysis of a single file (complexity, security, nesting)
  ${c.cyan('repo-score')} Aggregate repo-level deep coherence score
  ${c.cyan('central')}    View central configuration (all sections)
  ${c.cyan('central-set')} Set a config value: --key <path> --value <val>
  ${c.cyan('central-reset')} Reset config to defaults (or --section <name>)
  ${c.cyan('history')}    View run history timeline with before/after scores
  ${c.cyan('trend')}      Show ASCII coherence trend chart
  ${c.cyan('stats')}      Show reflector statistics and trends
  ${c.cyan('log')}        Show recent log entries

${c.bold('Options:')}
  ${c.yellow('--min-coherence')} <n>  Minimum coherence threshold (default: 0.7)
  ${c.yellow('--max-files')} <n>      Max files to scan per run (default: 50)
  ${c.yellow('--push')}               Push healing branch to remote
  ${c.yellow('--open-pr')}            Open a PR with healing changes
  ${c.yellow('--auto-merge')}         Auto-merge high-coherence PRs
  ${c.yellow('--file')} <path>        File to evaluate/heal (for evaluate/heal)
  ${c.yellow('--repos')} <a,b>        Comma-separated repo paths (for multi/compare/drift)
  ${c.yellow('--dry-run')}            Preview changes without applying them
  ${c.yellow('--require-approval')}   Require explicit approval before merge
  ${c.yellow('--auto-rollback')}      Auto-rollback if coherence drops (default: true)
  ${c.yellow('--backup-id')} <id>     Specific backup to rollback to
  ${c.yellow('--key')} <path>         Config key in dot-notation (e.g. thresholds.minCoherence)
  ${c.yellow('--value')} <val>        Value to set for --key
  ${c.yellow('--section')} <name>     Config section to reset (e.g. thresholds, safety)
  ${c.yellow('--json')}               Output as JSON
      `);
      return;
    }

    if (sub === 'run') {
      const { runReflector } = require('../../reflector/multi');
      const opts = {
        minCoherence: args['min-coherence'] ? parseFloat(args['min-coherence']) : undefined,
        maxFilesPerRun: args['max-files'] ? parseInt(args['max-files']) : undefined,
        push: args.push === true,
        openPR: args['open-pr'] === true,
        autoMerge: args['auto-merge'] === true,
      };
      console.log(c.boldCyan('Running Self-Reflector...\n'));
      const result = runReflector(process.cwd(), opts);
      if (jsonOut()) {
        console.log(JSON.stringify(result, null, 2));
        if (result?.error || result?.branchError) process.exit(1);
        return;
      }
      if (result.skipped) {
        console.log(c.yellow('Skipped:'), result.reason);
        return;
      }
      if (result.error) {
        console.error(c.boldRed('Error:'), result.error);
        process.exit(1);
      }
      const report = result.report || {};
      console.log(`  Files scanned:         ${c.bold(String(report.filesScanned ?? 0))}`);
      console.log(`  Files below threshold: ${c.yellow(String(report.filesBelowThreshold ?? 0))}`);
      console.log(`  Files healed:          ${c.boldGreen(String(report.filesHealed ?? 0))}`);
      console.log(`  Avg improvement:       ${colorScore(report.avgImprovement ?? 0)}`);
      console.log(`  Auto-merge recommended: ${report.autoMergeRecommended ? c.boldGreen('yes') : c.dim('no')}`);
      console.log(`\n  ${c.dim('Whisper:')} "${report.collectiveWhisper ?? ''}"`);
      if (result.branch) console.log(`\n  Branch: ${c.cyan(result.branch)}`);
      if (result.prUrl) console.log(`  PR: ${c.cyan(result.prUrl)}`);
      if (result.branchError) console.log(`  ${c.boldRed('Branch error:')} ${result.branchError}`);
      console.log(`\n  Duration: ${result.durationMs}ms`);
      return;
    }

    if (sub === 'snapshot') {
      const { takeSnapshot } = require('../../reflector/multi');
      const opts = {
        minCoherence: args['min-coherence'] ? parseFloat(args['min-coherence']) : undefined,
        maxFilesPerRun: args['max-files'] ? parseInt(args['max-files']) : undefined,
      };
      console.log(c.boldCyan('Taking Coherence Snapshot...\n'));
      const snap = takeSnapshot(process.cwd(), opts);
      if (jsonOut()) { console.log(JSON.stringify(snap, null, 2)); return; }
      const agg = snap.aggregate || {};
      console.log(`  Files scanned:   ${c.bold(String(agg.totalFiles ?? 0))}`);
      console.log(`  Valid files:     ${c.bold(String(agg.validFiles ?? 0))}`);
      console.log(`  Avg coherence:   ${colorScore(agg.avgCoherence ?? 0)}`);
      console.log(`  Min coherence:   ${colorScore(agg.minCoherence ?? 0)}`);
      console.log(`  Max coherence:   ${colorScore(agg.maxCoherence ?? 0)}`);
      if ((agg.covenantViolations ?? 0) > 0) {
        console.log(`  Covenant issues: ${c.boldRed(String(agg.covenantViolations))}`);
      }
      if (agg.dimensionAverages) {
        console.log(`\n${c.bold('Dimensions:')}`);
        for (const [dim, val] of Object.entries(agg.dimensionAverages)) {
          const bar = '\u2588'.repeat(Math.round(val * 20));
          const faded = '\u2591'.repeat(20 - Math.round(val * 20));
          console.log(`  ${dim.padEnd(14)} ${bar}${faded} ${colorScore(val)}`);
        }
      }
      if (snap.belowThreshold && snap.belowThreshold.length > 0) {
        console.log(`\n${c.bold('Below Threshold:')}`);
        for (const f of snap.belowThreshold) {
          console.log(`  ${c.yellow(f.path)} \u2014 coherence: ${colorScore(f.coherence)}`);
        }
      }
      return;
    }

    if (sub === 'config') {
      const { loadConfig, saveConfig } = require('../../reflector/multi');
      const config = loadConfig(process.cwd());
      const settable = ['enabled', 'intervalHours', 'minCoherence', 'autoMerge', 'autoMergeThreshold', 'push', 'openPR', 'maxFilesPerRun', 'skipIfPROpen'];
      let changed = false;
      for (const key of settable) {
        const kebab = key.replace(/[A-Z]/g, m => '-' + m.toLowerCase());
        if (args[kebab] !== undefined) {
          const val = args[kebab];
          if (val === 'true') config[key] = true;
          else if (val === 'false') config[key] = false;
          else if (!isNaN(parseFloat(val))) config[key] = parseFloat(val);
          else config[key] = val;
          changed = true;
        }
      }
      if (changed) {
        saveConfig(process.cwd(), config);
        console.log(c.boldGreen('Configuration updated.'));
      }
      if (jsonOut()) { console.log(JSON.stringify(config, null, 2)); return; }
      console.log(c.boldCyan('Reflector Configuration:\n'));
      for (const [k, v] of Object.entries(config)) {
        console.log(`  ${c.bold(k.padEnd(22))} ${typeof v === 'boolean' ? (v ? c.boldGreen('true') : c.dim('false')) : c.cyan(String(v))}`);
      }
      return;
    }

    if (sub === 'status') {
      const { getStatus } = require('../../reflector/multi');
      const status = getStatus(process.cwd());
      if (jsonOut()) { console.log(JSON.stringify(status, null, 2)); return; }
      console.log(c.boldCyan('Reflector Status:\n'));
      console.log(`  Enabled:    ${status.config?.enabled ? c.boldGreen('yes') : c.dim('no')}`);
      console.log(`  Interval:   ${c.cyan((status.config?.intervalHours ?? '?') + 'h')}`);
      console.log(`  Total runs: ${c.bold(String(status.totalRuns ?? 0))}`);
      if (status.lastRun) {
        console.log(`\n${c.bold('Last Run:')}`);
        console.log(`  ID:       ${c.dim(status.lastRun.id)}`);
        console.log(`  Started:  ${status.lastRun.startedAt}`);
        console.log(`  Duration: ${status.lastRun.durationMs}ms`);
        if (status.lastRun.report) {
          console.log(`  Healed:   ${c.boldGreen(String(status.lastRun.report.filesHealed))}`);
          console.log(`  Whisper:  "${c.dim(status.lastRun.report.collectiveWhisper ?? '')}"`);
        }
        if (status.lastRun.skipped) {
          console.log(`  Skipped:  ${c.yellow(status.lastRun.reason)}`);
        }
      }
      if (status.recentRuns && status.recentRuns.length > 1) {
        console.log(`\n${c.bold('Recent Runs:')}`);
        for (const run of status.recentRuns) {
          const healed = run.report ? run.report.filesHealed : (run.skipped ? 'skipped' : 'error');
          console.log(`  ${c.dim(run.id)} ${run.startedAt} \u2014 healed: ${healed}`);
        }
      }
      return;
    }

    if (sub === 'workflow') {
      const { generateReflectorWorkflow } = require('../../reflector/report');
      const workflow = generateReflectorWorkflow({
        schedule: args.schedule || '0 */6 * * *',
        minCoherence: args['min-coherence'] ? parseFloat(args['min-coherence']) : 0.7,
        autoMerge: args['auto-merge'] === true,
      });
      if (jsonOut()) { console.log(JSON.stringify({ workflow })); return; }
      console.log(workflow);
      return;
    }

    if (sub === 'evaluate') {
      if (!args.file) { console.error(c.boldRed('Error:') + ' --file required'); process.exit(1); }
      const { evaluateFile } = require('../../reflector/multi');
      const filePath = path.resolve(args.file);
      const result = evaluateFile(filePath);
      if (jsonOut()) { console.log(JSON.stringify(result, null, 2)); return; }
      if (result.error) { console.error(c.boldRed('Error:'), result.error); process.exit(1); }
      console.log(c.boldCyan(`Evaluation: ${args.file}\n`));
      console.log(`  Language:  ${c.cyan(result.language)}`);
      console.log(`  Coherence: ${colorScore(result.coherence)}`);
      console.log(`  Covenant:  ${result.covenantSealed ? c.boldGreen('sealed') : c.boldRed('VIOLATED')}`);
      console.log(`  Size:      ${result.size} chars, ${result.lines} lines`);
      if (result.dimensions) {
        console.log(`\n${c.bold('Dimensions:')}`);
        for (const [dim, val] of Object.entries(result.dimensions)) {
          const bar = '\u2588'.repeat(Math.round(val * 20));
          const faded = '\u2591'.repeat(20 - Math.round(val * 20));
          console.log(`  ${dim.padEnd(14)} ${bar}${faded} ${colorScore(val)}`);
        }
      }
      return;
    }

    if (sub === 'heal') {
      if (!args.file) { console.error(c.boldRed('Error:') + ' --file required'); process.exit(1); }
      const { healFile } = require('../../reflector/multi');
      const filePath = path.resolve(args.file);
      const result = healFile(filePath);
      if (jsonOut()) { console.log(JSON.stringify(result, null, 2)); return; }
      if (result.error) { console.error(c.boldRed('Error:'), result.error); process.exit(1); }
      console.log(c.boldCyan(`Healing: ${args.file}\n`));
      console.log(`  Language:           ${c.cyan(result.language)}`);
      console.log(`  Original coherence: ${colorScore(result.original?.coherence ?? 0)}`);
      console.log(`  Healed coherence:   ${colorScore(result.healed?.coherence ?? 0)}`);
      console.log(`  Improvement:        ${colorScore(result.improvement ?? 0)}`);
      console.log(`  Changed:            ${result.changed ? c.boldGreen('yes') : c.dim('no')}`);
      console.log(`  Loops:              ${result.loops ?? 0}`);
      console.log(`\n  Whisper: "${c.dim(result.whisper ?? '')}"`);
      if (result.changed) {
        console.log(`\n${c.bold('Healed Code:')}\n`);
        console.log(result.healed?.code ?? '');
      }
      return;
    }

    if (sub === 'multi') {
      const repos = args.repos ? args.repos.split(',').map(r => path.resolve(r.trim())) : null;
      if (!repos || repos.length < 2) {
        console.error(c.boldRed('Error:') + ' --repos requires at least 2 comma-separated paths');
        process.exit(1);
      }
      const { multiReflect, formatMultiReport } = require('../../reflector/multi');
      const opts = {
        minCoherence: args['min-coherence'] ? parseFloat(args['min-coherence']) : undefined,
        maxFilesPerRun: args['max-files'] ? parseInt(args['max-files']) : undefined,
      };
      console.log(c.boldCyan('Running Multi-Repo Reflector...\n'));
      const report = multiReflect(repos, opts);
      if (jsonOut()) { console.log(JSON.stringify(report, null, 2)); return; }
      console.log(formatMultiReport(report));
      return;
    }

    if (sub === 'compare') {
      const repos = args.repos ? args.repos.split(',').map(r => path.resolve(r.trim())) : null;
      if (!repos || repos.length < 2) {
        console.error(c.boldRed('Error:') + ' --repos requires at least 2 comma-separated paths');
        process.exit(1);
      }
      const { multiSnapshot, compareDimensions } = require('../../reflector/multi');
      const opts = {
        maxFilesPerRun: args['max-files'] ? parseInt(args['max-files']) : undefined,
      };
      console.log(c.boldCyan('Comparing Dimensions...\n'));
      const snap = multiSnapshot(repos, opts);
      const cmp = compareDimensions(snap);
      if (jsonOut()) { console.log(JSON.stringify(cmp, null, 2)); return; }
      console.log(`  ${c.bold(cmp.repoA?.name ?? 'A')} avg: ${colorScore(cmp.repoA?.avgCoherence ?? 0)}`);
      console.log(`  ${c.bold(cmp.repoB?.name ?? 'B')} avg: ${colorScore(cmp.repoB?.avgCoherence ?? 0)}`);
      console.log(`  Leader: ${c.boldGreen(cmp.coherenceLeader ?? '?')} (delta: ${(cmp.coherenceDelta ?? 0) >= 0 ? '+' : ''}${(cmp.coherenceDelta ?? 0).toFixed(3)})`);
      console.log(`  Convergence: ${colorScore(cmp.convergenceScore ?? 0)}`);
      console.log('');
      for (const comp of (cmp.comparisons || [])) {
        const keys = Object.keys(comp);
        const valA = comp[keys[1]];
        const valB = comp[keys[2]];
        const arrow = (comp.delta ?? 0) > 0 ? '\u25B2' : (comp.delta ?? 0) < 0 ? '\u25BC' : '=';
        const sev = comp.severity === 'high' ? c.boldRed(comp.severity) : comp.severity === 'medium' ? c.yellow(comp.severity) : c.dim(comp.severity);
        console.log(`  ${(comp.dimension || '').padEnd(14)} ${String(valA).padStart(5)} vs ${String(valB).padStart(5)}  ${arrow} ${(comp.delta ?? 0) >= 0 ? '+' : ''}${(comp.delta ?? 0).toFixed(3)}  [${sev}]`);
      }
      return;
    }

    if (sub === 'drift') {
      const repos = args.repos ? args.repos.split(',').map(r => path.resolve(r.trim())) : null;
      if (!repos || repos.length < 2) {
        console.error(c.boldRed('Error:') + ' --repos requires at least 2 comma-separated paths');
        process.exit(1);
      }
      const { detectDrift } = require('../../reflector/multi');
      const opts = {
        maxFilesPerRun: args['max-files'] ? parseInt(args['max-files']) : undefined,
      };
      console.log(c.boldCyan('Detecting Pattern Drift...\n'));
      const drift = detectDrift(repos, opts);
      if (jsonOut()) { console.log(JSON.stringify(drift, null, 2)); return; }
      console.log(`  ${c.bold(drift.repoA?.name ?? 'A')}: ${drift.repoA?.functions ?? 0} functions`);
      console.log(`  ${c.bold(drift.repoB?.name ?? 'B')}: ${drift.repoB?.functions ?? 0} functions`);
      console.log('');
      console.log(`  Shared (identical): ${c.boldGreen(String(drift.shared ?? 0))}`);
      console.log(`  Diverged:           ${(drift.diverged ?? 0) > 0 ? c.boldRed(String(drift.diverged)) : c.dim('0')}`);
      console.log(`  Unique to ${drift.repoA?.name ?? 'A'}: ${c.cyan(String(drift.uniqueToA ?? 0))}`);
      console.log(`  Unique to ${drift.repoB?.name ?? 'B'}: ${c.cyan(String(drift.uniqueToB ?? 0))}`);
      console.log(`  Avg drift:          ${colorScore(1 - (drift.avgDrift ?? 0))}`);
      console.log(`  Convergence:        ${colorScore(drift.convergenceScore ?? 0)}`);
      if (drift.details?.diverged?.length > 0) {
        console.log(`\n${c.bold('Diverged Functions:')}`);
        for (const d of drift.details.diverged.slice(0, 20)) {
          console.log(`  ${c.yellow(d.name)} \u2014 drift: ${(d.drift ?? 0).toFixed(3)} (${d.status})`);
          console.log(`    ${c.dim(d.fileA)} vs ${c.dim(d.fileB)}`);
        }
      }
      return;
    }

    if (sub === 'dry-run') {
      const { dryRun } = require('../../reflector/report');
      const opts = {
        minCoherence: args['min-coherence'] ? parseFloat(args['min-coherence']) : undefined,
        maxFilesPerRun: args['max-files'] ? parseInt(args['max-files']) : undefined,
      };
      console.log(c.boldCyan('Dry-Run: Simulating Healing...\n'));
      const result = dryRun(process.cwd(), opts);
      if (jsonOut()) { console.log(JSON.stringify(result, null, 2)); return; }
      const summary = result.summary || {};
      console.log(`  ${c.bold('Mode:')}             ${c.yellow('DRY-RUN (no files modified)')}`);
      console.log(`  Files scanned:     ${c.bold(String(summary.filesScanned ?? 0))}`);
      console.log(`  Would heal:        ${(summary.wouldHeal ?? 0) > 0 ? c.boldGreen(String(summary.wouldHeal)) : c.dim('0')}`);
      console.log(`  Projected improve: ${colorScore(summary.projectedAvgImprovement ?? 0)}`);
      console.log(`  Coherence before:  ${colorScore(result.projectedCoherence?.before ?? 0)}`);
      console.log(`  Coherence after:   ${colorScore(result.projectedCoherence?.after ?? 0)}`);
      if (result.healings && result.healings.length > 0) {
        console.log(`\n${c.bold('Projected Healings:')}`);
        for (const h of result.healings) {
          console.log(`  ${c.yellow(h.path)} ${(h.currentCoherence ?? 0).toFixed(3)} -> ${(h.projectedCoherence ?? 0).toFixed(3)} (+${(h.improvement ?? 0).toFixed(3)})`);
          console.log(`    ${c.dim(h.whisper ?? '')}`);
        }
      }
      console.log(`\n  ${c.dim(result.warning ?? '')}`);
      return;
    }

    if (sub === 'rollback') {
      const { rollback, loadBackupManifests } = require('../../reflector/report');
      const backupId = args['backup-id'] || null;
      const manifests = loadBackupManifests(process.cwd());
      if (manifests.length === 0) {
        console.error(c.boldRed('No backups found.') + ' Run a reflector cycle first to create a backup.');
        process.exit(1);
      }
      console.log(c.boldCyan('Rolling Back...\n'));
      const result = rollback(process.cwd(), { backupId, verify: true });
      if (jsonOut()) { console.log(JSON.stringify(result, null, 2)); return; }
      if (result.success) {
        console.log(`  ${c.boldGreen('Rollback successful!')}`);
        console.log(`  Backup ID: ${c.dim(result.backupId)}`);
        console.log(`  Strategy:  ${c.cyan(result.strategy)}`);
        if (result.filesRestored) console.log(`  Files restored: ${c.bold(String(result.filesRestored))}`);
        if (result.coherenceBefore !== undefined) {
          console.log(`  Coherence before rollback: ${colorScore(result.coherenceBefore)}`);
          console.log(`  Coherence after rollback:  ${colorScore(result.coherenceAfter)}`);
        }
      } else {
        console.error(`  ${c.boldRed('Rollback failed:')} ${result.error}`);
        process.exit(1);
      }
      return;
    }

    if (sub === 'safe-run') {
      const { safeReflect } = require('../../reflector/report');
      const opts = {
        minCoherence: args['min-coherence'] ? parseFloat(args['min-coherence']) : undefined,
        maxFilesPerRun: args['max-files'] ? parseInt(args['max-files']) : undefined,
        push: args.push === true,
        openPR: args['open-pr'] === true,
        autoMerge: args['auto-merge'] === true,
        dryRunMode: args['dry-run'] === true,
        requireApproval: args['require-approval'] === true,
        autoRollback: args['auto-rollback'] !== 'false',
      };
      console.log(c.boldCyan('Running Safe Reflector...\n'));
      const result = safeReflect(process.cwd(), opts);
      if (jsonOut()) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(`  Mode:    ${c.cyan(result.mode ?? 'unknown')}`);
      if (result.safety?.backup) {
        console.log(`  Backup:  ${result.safety.backup.id ? c.boldGreen(result.safety.backup.id) : c.dim('none')}`);
      }
      if (result.report) {
        console.log(`  Healed:  ${c.boldGreen(String(result.report.filesHealed ?? 0))}`);
        console.log(`  Improve: ${colorScore(result.report.avgImprovement ?? 0)}`);
        console.log(`  Whisper: "${c.dim(result.report.collectiveWhisper ?? '')}"`);
      }
      if (result.safety?.coherenceGuard) {
        const g = result.safety.coherenceGuard;
        console.log(`\n${c.bold('Coherence Guard:')}`);
        console.log(`  Pre:    ${colorScore(g.preCoherence ?? 0)}`);
        console.log(`  Post:   ${colorScore(g.postCoherence ?? 0)}`);
        console.log(`  Delta:  ${(g.delta ?? 0) >= 0 ? c.boldGreen('+' + (g.delta ?? 0).toFixed(3)) : c.boldRed((g.delta ?? 0).toFixed(3))}`);
        console.log(`  Status: ${g.severity === 'positive' ? c.boldGreen(g.severity) : g.severity === 'critical' ? c.boldRed(g.severity) : c.yellow(g.severity)}`);
      }
      if (result.safety?.approval) {
        const a = result.safety.approval;
        console.log(`\n${c.bold('Approval Gate:')}`);
        console.log(`  ${a.approved ? c.boldGreen('APPROVED') : c.boldRed('REQUIRES REVIEW')}`);
        console.log(`  ${c.dim(a.reason ?? '')}`);
      }
      if (result.safety?.autoRolledBack) {
        console.log(`\n  ${c.boldRed('AUTO-ROLLBACK TRIGGERED!')}`);
        console.log(`  ${c.dim(result.safety.rollbackReason ?? '')}`);
      }
      console.log(`\n  Duration: ${result.durationMs ?? 0}ms`);
      return;
    }

    if (sub === 'backups') {
      const { loadBackupManifests } = require('../../reflector/report');
      const manifests = loadBackupManifests(process.cwd());
      if (jsonOut()) { console.log(JSON.stringify(manifests, null, 2)); return; }
      if (manifests.length === 0) {
        console.log(c.dim('No backups found.'));
        return;
      }
      console.log(c.boldCyan('Backup Manifests:\n'));
      for (const m of manifests) {
        console.log(`  ${c.bold(m.id)}`);
        console.log(`    Created:  ${m.timestamp}`);
        console.log(`    Strategy: ${c.cyan(m.strategy)}`);
        console.log(`    Label:    ${c.dim(m.label)}`);
        if (m.branch) console.log(`    Branch:   ${c.cyan(m.branch)}`);
        if (m.files && m.files.length > 0) console.log(`    Files:    ${m.files.length}`);
        console.log('');
      }
      return;
    }

    if (sub === 'deep-score') {
      if (!args.file) { console.error(c.boldRed('Error:') + ' --file required'); process.exit(1); }
      const { deepScore, formatDeepScore } = require('../../reflector/scoring');
      const filePath = path.resolve(args.file);
      let code;
      try { code = fs.readFileSync(filePath, 'utf-8'); } catch (err) {
        console.error(c.boldRed('Error:'), err.message); process.exit(1);
      }
      const result = deepScore(code);
      if (jsonOut()) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(c.boldCyan(`Deep Score: ${args.file}\n`));
      console.log(formatDeepScore(result));
      return;
    }

    if (sub === 'repo-score') {
      const { repoScore } = require('../../reflector/scoring');
      const opts = {
        maxFilesPerRun: args['max-files'] ? parseInt(args['max-files']) : undefined,
      };
      console.log(c.boldCyan('Computing Repo-Level Deep Score...\n'));
      const result = repoScore(process.cwd(), opts);
      if (jsonOut()) { console.log(JSON.stringify(result, null, 2)); return; }
      console.log(`  Files scored:    ${c.bold(String(result.totalFiles ?? 0))}`);
      console.log(`  Aggregate score: ${colorScore(result.aggregate ?? 0)}`);
      console.log(`  Health:          ${result.health === 'healthy' ? c.boldGreen(result.health) : result.health === 'stable' ? c.yellow(result.health) : c.boldRed(result.health ?? 'unknown')}`);
      if (result.dimensions) {
        console.log(`\n${c.bold('Dimensions:')}`);
        for (const [dim, val] of Object.entries(result.dimensions)) {
          const bar = '\u2588'.repeat(Math.round(val * 20));
          const faded = '\u2591'.repeat(20 - Math.round(val * 20));
          console.log(`  ${dim.padEnd(16)} ${bar}${faded} ${colorScore(val)}`);
        }
      }
      if (result.worstFiles && result.worstFiles.length > 0) {
        console.log(`\n${c.bold('Worst Files:')}`);
        for (const f of result.worstFiles) {
          console.log(`  ${c.yellow(f.path)} \u2014 ${colorScore(f.score)}`);
        }
      }
      if (result.securityFindings && result.securityFindings.length > 0) {
        console.log(`\n${c.bold('Security Findings:')}`);
        for (const f of result.securityFindings.slice(0, 10)) {
          const icon = f.severity === 'critical' ? c.boldRed('[!!]') : f.severity === 'high' ? c.boldRed('[!]') : c.yellow('[~]');
          console.log(`  ${icon} ${f.file}: ${f.message}`);
        }
      }
      return;
    }

    if (sub === 'central') {
      const { loadCentralConfig, formatCentralConfig, validateConfig } = require('../../reflector/scoring');
      const config = loadCentralConfig(process.cwd());
      if (jsonOut()) { console.log(JSON.stringify(config, null, 2)); return; }
      console.log(c.boldCyan('Central Configuration:\n'));
      console.log(formatCentralConfig(config));
      const validation = validateConfig(config);
      if (!validation.valid) {
        console.log(c.boldRed('Validation Issues:'));
        for (const issue of validation.issues) {
          console.log(`  ${c.yellow('!')} ${issue}`);
        }
      }
      return;
    }

    if (sub === 'central-set') {
      if (!args.key) { console.error(c.boldRed('Error:') + ' --key required (e.g. thresholds.minCoherence)'); process.exit(1); }
      if (args.value === undefined) { console.error(c.boldRed('Error:') + ' --value required'); process.exit(1); }
      const { setCentralValue, validateConfig } = require('../../reflector/scoring');
      let value = args.value;
      if (value === 'true') value = true;
      else if (value === 'false') value = false;
      else if (!isNaN(parseFloat(value)) && String(parseFloat(value)) === value) value = parseFloat(value);
      else if (value.startsWith('[') && value.endsWith(']')) {
        try { value = JSON.parse(value); } catch { /* keep as string */ }
      }
      const config = setCentralValue(process.cwd(), args.key, value);
      const validation = validateConfig(config);
      if (jsonOut()) { console.log(JSON.stringify({ key: args.key, value, valid: validation.valid }, null, 2)); return; }
      console.log(`${c.boldGreen('Set:')} ${c.cyan(args.key)} = ${c.bold(JSON.stringify(value))}`);
      if (!validation.valid) {
        for (const issue of validation.issues) {
          console.log(`  ${c.yellow('Warning:')} ${issue}`);
        }
      }
      return;
    }

    if (sub === 'central-reset') {
      const { resetCentralConfig } = require('../../reflector/scoring');
      const section = args.section || null;
      const config = resetCentralConfig(process.cwd(), section);
      if (jsonOut()) { console.log(JSON.stringify(config, null, 2)); return; }
      if (section) {
        console.log(`${c.boldGreen('Reset:')} section "${c.cyan(section)}" restored to defaults`);
      } else {
        console.log(c.boldGreen('Reset: all configuration restored to defaults'));
      }
      return;
    }

    if (sub === 'history') {
      const { generateTimeline, loadHistoryV2 } = require('../../reflector/report');
      const count = args.last ? parseInt(args.last) : 10;
      if (jsonOut()) {
        console.log(JSON.stringify(loadHistoryV2(process.cwd()), null, 2));
        return;
      }
      console.log(c.boldCyan('Reflector Run History\n'));
      console.log(generateTimeline(process.cwd(), count));
      return;
    }

    if (sub === 'trend') {
      const { generateTrendChart, loadHistoryV2 } = require('../../reflector/report');
      const opts = {
        width: args.width ? parseInt(args.width) : 60,
        height: args.height ? parseInt(args.height) : 15,
        last: args.last ? parseInt(args.last) : 30,
      };
      if (jsonOut()) {
        const history = loadHistoryV2(process.cwd());
        const values = (history.runs || []).map(r => ({ timestamp: r.timestamp, coherence: r.coherence?.after }));
        console.log(JSON.stringify(values, null, 2));
        return;
      }
      console.log(c.boldCyan('Coherence Trend\n'));
      console.log(generateTrendChart(process.cwd(), opts));
      return;
    }

    if (sub === 'stats') {
      const { computeStats } = require('../../reflector/report');
      const stats = computeStats(process.cwd());
      if (jsonOut()) { console.log(JSON.stringify(stats, null, 2)); return; }
      console.log(c.boldCyan('Reflector Statistics\n'));
      console.log(`  Total runs:       ${c.bold(String(stats.totalRuns ?? 0))}`);
      console.log(`  Avg coherence:    ${colorScore(stats.avgCoherence ?? 0)}`);
      console.log(`  Avg improvement:  ${colorScore(stats.avgImprovement ?? 0)}`);
      console.log(`  Total healed:     ${c.boldGreen(String(stats.totalFilesHealed ?? 0))}`);
      console.log(`  Trend:            ${stats.trend === 'improving' ? c.boldGreen(stats.trend) : stats.trend === 'declining' ? c.boldRed(stats.trend) : c.dim(stats.trend ?? 'unknown')}`);
      if (stats.bestRun) {
        console.log(`  Best run:         ${c.dim(stats.bestRun.id)} (${colorScore(stats.bestRun.coherence)})`);
      }
      if (stats.recentRuns && stats.recentRuns.length > 0) {
        console.log(`\n${c.bold('Recent Runs:')}`);
        for (const r of stats.recentRuns) {
          console.log(`  ${c.dim(r.id)} ${r.timestamp?.slice(0, 19) || '?'} coherence: ${colorScore(r.coherence)} healed: ${r.healed} [${r.health}]`);
        }
      }
      return;
    }

    if (sub === 'log') {
      const { readLogTail } = require('../../reflector/report');
      const n = args.last ? parseInt(args.last) : 20;
      const lines = readLogTail(process.cwd(), n);
      if (jsonOut()) { console.log(JSON.stringify(lines)); return; }
      if (lines.length === 0) {
        console.log(c.dim('No log entries found.'));
        return;
      }
      console.log(c.boldCyan('Reflector Log (last ' + n + ' entries)\n'));
      for (const line of lines) {
        if (line.includes('[ERROR]')) console.log(c.boldRed(line));
        else if (line.includes('[WARN]')) console.log(c.yellow(line));
        else console.log(c.dim(line));
      }
      return;
    }

    console.error(`${c.boldRed('Unknown reflector subcommand:')} ${sub}. Run ${c.cyan('oracle reflector help')} for usage.`);
    process.exit(1);
  };
}

module.exports = { registerReflectorCommands };
