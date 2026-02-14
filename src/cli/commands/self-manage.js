/**
 * Self-Management CLI commands: maintain, lifecycle
 *
 * `maintain` replaces the former evolve/improve/optimize/full-cycle commands
 * with a single entry point that runs the full optimization cycle.
 */

const { c, colorScore } = require('../colors');

function registerSelfManageCommands(handlers, { oracle, jsonOut }) {

  handlers['maintain'] = (args) => {
    console.log(`\n${c.boldCyan('Oracle Maintenance')}`);
    console.log(`${c.dim('Running self-improve → self-optimize → self-evolve...')}\n`);

    const report = oracle.fullOptimizationCycle({
      maxHealsPerRun: parseInt(args.max) || 20,
    });
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    // Improvement phase summary
    if (report.improvement) {
      const imp = report.improvement;
      if (imp.healed && imp.healed.length > 0) {
        console.log(`${c.boldGreen('Healed')} ${imp.healed.length} pattern(s):`);
        for (const h of imp.healed.slice(0, 10)) {
          console.log(`  ${c.green('+')} ${c.cyan(h.name || h.id)} — ${(h.oldCoherency * 100).toFixed(0)}% → ${(h.newCoherency * 100).toFixed(0)}% (${c.green('+' + (h.improvement * 100).toFixed(1) + '%')})`);
        }
        if (imp.healed.length > 10) {
          console.log(`  ${c.dim('... and ' + (imp.healed.length - 10) + ' more')}`);
        }
      }
      if (imp.promoted > 0) console.log(`${c.boldGreen('Promoted:')} ${imp.promoted} candidates`);
      if (imp.cleaned > 0) console.log(`${c.bold('Cleaned:')} ${imp.cleaned} duplicates/stubs`);
      if (imp.retagged > 0) console.log(`${c.bold('Re-tagged:')} ${imp.retagged} patterns`);
      if (imp.totalCoherencyGained > 0) {
        console.log(`${c.boldGreen('Coherency gained:')} +${(imp.totalCoherencyGained * 100).toFixed(1)}%`);
      }
    }

    // Optimization phase summary
    if (report.optimization) {
      const opt = report.optimization;
      if (opt.unusedPatterns && opt.unusedPatterns.length > 0) {
        console.log(`\n${c.yellow('Unused patterns:')} ${opt.unusedPatterns.length} (180+ days idle)`);
        for (const u of opt.unusedPatterns.slice(0, 5)) {
          console.log(`  ${c.yellow('○')} ${c.cyan(u.name || u.id)} — ${u.daysSinceUse} days, ${u.usageCount} uses`);
        }
      }
      if (opt.nearDuplicates && opt.nearDuplicates.length > 0) {
        console.log(`\n${c.bold('Near-duplicates:')} ${opt.nearDuplicates.length} pair(s)`);
        for (const d of opt.nearDuplicates.slice(0, 5)) {
          console.log(`  ${c.cyan(d.pattern1.name)} ≈ ${c.cyan(d.pattern2.name)} (${(d.similarity * 100).toFixed(0)}% similar)`);
        }
      }
      if (opt.recommendations && opt.recommendations.length > 0) {
        console.log(`\n${c.bold('Recommendations:')}`);
        for (const r of opt.recommendations) {
          const icon = r.priority === 'high' ? c.red('!') : r.priority === 'info' ? c.green('✓') : c.yellow('○');
          console.log(`  ${icon} ${r.message}`);
        }
      }
    }

    // Evolution phase summary
    if (report.evolution && !report.evolution.error) {
      const evo = report.evolution;
      if (evo.regressions && evo.regressions.length > 0) {
        console.log(`\n${c.boldRed('Regressions detected:')} ${evo.regressions.length}`);
        for (const r of evo.regressions) {
          console.log(`  ${c.red('!')} ${c.cyan(r.name || r.id)} — success rate dropped by ${c.red((r.delta * 100).toFixed(1) + '%')}`);
        }
      }
    }

    // Whisper
    if (report.whisper) {
      console.log(`\n${report.whisper}`);
    }

    if (report.whisperSummary && report.whisperSummary.hasActivity) {
      console.log(`\n${c.boldCyan('─── Healing Whisper ───')}`);
      console.log(report.whisperSummary.text);
    }

    console.log(`\n${c.dim('Total duration:')} ${report.durationMs}ms`);
  };

  // Keep backward-compat aliases pointing to maintain
  handlers['evolve'] = handlers['maintain'];
  handlers['improve'] = handlers['maintain'];
  handlers['optimize'] = handlers['maintain'];
  handlers['full-cycle'] = handlers['maintain'];

  handlers['lifecycle'] = (args) => {
    const sub = process.argv[3];

    if (!sub || sub === 'help') {
      console.log(`
${c.boldCyan('Lifecycle Engine')} — always-on automatic pattern management

${c.bold('Commands:')}
  ${c.cyan('lifecycle start')}    Start the always-on lifecycle engine
  ${c.cyan('lifecycle stop')}     Stop the lifecycle engine
  ${c.cyan('lifecycle status')}   Show lifecycle status and counters
  ${c.cyan('lifecycle run')}      Force a full lifecycle cycle now
  ${c.cyan('lifecycle history')}  Show recent cycle history
      `);
      return;
    }

    if (sub === 'start') {
      const result = oracle.startLifecycle({
        autoPromoteOnCycle: args['auto-promote'] !== 'false',
        autoRetagOnCycle: args.retag === 'true' || args.retag === true,
        autoSyncOnCycle: args.sync === 'true' || args.sync === true,
        autoCleanOnCycle: args.clean === 'true' || args.clean === true,
      });
      if (jsonOut()) { console.log(JSON.stringify(result)); return; }
      if (result.started) {
        console.log(`${c.boldGreen('Lifecycle engine started!')}`);
        console.log(`${c.dim('Auto-evolve every')} ${c.cyan('10')} ${c.dim('feedbacks')}`);
        console.log(`${c.dim('Auto-promote every')} ${c.cyan('5')} ${c.dim('submissions')}`);
        console.log(`${c.dim('The oracle now manages itself automatically.')}`);
      } else {
        console.log(`${c.yellow('Already running:')} ${result.reason}`);
      }
      return;
    }

    if (sub === 'stop') {
      const result = oracle.stopLifecycle();
      if (jsonOut()) { console.log(JSON.stringify(result)); return; }
      if (result.stopped) {
        console.log(`${c.boldGreen('Lifecycle engine stopped.')}`);
        console.log(`${c.dim('Feedbacks tracked:')} ${result.counters?.feedbacks || 0}  ${c.dim('Submissions:')} ${result.counters?.submissions || 0}  ${c.dim('Cycles:')} ${result.counters?.cycles || 0}`);
      } else {
        console.log(`${c.yellow('Not running:')} ${result.reason}`);
      }
      return;
    }

    if (sub === 'status') {
      const status = oracle.lifecycleStatus();
      if (jsonOut()) { console.log(JSON.stringify(status)); return; }
      console.log(`${c.boldCyan('Lifecycle Status')}\n`);
      console.log(`  ${c.bold('Running:')} ${status.running ? c.green('yes') : c.red('no')}`);
      if (status.counters) {
        console.log(`  ${c.bold('Feedbacks:')} ${status.counters.feedbacks}  ${c.bold('Submissions:')} ${status.counters.submissions}  ${c.bold('Registrations:')} ${status.counters.registrations}`);
        console.log(`  ${c.bold('Heals:')} ${status.counters.heals}  ${c.bold('Rejections:')} ${status.counters.rejections}  ${c.bold('Cycles:')} ${status.counters.cycles}`);
      }
      if (status.lastCycle) {
        console.log(`\n  ${c.bold('Last cycle:')} ${status.lastCycle.timestamp} (${status.lastCycle.triggeredBy})`);
        console.log(`    Healed: ${status.lastCycle.healed}  Promoted: ${status.lastCycle.promoted}  Duration: ${status.lastCycle.durationMs}ms`);
      }
      return;
    }

    if (sub === 'run') {
      console.log(`${c.dim('Running full lifecycle cycle...')}\n`);
      const lifecycle = oracle.getLifecycle();
      const report = lifecycle.runCycle();
      if (jsonOut()) { console.log(JSON.stringify(report)); return; }

      console.log(`${c.boldGreen('Lifecycle cycle #' + report.cycle + ' complete')}`);
      if (report.evolution && !report.evolution.error) {
        console.log(`  ${c.bold('Evolution:')} ${report.evolution.healed?.length || 0} healed, ${report.evolution.regressions?.length || 0} regressions`);
      }
      if (report.promotion && !report.promotion.error) {
        console.log(`  ${c.bold('Promotions:')} ${report.promotion.promoted || 0} candidates promoted`);
      }
      console.log(`  ${c.dim('Duration:')} ${report.durationMs}ms`);
      return;
    }

    if (sub === 'history') {
      const lifecycle = oracle.getLifecycle();
      const history = lifecycle.getHistory();
      if (jsonOut()) { console.log(JSON.stringify(history)); return; }
      if (history.length === 0) {
        console.log(`${c.dim('No lifecycle cycles recorded yet.')}`);
        return;
      }
      console.log(`${c.boldCyan('Lifecycle History')} (${history.length} cycles)\n`);
      for (const h of history) {
        console.log(`  #${h.cycle} ${c.dim(h.timestamp)} [${h.triggeredBy}] healed:${h.healed} promoted:${h.promoted} regressions:${h.regressions} ${c.dim(h.durationMs + 'ms')}`);
      }
      return;
    }

    console.error(`${c.boldRed('Unknown lifecycle subcommand:')} ${sub}. Run ${c.cyan('oracle lifecycle help')} for usage.`);
    process.exit(1);
  };
}

module.exports = { registerSelfManageCommands };
