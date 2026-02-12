/**
 * Self-Management CLI commands: evolve, lifecycle, improve, optimize, full-cycle
 */

const { c, colorScore } = require('../colors');

function registerSelfManageCommands(handlers, { oracle, jsonOut }) {

  handlers['evolve'] = (args) => {
    console.log(`\n${c.boldCyan('Self-Evolution Cycle')}\n`);
    console.log(`${c.dim('Detecting regressions, healing low performers, re-checking coherency...')}\n`);

    const report = oracle.selfEvolve();
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    console.log(`${c.bold('Patterns analyzed:')} ${report.patternsAnalyzed}`);

    if (report.healed.length > 0) {
      console.log(`\n${c.boldGreen('Healed')} ${report.healed.length} pattern(s):`);
      for (const h of report.healed) {
        console.log(`  ${c.green('+')} ${c.cyan(h.name || h.id)} \u2014 improvement: ${c.green('+' + (h.improvement * 100).toFixed(1) + '%')} \u2192 ${colorScore(h.newCoherency)}`);
      }
    }

    if (report.healFailed.length > 0) {
      console.log(`\n${c.yellow('Heal failed:')} ${report.healFailed.length} pattern(s)`);
      for (const f of report.healFailed.slice(0, 5)) {
        console.log(`  ${c.yellow('\u00D7')} ${f.name || f.id} \u2014 ${f.reason}`);
      }
    }

    if (report.regressions.length > 0) {
      console.log(`\n${c.boldRed('Regressions detected:')} ${report.regressions.length}`);
      for (const r of report.regressions) {
        console.log(`  ${c.red('!')} ${c.cyan(r.name || r.id)} \u2014 success rate dropped by ${c.red((r.delta * 100).toFixed(1) + '%')}`);
      }
    }

    if (report.coherencyUpdates.length > 0) {
      console.log(`\n${c.bold('Coherency updates:')} ${report.coherencyUpdates.length}`);
      for (const u of report.coherencyUpdates.slice(0, 5)) {
        const dir = u.diff > 0 ? c.green('+' + (u.diff * 100).toFixed(1) + '%') : c.red((u.diff * 100).toFixed(1) + '%');
        console.log(`  ${c.cyan(u.name || u.id)} \u2014 ${dir}`);
      }
    }

    console.log(`\n${c.dim('Stale patterns:')} ${report.staleCount}  ${c.dim('Evolve-overloaded:')} ${report.evolveOverloaded.length}`);
  };

  handlers['lifecycle'] = (args) => {
    const sub = process.argv[3];

    if (!sub || sub === 'help') {
      console.log(`
${c.boldCyan('Lifecycle Engine')} \u2014 always-on automatic pattern management

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

  handlers['improve'] = (args) => {
    console.log(`\n${c.boldCyan('Self-Improvement Cycle')}\n`);
    console.log(`${c.dim('Healing low-coherency patterns, promoting candidates, cleaning stubs...')}\n`);

    const report = oracle.selfImprove({
      maxHealsPerRun: parseInt(args.max) || 20,
    });
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    console.log(`${c.bold('Patterns analyzed:')} ${report.patternsAnalyzed}`);

    if (report.healed.length > 0) {
      console.log(`\n${c.boldGreen('Healed')} ${report.healed.length} pattern(s):`);
      for (const h of report.healed.slice(0, 10)) {
        console.log(`  ${c.green('+')} ${c.cyan(h.name || h.id)} \u2014 ${(h.oldCoherency * 100).toFixed(0)}% \u2192 ${(h.newCoherency * 100).toFixed(0)}% (${c.green('+' + (h.improvement * 100).toFixed(1) + '%')})`);
      }
      if (report.healed.length > 10) {
        console.log(`  ${c.dim('... and ' + (report.healed.length - 10) + ' more')}`);
      }
    }

    if (report.promoted > 0) console.log(`${c.boldGreen('Promoted:')} ${report.promoted} candidates`);
    if (report.cleaned > 0) console.log(`${c.bold('Cleaned:')} ${report.cleaned} duplicates/stubs`);
    if (report.retagged > 0) console.log(`${c.bold('Re-tagged:')} ${report.retagged} patterns`);
    if (report.recovered > 0) console.log(`${c.bold('Recovered:')} ${report.recovered} rejections`);

    if (report.totalCoherencyGained > 0) {
      console.log(`\n${c.boldGreen('Total coherency gained:')} +${(report.totalCoherencyGained * 100).toFixed(1)}%`);
    }
    console.log(`${c.dim('Duration:')} ${report.durationMs}ms`);
  };

  handlers['optimize'] = (args) => {
    console.log(`\n${c.boldCyan('Self-Optimization Cycle')}\n`);
    console.log(`${c.dim('Analyzing usage, detecting duplicates, optimizing tags...')}\n`);

    const report = oracle.selfOptimize();
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    console.log(`${c.bold('Patterns analyzed:')} ${report.patternsAnalyzed}`);

    if (report.unusedPatterns.length > 0) {
      console.log(`\n${c.yellow('Unused patterns:')} ${report.unusedPatterns.length} (180+ days idle)`);
      for (const u of report.unusedPatterns.slice(0, 5)) {
        console.log(`  ${c.yellow('\u25CB')} ${c.cyan(u.name || u.id)} \u2014 ${u.daysSinceUse} days, ${u.usageCount} uses`);
      }
      if (report.unusedPatterns.length > 5) {
        console.log(`  ${c.dim('... and ' + (report.unusedPatterns.length - 5) + ' more')}`);
      }
    }

    if (report.nearDuplicates.length > 0) {
      console.log(`\n${c.bold('Near-duplicates:')} ${report.nearDuplicates.length} pair(s)`);
      for (const d of report.nearDuplicates.slice(0, 5)) {
        console.log(`  ${c.cyan(d.pattern1.name)} \u2248 ${c.cyan(d.pattern2.name)} (${(d.similarity * 100).toFixed(0)}% similar)`);
      }
    }

    if (report.coherencyRefreshed > 0) {
      console.log(`\n${c.bold('Coherency refreshed:')} ${report.coherencyRefreshed} pattern(s)`);
    }

    if (report.recommendations.length > 0) {
      console.log(`\n${c.bold('Recommendations:')}`);
      for (const r of report.recommendations) {
        const icon = r.priority === 'high' ? c.red('!') : r.priority === 'info' ? c.green('\u2713') : c.yellow('\u25CB');
        console.log(`  ${icon} ${r.message}`);
      }
    }

    console.log(`\n${c.dim('Duration:')} ${report.durationMs}ms`);
  };

  handlers['full-cycle'] = (args) => {
    console.log(`\n${c.boldCyan('Full Optimization Cycle')}`);
    console.log(`${c.dim('Running self-improve \u2192 self-optimize \u2192 self-evolve...')}\n`);

    const report = oracle.fullOptimizationCycle({
      maxHealsPerRun: parseInt(args.max) || 20,
    });
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    if (report.whisper) {
      console.log(report.whisper);
    }

    if (report.whisperSummary && report.whisperSummary.hasActivity) {
      console.log(`\n${c.boldCyan('\u2500\u2500\u2500 Healing Whisper \u2500\u2500\u2500')}`);
      console.log(report.whisperSummary.text);
    }

    console.log(`\n${c.dim('Total duration:')} ${report.durationMs}ms`);
  };
}

module.exports = { registerSelfManageCommands };
