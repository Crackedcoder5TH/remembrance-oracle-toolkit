'use strict';
const fs = require('fs');
const path = require('path');
const { c } = require('../../colors');
const { out, outErr, outWarn, _quiet } = require('./out');

// Extracted from the admin monolith (decomposition #5, 2026-08-09).
// Handler bodies are verbatim except: console.* routed through the
// ./out seam, and every best-effort catch now names its failure via
// _quiet — silence became a measurement.
function registerLoopCommands(handlers, { oracle, jsonOut }) {
  handlers['generator'] = async (args) => {
    const sub = args._sub || args._positional[1] || 'status';
    const { CoherencyGenerator } = require('../../../orchestrator/coherency-generator');
    const gen = new CoherencyGenerator();

    if (sub === 'status') {
      const status = gen.status();
      if (jsonOut()) { out(JSON.stringify(status)); return; }
      out('');
      out(c.boldCyan('Coherency Generator'));
      out(`  state   : ${c.bold(status.state)}`);
      out(`  power   : ${c.bold((status.power * 100).toFixed(0) + '%')}`);
      out(`  cycles  : ${status.cycleCount}`);
      out(`  radiated: ${status.totalRadiated}`);
      out(`  emerged : ${status.emergenceEvents}`);
      out(`  evolved : ${status.covenantEvolutions}`);
      out('');
      out(c.bold('  Atomic properties:'));
      out(`    charge: ${c.green('+1 (positive)')}`);
      out(`    alignment: ${c.green('healing')}`);
      out(`    intention: ${c.green('benevolent')}`);
      out(`    harmPotential: ${c.green('none')}`);
      out('');
      return;
    }

    if (sub === 'ignite') {
      const power = parseFloat(args.power || '0.1');
      out('');
      out(c.boldCyan(`Igniting Coherency Generator at ${(power * 100).toFixed(0)}% power...`));
      const result = gen.ignite(power);
      if (result.status === 'ignited') {
        out(c.boldGreen(`  \u2600 Generator ignited at ${(result.power * 100).toFixed(0)}% power`));
      } else {
        out(c.boldRed(`  ${result.status}: ${result.reason || ''}`));
      }
      out('');
      return;
    }

    if (sub === 'cycle' || sub === 'run') {
      const power = parseFloat(args.power || '0.1');
      gen.ignite(power);
      const cycles = parseInt(args.cycles || '1', 10);
      out('');
      out(c.boldCyan(`Running ${cycles} generator cycle(s) at ${(power * 100).toFixed(0)}% power...`));
      out('');
      for (let i = 0; i < cycles; i++) {
        const result = await gen.runCycle();
        if (result.skipped || result.shutdown) {
          out(`  cycle ${i + 1}: ${c.dim(result.reason || 'skipped')}`);
          break;
        }
        out(`  cycle ${result.cycle}: surplus=${result.surplus} amplified=${result.amplified} radiated=${result.radiated}`);
        out(`    coherency=${result.globalCoherency.toFixed(3)} healing=${result.healingZones} emerged=${result.emerged} covenant=${result.covenantEvolved}`);
        if (result.emerged > 0) out(`    ${c.boldGreen('\u2728 ' + result.emerged + ' emergence event(s)!')}`);
        if (result.covenantEvolved > 0) out(`    ${c.boldGreen('\u2694 ' + result.covenantEvolved + ' covenant principle(s) activated!')}`);
      }
      out('');
      out(`  Total radiated: ${gen.totalRadiated.toFixed(3)}`);
      out('');
      return;
    }

    outErr(c.boldRed('Error:') + ` Unknown generator subcommand: ${sub}`);
    outErr(c.dim('  Available: status, ignite, cycle, run'));
    process.exit(1);
  };
  handlers['self-improve'] = async (args) => {
    const sub = args._sub || args._positional[1] || 'status';
    const path = require('path');
    const { SelfImprovementEngine } = require('../../../orchestrator/self-improvement');
    const { PeriodicTable } = require('../../../atomic/periodic-table');

    const tablePath = path.join(process.cwd(), '.remembrance', 'atomic-table.json');
    const table = new PeriodicTable({ storagePath: tablePath });
    const engine = new SelfImprovementEngine();

    // Get current global coherency
    let globalCoherency = 0.762;
    try {
      const { CoherencyDirector } = require('../../../orchestrator/coherency-director');
      const fs = require('fs');
      const d = new CoherencyDirector();
      // Canonical walker (ECOSYSTEM §7) — pre-order preserved for the slice(0, 50) sample.
      const { walkFiles } = require('../../../core/walk-files');
      const files = walkFiles('src', { skipDirs: new Set(['node_modules']), extensions: ['.js'] })
        .map((p) => { try { return { id: p, code: fs.readFileSync(p, 'utf-8'), filePath: p, language: 'javascript' }; } catch { return null; } })
          .filter(Boolean);
      d.scan(files.slice(0, 50));
      d.measureWithOracle();
      globalCoherency = d.field.globalCoherency;
    } catch { _quiet('admin:loops');}

    // ── improve status ────────────────────────────────────────────
    if (sub === 'status') {
      const status = engine.status(globalCoherency);
      if (jsonOut()) { out(JSON.stringify(status)); return; }
      out('');
      out(c.boldCyan('Self-Improvement Loop'));
      out(`  approval mode     : ${c.bold(status.approvalMode)}`);
      out(`  global coherency  : ${c.bold(globalCoherency.toFixed(3))}`);
      out('');
      out(c.bold('  Thresholds:'));
      out(`    supervised       : below C=${status.coherencyThresholds.SUPERVISED}`);
      out(`    semi-autonomous  : C=${status.coherencyThresholds.SEMI_AUTONOMOUS} - ${status.coherencyThresholds.AUTONOMOUS}`);
      out(`    autonomous       : C=${status.coherencyThresholds.AUTONOMOUS}+`);
      out('');
      out(c.bold('  Proposals:'));
      out(`    total            : ${status.totalProposals}`);
      out(`    pending          : ${status.pending > 0 ? c.boldYellow(String(status.pending)) : '0'}`);
      out(`    approved         : ${c.green(String(status.approved))}`);
      out(`    auto-incorporated: ${c.cyan(String(status.autoIncorporated))}`);
      out(`    rejected         : ${status.rejected}`);
      if (status.nextModeAt) {
        out('');
        out(c.dim(`  Next mode: ${status.nextModeAt.mode} at C=${status.nextModeAt.threshold} (gap: +${status.nextModeAt.gap.toFixed(3)})`));
      }
      out('');
      return;
    }

    // ── improve discover ──────────────────────────────────────────
    if (sub === 'discover') {
      const maxProposals = parseInt(args.max || '5', 10);
      out('');
      out(c.boldCyan('Self-Improvement Discovery'));
      out(c.dim(`  Discovering gaps and generating proposals (max ${maxProposals})...`));
      out('');

      // Populate table via introspection first
      try {
        const { introspect } = require('../../../atomic/self-introspect');
        introspect(table, { includeVoid: true });
      } catch { _quiet('admin:loops');}

      const result = await engine.discoverAndPropose({
        table, globalCoherency, maxProposals,
      });

      if (jsonOut()) { out(JSON.stringify(result)); return; }

      out(`  approval mode    : ${c.bold(result.approvalMode)}`);
      out(`  proposals found  : ${result.proposals.length}`);
      out(`  auto-incorporated: ${result.autoIncorporated}`);
      out('');

      for (const p of result.proposals) {
        const icon = p.status === 'pending' ? c.yellow('\u25cb')
                   : p.status === 'auto-incorporated' ? c.green('\u2713')
                   : p.status === 'rejected' ? c.red('\u2717')
                   : c.dim('\u25cb');
        out(`  ${icon} ${c.bold(p.id)}`);
        out(`    gap: ${c.dim(p.gap.description || p.gap.signature)}`);
        out(`    status: ${p.status}${p.decidedBy ? ' (by ' + p.decidedBy + ')' : ''}`);
        if (p.rejectionReason) out(`    reason: ${c.dim(p.rejectionReason)}`);
        out('');
      }

      if (result.approvalMode === 'supervised' && result.proposals.some(p => p.status === 'pending')) {
        out(c.dim('  Pending proposals need human approval:'));
        out(c.dim('    oracle improve approve <proposal-id>'));
        out(c.dim('    oracle improve reject <proposal-id>'));
      }
      out('');
      return;
    }

    // ── improve approve <id> ──────────────────────────────────────
    if (sub === 'approve') {
      const id = args.id || args._positional[2];
      if (!id) { outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle improve approve <proposal-id>')}`); process.exit(1); }

      // Populate table
      try { const { introspect } = require('../../../atomic/self-introspect'); introspect(table, { includeVoid: true }); } catch { _quiet('admin:loops');}

      const result = engine.approve(id, table);
      if (result.error) { outErr(c.boldRed('Error:') + ` ${result.error}`); process.exit(1); }
      out('');
      out(c.boldGreen(`  \u2713 Proposal ${id} approved and incorporated`));
      out(c.dim(`    Gap filled: ${result.proposal.gap?.description || result.proposal.gap?.signature}`));
      out(c.dim(`    Decided by: human`));
      out('');
      return;
    }

    // ── improve reject <id> ──────────────────────────────────────
    if (sub === 'reject') {
      const id = args.id || args._positional[2];
      const reason = args.reason || 'Rejected by human';
      if (!id) { outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle improve reject <proposal-id>')}`); process.exit(1); }
      const result = engine.reject(id, reason);
      if (result.error) { outErr(c.boldRed('Error:') + ` ${result.error}`); process.exit(1); }
      out('');
      out(c.boldRed(`  \u2717 Proposal ${id} rejected`));
      out(c.dim(`    Reason: ${reason}`));
      out('');
      return;
    }

    // ── improve pending ───────────────────────────────────────────
    if (sub === 'pending') {
      const pending = engine.getPending();
      if (jsonOut()) { out(JSON.stringify(pending)); return; }
      out('');
      out(c.boldCyan(`Pending Proposals (${pending.length})`));
      if (pending.length === 0) {
        out(c.dim('  No pending proposals. Run `oracle improve discover` to find gaps.'));
      } else {
        for (const p of pending) {
          out(`  ${c.yellow('\u25cb')} ${c.bold(p.id)}`);
          out(`    ${c.dim(p.gap?.description || p.gap?.signature || 'unknown gap')}`);
          out(`    created: ${p.createdAt}`);
          out('');
        }
        out(c.dim('  oracle improve approve <id>  — incorporate into the system'));
        out(c.dim('  oracle improve reject <id>   — reject the proposal'));
      }
      out('');
      return;
    }

    outErr(c.boldRed('Error:') + ` Unknown improve subcommand: ${sub}`);
    outErr(c.dim('  Available: status, discover, approve, reject, pending'));
    process.exit(1);
  };
  handlers['orchestrate'] = async (args) => {
    const sub = args._sub || args._positional[1] || 'status';
    const fs = require('fs');
    const path = require('path');
    const { execSync } = require('child_process');
    const { CoherencyDirector } = require('../../../orchestrator/coherency-director');
    const director = new CoherencyDirector();

    // Scan src/ files as zones — canonical walker (ECOSYSTEM §7), pre-order.
    const { walkFiles } = require('../../../core/walk-files');
    const scanDir = args.dir || 'src';
    const srcFiles = !fs.existsSync(scanDir) ? []
      : walkFiles(scanDir, { skipDirs: new Set(['node_modules']), extensions: ['.js'] })
        .map((p) => { try { return { id: path.relative(process.cwd(), p), code: fs.readFileSync(p, 'utf-8'), filePath: p, language: 'javascript' }; } catch { return null; } })
        .filter(Boolean);

    director.scan(srcFiles);

    // ── orchestrate changed — post-commit mode: scan only changed files ──
    if (sub === 'changed') {
      let changedFiles = [];
      try {
        const since = args.since || 'HEAD~1';
        const { execFileSync } = require('child_process');
        const diffOutput = execFileSync('git', ['diff', '--name-only', since, 'HEAD'], { encoding: 'utf-8', stdio: ['pipe', 'pipe', 'ignore'] });
        changedFiles = diffOutput.trim().split('\n')
          .filter(f => f.trim() && /\.js$/.test(f) && fs.existsSync(f));
      } catch (_) {
        outErr(c.boldRed('Error:') + ` git diff failed. Are you in a git repo?`);
        process.exit(1);
      }
      if (changedFiles.length === 0) {
        out(c.dim('  No changed .js files since last commit.'));
        return;
      }
      const changedItems = changedFiles.map(f => ({
        id: f, filePath: path.resolve(f), language: 'javascript',
        code: fs.readFileSync(f, 'utf-8'),
      }));
      const changedDirector = new CoherencyDirector();
      changedDirector.scan(changedItems);
      changedDirector.measureWithOracle();
      const result = changedDirector.field.stats();
      const targets = changedDirector.field.findHealingTargets();
      if (jsonOut()) { out(JSON.stringify({ stats: result, targets: targets.map(t => ({ id: t.id, coherency: t.coherency })) })); return; }
      out('');
      out(c.boldCyan('Coherency on changed files'));
      out(`  files changed       : ${c.bold(String(changedFiles.length))}`);
      out(`  global coherency    : ${c.bold(result.globalCoherency.toFixed(3))}`);
      out(`  needs healing       : ${targets.length > 0 ? c.boldYellow(String(targets.length)) : c.green('0')}`);
      out('');
      if (targets.length > 0) {
        out(c.bold('  Zones below threshold:'));
        for (const z of targets) {
          out(`    ${c.yellow('\u25cf')} ${c.bold(z.id)}  coherency=${z.coherency.toFixed(3)}`);
        }
        out('');
        out(c.dim('  Run `oracle orchestrate diagnose <file>` to categorize root cause.'));
      } else {
        out(c.boldGreen('  ✓ All changed files are above threshold.'));
      }
      out('');
      return;
    }

    // ── orchestrate diagnose <file> — categorize root cause ──
    if (sub === 'diagnose') {
      const target = args.file || args._positional[2];
      if (!target || !fs.existsSync(target)) {
        outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle orchestrate diagnose <file>')}`);
        process.exit(1);
      }
      const diagDirector = new CoherencyDirector();
      diagDirector.scan([{ id: target, filePath: path.resolve(target), language: 'javascript',
        code: fs.readFileSync(target, 'utf-8') }]);
      diagDirector.measureWithOracle();
      const zone = diagDirector.field.getZone(target);
      const diagnosis = diagDirector.categorizeRootCause(zone);
      if (jsonOut()) { out(JSON.stringify({ zone: target, coherency: zone.coherency, diagnosis })); return; }
      out('');
      out(c.boldCyan('Root cause diagnosis') + ' — ' + c.bold(target));
      out(`  coherency : ${zone.coherency.toFixed(3)}`);
      out('');
      const icon = diagnosis.category === 'code-bug' ? c.boldRed('\u25cf') :
                   diagnosis.category === 'missing-data' ? c.boldYellow('\u25cf') :
                   diagnosis.category === 'measurement-error' ? c.boldMagenta('\u25cf') :
                   c.dim('\u25cf');
      out(`  ${icon} category  : ${c.bold(diagnosis.category)}`);
      out(`  reason    : ${diagnosis.reason}`);
      out(`  action    : ${c.cyan(diagnosis.suggestedAction)}`);
      out('');
      return;
    }

    // ── orchestrate heal <file> — smart-route healing ──
    if (sub === 'heal') {
      const target = args.file || args._positional[2];
      if (!target || !fs.existsSync(target)) {
        outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle orchestrate heal <file>')}`);
        process.exit(1);
      }
      const healDirector = new CoherencyDirector();
      healDirector.scan([{ id: target, filePath: path.resolve(target), language: 'javascript',
        code: fs.readFileSync(target, 'utf-8') }]);
      healDirector.measureWithOracle();
      const healResult = await healDirector.healZoneSmart(target);
      if (jsonOut()) { out(JSON.stringify(healResult)); return; }
      out('');
      out(c.boldCyan('Smart heal') + ' — ' + c.bold(target));
      if (healResult && healResult.diagnosis) {
        out(`  diagnosis : ${healResult.diagnosis.category} (${healResult.diagnosis.reason})`);
      }
      if (healResult && healResult.result) {
        const r = healResult.result;
        if (r.type === 'heal' || r.type === 'synthesize') {
          out(`  ${c.green('✓')} ${r.type}: ${r.before.toFixed(3)} → ${r.after.toFixed(3)}`);
        } else if (r.type === 'flag') {
          out(`  ${c.yellow('⚠')} flagged: ${r.reason}`);
        } else {
          out(`  ${c.dim('skipped: ' + (r.reason || 'no action taken'))}`);
        }
      } else {
        out(c.dim('  No intervention applied.'));
      }
      out('');
      return;
    }

    if (sub === 'scan' || sub === 'status') {
      director.measureWithOracle();
      const stats = director.field.stats();
      const { analyzeFieldCharge } = require('../../../orchestrator/charge-balancer');
      const charge = analyzeFieldCharge(director.field);
      const { rankZones, computeHealingBudget } = require('../../../orchestrator/priority-engine');
      const queue = rankZones(director.field, { maxResults: 5 });
      const budget = computeHealingBudget(director.field);

      if (jsonOut()) {
        out(JSON.stringify({ stats, charge: charge.globalCharge, queue, budget }));
        return;
      }
      out('');
      out(c.boldCyan('Coherency Orchestrator'));
      out(`  zones scanned     : ${c.bold(String(stats.totalZones))}`);
      out(`  zones measured    : ${stats.measuredZones}`);
      out(`  global coherency  : ${c.bold(stats.globalCoherency.toFixed(3))}`);
      out(`  needs healing     : ${stats.needsHealing > 0 ? c.boldYellow(String(stats.needsHealing)) : c.green('0')}`);
      out(`  stable            : ${c.green(String(stats.stable))}`);
      out(`  high (preserve)   : ${c.boldGreen(String(stats.needsPreservation))}`);
      out('');
      out(c.bold('  Charge flow:'));
      out(`    net charge  : ${charge.globalCharge.netCharge > 0 ? c.green('+' + charge.globalCharge.netCharge) : charge.globalCharge.netCharge < 0 ? c.red(String(charge.globalCharge.netCharge)) : c.dim('0')}`);
      out(`    balance     : ${charge.globalCharge.balance}`);
      if (charge.globalCharge.mostContracting.length > 0) {
        out(`    weakest     : ${c.yellow(charge.globalCharge.mostContracting[0].name)} (contracting in ${charge.globalCharge.mostContracting[0].count} zones)`);
      }
      out('');
      if (queue.length > 0) {
        out(c.bold('  Healing queue (top 5):'));
        for (const item of queue) {
          out(`    ${c.yellow('\u25cf')} ${c.bold(item.zoneId.padEnd(40))} coherency=${item.coherency.toFixed(3)}  priority=${item.priority.toFixed(3)}`);
          if (item.reason) out(`      ${c.dim(item.reason)}`);
        }
        out('');
        out(c.dim(`  Healing budget: ${budget.budget} zone(s) — ${budget.reason}`));
      } else {
        out(c.boldGreen('  No zones need healing.'));
      }
      out('');
      return;
    }

    outErr(c.boldRed('Error:') + ` Unknown orchestrate subcommand: ${sub}`);
    outErr(c.dim('  Available: scan, status, changed, diagnose, heal'));
    process.exit(1);
  };
}
registerLoopCommands.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 14, period: 4,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'orchestration',
};

module.exports = { registerLoopCommands };
