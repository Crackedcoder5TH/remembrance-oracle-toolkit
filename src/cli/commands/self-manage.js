/**
 * Self-Management CLI commands: maintain, lifecycle
 *
 * `maintain` replaces the former evolve/improve/optimize/full-cycle commands
 * with a single entry point that runs the full optimization cycle.
 */

const { c, colorScore } = require('../colors');
const { parseDryRun, parseMinCoherency } = require('../validate-args');

function registerSelfManageCommands(handlers, { oracle, jsonOut }) {

  handlers['maintain'] = (args) => {
    console.log(`\n${c.boldCyan('Oracle Maintenance')}`);
    console.log(`${c.dim('Running self-improve → self-optimize → self-evolve...')}\n`);

    const report = oracle.fullOptimizationCycle({
      maxHealsPerRun: parseInt(args.max, 10) || 20,
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

    // Coherency refresh (fixes disconnect between reflect evaluator and DB)
    if (report.coherencyRefresh) {
      const cr = report.coherencyRefresh;
      if (cr.updated > 0) {
        console.log(`\n${c.boldCyan('Coherency Refresh:')} ${cr.updated} pattern(s) updated`);
        console.log(`  Avg before: ${colorScore(cr.avgBefore)} → Avg after: ${colorScore(cr.avgAfter)}`);
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

  // Deprecated aliases — show a helpful redirect message then run maintain
  const deprecatedAlias = (oldName) => (args) => {
    console.log(c.yellow(`Note: '${oldName}' is now '${c.cyan('maintain')}'. Running maintain...\n`));
    handlers['maintain'](args);
  };
  handlers['evolve'] = deprecatedAlias('evolve');
  handlers['improve'] = deprecatedAlias('improve');
  handlers['optimize'] = deprecatedAlias('optimize');
  handlers['full-cycle'] = deprecatedAlias('full-cycle');

  handlers['consolidate'] = (args) => {
    const sub = args._sub;

    if (!sub || sub === 'help') {
      console.log(`
${c.boldCyan('Consolidation')} — reduce redundancy and clean up the library

${c.bold('Commands:')}
  ${c.cyan('consolidate duplicates')}   Merge near-duplicate patterns (--dry-run)
  ${c.cyan('consolidate tags')}         Remove orphan/noise tags (--dry-run)
  ${c.cyan('consolidate candidates')}   Prune stuck candidates below threshold (--dry-run)
  ${c.cyan('consolidate all')}          Run iterative polish (loops until convergence)
  ${c.cyan('consolidate once')}         Run a single polish pass (no iteration)
      `);
      return;
    }

    if (sub === 'duplicates') {
      const dryRun = parseDryRun(args);
      console.log(`\n${c.boldCyan('Consolidating Near-Duplicates')}${dryRun ? c.dim(' (dry run)') : ''}\n`);

      const report = oracle.consolidateDuplicates({
        similarityThreshold: args.threshold != null ? parseFloat(args.threshold) : undefined,
        dryRun,
      });

      if (jsonOut()) { console.log(JSON.stringify(report)); return; }

      if (report.linked.length > 0) {
        console.log(`${c.boldGreen('Language variants linked:')} ${report.linked.length}`);
        for (const l of report.linked.slice(0, 10)) {
          console.log(`  ${c.green('+')} ${c.cyan(l.kept.name)} (${l.kept.language}) ${c.dim('kept')} — ${c.yellow(l.linked.name)} (${l.linked.language}) ${c.dim('linked')} (${(l.similarity * 100).toFixed(0)}% similar)`);
        }
        if (report.linked.length > 10) console.log(`  ${c.dim('... and ' + (report.linked.length - 10) + ' more')}`);
      }

      if (report.merged.length > 0) {
        console.log(`${c.boldGreen('Same-language duplicates merged:')} ${report.merged.length}`);
        for (const m of report.merged.slice(0, 10)) {
          console.log(`  ${c.green('+')} ${c.cyan(m.kept.name)} ${c.dim('kept')} — ${c.yellow(m.removed.name)} ${c.dim('removed')} (${(m.similarity * 100).toFixed(0)}% similar)`);
        }
        if (report.merged.length > 10) console.log(`  ${c.dim('... and ' + (report.merged.length - 10) + ' more')}`);
      }

      if (report.removed.length === 0) {
        console.log(`${c.green('No near-duplicates found above threshold.')}`);
      }

      console.log(`\n${c.dim('Analyzed:')} ${report.patternsAnalyzed} patterns ${c.dim('|')} ${c.dim('Removed:')} ${report.removed.length} ${c.dim('|')} ${c.dim('Duration:')} ${report.durationMs}ms`);
      return;
    }

    if (sub === 'tags') {
      const dryRun = parseDryRun(args);
      const minUsage = parseInt(args['min-usage'], 10) || 2;
      console.log(`\n${c.boldCyan('Consolidating Tags')}${dryRun ? c.dim(' (dry run)') : ''}\n`);

      const report = oracle.consolidateTags({ minUsage, dryRun });

      if (jsonOut()) { console.log(JSON.stringify(report)); return; }

      if (report.orphanTagsRemoved > 0) {
        console.log(`${c.bold('Orphan tags removed:')} ${report.orphanTagsRemoved} (used by <${minUsage} patterns)`);
        const orphans = report.tagsRemoved.filter(t => t.reason === 'orphan').slice(0, 20);
        for (const t of orphans) {
          console.log(`  ${c.yellow('○')} ${c.dim(t.tag)} (${t.count} pattern${t.count === 1 ? '' : 's'})`);
        }
        if (report.orphanTagsRemoved > 20) console.log(`  ${c.dim('... and ' + (report.orphanTagsRemoved - 20) + ' more')}`);
      }

      if (report.noiseTagsStripped > 0) {
        console.log(`${c.bold('Noise tags stripped:')} ${report.noiseTagsStripped}`);
      }

      if (report.synonymsNormalized > 0) {
        console.log(`${c.bold('Synonyms normalized:')} ${report.synonymsNormalized}`);
        const merges = (report.synonymsMerged || []).slice(0, 20);
        for (const m of merges) {
          console.log(`  ${c.green('→')} ${c.yellow(m.from)} → ${c.cyan(m.to)}`);
        }
        if (report.synonymsNormalized > 20) console.log(`  ${c.dim('... and ' + (report.synonymsNormalized - 20) + ' more')}`);
      }

      console.log(`\n${c.dim('Tags:')} ${report.totalTagsBefore} → ${report.totalTagsAfter} ${c.dim('|')} ${c.dim('Patterns updated:')} ${report.patternsUpdated} ${c.dim('|')} ${c.dim('Duration:')} ${report.durationMs}ms`);
      return;
    }

    if (sub === 'candidates') {
      const dryRun = parseDryRun(args);
      const minCoherency = parseMinCoherency(args, 0.6);
      console.log(`\n${c.boldCyan('Pruning Stuck Candidates')}${dryRun ? c.dim(' (dry run)') : ''}\n`);

      const report = oracle.pruneStuckCandidates({ minCoherency, dryRun });

      if (jsonOut()) { console.log(JSON.stringify(report)); return; }

      if (report.pruned.length > 0) {
        console.log(`${c.bold('Pruned:')} ${report.pruned.length} candidate(s) below ${minCoherency} coherency`);
        for (const p of report.pruned) {
          console.log(`  ${c.red('×')} ${c.cyan(p.name)} — coherency ${colorScore(p.coherency)} (${p.generationMethod})`);
        }
      }

      if (report.kept.length > 0) {
        console.log(`\n${c.boldGreen('Kept:')} ${report.kept.length} viable candidate(s)`);
        for (const k of report.kept) {
          console.log(`  ${c.green('✓')} ${c.cyan(k.name)} — coherency ${colorScore(k.coherency)}`);
        }
      }

      if (report.pruned.length === 0 && report.kept.length === 0) {
        console.log(`${c.green('No candidates to process.')}`);
      }

      console.log(`\n${c.dim('Duration:')} ${report.durationMs}ms`);
      return;
    }

    if (sub === 'once') {
      const dryRun = parseDryRun(args);
      console.log(`\n${c.boldCyan('Single Polish Pass')}${dryRun ? c.dim(' (dry run)') : ''}`);
      console.log(`${c.dim('Running: consolidate duplicates → tags → candidates → improve → optimize → evolve...')}\n`);

      const report = oracle.polishCycle({ dryRun });

      if (jsonOut()) { console.log(JSON.stringify(report)); return; }

      const con = report.consolidation;
      if (con.removed.length > 0) {
        console.log(`${c.boldGreen('Duplicates consolidated:')} ${con.removed.length} (${con.linked.length} variants linked, ${con.merged.length} merged)`);
      }

      const tags = report.tagConsolidation;
      if (tags.tagsRemoved.length > 0) {
        console.log(`${c.bold('Tags consolidated:')} ${tags.tagsRemoved.length} removed (${tags.patternsUpdated} patterns updated)`);
      }

      const cand = report.candidatePruning;
      if (cand.pruned.length > 0) {
        console.log(`${c.bold('Candidates pruned:')} ${cand.pruned.length} stuck, ${cand.kept.length} kept`);
      }

      if (report.cycle?.improvement?.healed?.length > 0) {
        console.log(`${c.boldGreen('Healed:')} ${report.cycle.improvement.healed.length} pattern(s)`);
      }
      if (report.cycle?.improvement?.promoted > 0) {
        console.log(`${c.boldGreen('Promoted:')} ${report.cycle.improvement.promoted} candidate(s)`);
      }

      if (report.whisper) {
        console.log(`\n${report.whisper}`);
      }

      console.log(`\n${c.dim('Total duration:')} ${report.durationMs}ms`);
      return;
    }

    if (sub === 'all') {
      const dryRun = parseDryRun(args);
      const maxIterations = args['max-iterations'] != null ? parseInt(args['max-iterations'], 10) : undefined;
      console.log(`\n${c.boldCyan('Iterative Polish')}${dryRun ? c.dim(' (dry run)') : ''}`);
      console.log(`${c.dim('Running self-reflection loop: polish → evaluate → repeat until convergence...')}\n`);

      const report = oracle.iterativePolish({
        dryRun,
        ...(maxIterations ? { maxPolishIterations: maxIterations } : {}),
      });

      if (jsonOut()) { console.log(JSON.stringify(report)); return; }

      // Iteration history
      console.log(`${c.bold('Iterations:')} ${report.iterations} ${report.converged ? c.green('(converged)') : c.yellow('(max reached)')}`);
      console.log('');

      for (const h of report.history) {
        const parts = [];
        if (h.duplicatesRemoved > 0) parts.push(`${h.duplicatesRemoved} dupes`);
        if (h.tagsRemoved > 0) parts.push(`${h.tagsRemoved} tags`);
        if (h.candidatesPruned > 0) parts.push(`${h.candidatesPruned} candidates`);
        if (h.healed > 0) parts.push(`${h.healed} healed`);
        if (h.promoted > 0) parts.push(`${h.promoted} promoted`);
        if (h.cleaned > 0) parts.push(`${h.cleaned} cleaned`);

        const detail = parts.length > 0 ? parts.join(', ') : c.dim('no changes');
        const scoreColor = h.score >= 0.95 ? c.green : h.score >= 0.8 ? c.yellow : c.red;
        console.log(`  Pass ${h.iteration + 1}: ${detail} ${c.dim('|')} score ${scoreColor((h.score * 100).toFixed(1) + '%')} ${c.dim('|')} ${h.patternsRemaining} patterns`);
      }

      // Totals
      console.log('');
      const t = report.totals;
      if (t.removed > 0) console.log(`${c.boldGreen('Total duplicates removed:')} ${t.removed}`);
      if (t.tagsConsolidated > 0) console.log(`${c.bold('Total tags consolidated:')} ${t.tagsConsolidated}`);
      if (t.candidatesPruned > 0) console.log(`${c.bold('Total candidates pruned:')} ${t.candidatesPruned}`);
      if (t.healed > 0) console.log(`${c.boldGreen('Total patterns healed:')} ${t.healed}`);
      if (t.promoted > 0) console.log(`${c.boldGreen('Total promoted:')} ${t.promoted}`);

      console.log(`\n${c.bold('Final library:')} ${report.finalPatternCount} patterns`);
      console.log(`${c.dim('Total duration:')} ${report.durationMs}ms`);
      return;
    }

    console.error(c.boldRed('Error:') + ` Unknown consolidate subcommand: ${sub}. Run ${c.cyan('oracle consolidate help')} for usage.`);
    process.exit(1);
  };

  // Convenience alias
  handlers['polish'] = (args) => {
    args._sub = 'all';
    handlers['consolidate'](args);
  };

  handlers['lifecycle'] = (args) => {
    const sub = args._sub;

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

    console.error(c.boldRed('Error:') + ` Unknown lifecycle subcommand: ${sub}. Run ${c.cyan('oracle lifecycle help')} for usage.`);
    process.exit(1);
  };

  handlers['decay'] = (args) => {
    const { decayPass } = require('../../unified/decay');
    const patterns = oracle.patterns.getAll();
    const report = decayPass(patterns);

    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    console.log(c.boldCyan(`Confidence Decay Report\n`));
    console.log(`  Total patterns:   ${c.bold(String(report.total))}`);
    console.log(`  Decayed:          ${report.decayed > 0 ? c.yellow(String(report.decayed)) : c.bold('0')}`);
    console.log(`  Fresh:            ${c.green(String(report.fresh))}\n`);

    const decayed = report.patterns.filter(r => r.decayed).sort((a, b) => a.factor - b.factor);
    if (decayed.length > 0) {
      console.log(c.bold('Most decayed patterns:'));
      for (const d of decayed.slice(0, 15)) {
        const arrow = d.original !== d.adjusted ? ` → ${colorScore(d.adjusted.toFixed(3))}` : '';
        console.log(`  ${c.cyan(d.name || d.id)} — ${colorScore(d.original.toFixed(3))}${arrow} (${d.daysSinceUse}d idle, ×${d.factor})`);
      }
    } else {
      console.log(c.dim('All patterns are fresh — no decay applied.'));
    }
  };
  // ─── Health Check ───

  handlers['health'] = (args) => {
    const sqliteStore = oracle.store.getSQLiteStore();
    if (!sqliteStore || typeof sqliteStore.healthCheck !== 'function') {
      console.error(c.boldRed('Error:') + ' SQLite store required for health check');
      process.exit(1);
    }

    const report = sqliteStore.healthCheck();
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    console.log(`\n${c.boldCyan('Oracle Health Check')}\n`);

    // Stats
    const s = report.stats;
    console.log(`${c.bold('Database:')}         ${s.dbSizeMB != null ? s.dbSizeMB + ' MB' : 'unknown'}`);
    console.log(`${c.bold('Patterns:')}         ${s.patterns}`);
    console.log(`${c.bold('Candidates:')}       ${s.candidates} (${s.candidateGroups} unique groups, ${s.candidateDuplicationRatio}x ratio)`);
    console.log(`${c.bold('Entries:')}           ${s.entries} (${s.untestedEntries} untested)`);
    console.log(`${c.bold('Audit log:')}        ${s.auditLogSize} rows`);
    console.log(`${c.bold('Avg coherency:')}    ${colorScore(s.avgCoherency)}`);
    console.log(`${c.bold('Personal store:')}   ${s.personalStoreExists ? c.green('exists') : c.red('missing')}`);
    if (s.fragmentationPct != null) {
      console.log(`${c.bold('Fragmentation:')}    ${s.fragmentationPct}%`);
    }
    if (s.orphanCandidates > 0) {
      console.log(`${c.bold('Orphan candidates:')} ${c.yellow(String(s.orphanCandidates))}`);
    }

    // Warnings
    if (report.warnings.length > 0) {
      console.log(`\n${c.boldYellow('Warnings:')}`);
      for (const w of report.warnings) {
        const icon = w.level === 'high' ? c.red('!') : c.yellow('○');
        console.log(`  ${icon} ${w.message}`);
      }
    } else {
      console.log(`\n${c.boldGreen('No warnings — oracle is healthy.')}`);
    }

    console.log(`\n${c.bold('Status:')} ${report.healthy ? c.boldGreen('HEALTHY') : c.boldRed('NEEDS ATTENTION')}`);
  };

  // ─── Deduplicate Candidates ───

  handlers['dedup-candidates'] = (args) => {
    const sqliteStore = oracle.store.getSQLiteStore();
    if (!sqliteStore || typeof sqliteStore.deduplicateCandidates !== 'function') {
      console.error(c.boldRed('Error:') + ' SQLite store required');
      process.exit(1);
    }

    const dryRun = parseDryRun(args);
    const maxPerGroup = parseInt(args['max-per-group'], 10) || 1;
    console.log(`\n${c.boldCyan('Deduplicating Candidates')}${dryRun ? c.dim(' (dry run)') : ''}`);
    console.log(`${c.dim('Keeping top ' + maxPerGroup + ' per (name, language) pair...')}\n`);

    const report = sqliteStore.deduplicateCandidates({ dryRun, maxPerGroup });
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    console.log(`${c.bold('Groups:')}  ${report.groups} unique (name, language) pairs`);
    console.log(`${c.bold('Kept:')}    ${c.boldGreen(String(report.kept))}`);
    console.log(`${c.bold('Removed:')} ${report.removed > 0 ? c.boldRed(String(report.removed)) : c.dim('0')}`);
    if (dryRun && report.removed > 0) {
      console.log(`\n${c.yellow('Run without --dry-run to apply changes.')}`);
    }
  };

  // ─── Clean Orphan Candidates ───

  handlers['clean-orphans'] = (args) => {
    const sqliteStore = oracle.store.getSQLiteStore();
    if (!sqliteStore || typeof sqliteStore.cleanOrphanCandidates !== 'function') {
      console.error(c.boldRed('Error:') + ' SQLite store required');
      process.exit(1);
    }

    const dryRun = parseDryRun(args);
    console.log(`\n${c.boldCyan('Cleaning Orphan Candidates')}${dryRun ? c.dim(' (dry run)') : ''}\n`);

    const report = sqliteStore.cleanOrphanCandidates({ dryRun });
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    if (report.removed > 0) {
      console.log(`${c.bold('Removed:')} ${c.boldRed(String(report.removed))} orphan candidate(s)`);
    } else {
      console.log(`${c.green('No orphan candidates found.')}`);
    }
  };

  // ─── Prune Stale Entries ───

  handlers['prune-entries'] = (args) => {
    const sqliteStore = oracle.store.getSQLiteStore();
    if (!sqliteStore || typeof sqliteStore.pruneStaleEntries !== 'function') {
      console.error(c.boldRed('Error:') + ' SQLite store required');
      process.exit(1);
    }

    const dryRun = parseDryRun(args);
    const maxAgeDays = parseInt(args['max-age'], 10) || 90;
    console.log(`\n${c.boldCyan('Pruning Stale Entries')}${dryRun ? c.dim(' (dry run)') : ''}`);
    console.log(`${c.dim('Removing entries with no tests and no usage, older than ' + maxAgeDays + ' days...')}\n`);

    const report = sqliteStore.pruneStaleEntries({ dryRun, maxAgeDays });
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    console.log(`${c.bold('Removed:')}   ${report.removed > 0 ? c.boldRed(String(report.removed)) : c.dim('0')} stale entries`);
    console.log(`${c.bold('Remaining:')} ${c.boldGreen(String(report.remaining))}`);
  };

  // ─── VACUUM ───

  handlers['vacuum'] = (args) => {
    const sqliteStore = oracle.store.getSQLiteStore();
    if (!sqliteStore || typeof sqliteStore.vacuum !== 'function') {
      console.error(c.boldRed('Error:') + ' SQLite store required');
      process.exit(1);
    }

    console.log(`\n${c.boldCyan('Running VACUUM...')}\n`);
    const report = sqliteStore.vacuum();
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    console.log(`${c.bold('Before:')} ${report.beforeMB} MB`);
    console.log(`${c.bold('After:')}  ${report.afterMB} MB`);
    if (report.savedMB != null && report.savedMB > 0) {
      console.log(`${c.boldGreen('Saved:')}  ${report.savedMB} MB`);
    } else {
      console.log(`${c.dim('No space reclaimed — database was already compact.')}`);
    }
  };

  // ─── Rotate Audit Log ───

  handlers['rotate-audit'] = (args) => {
    const sqliteStore = oracle.store.getSQLiteStore();
    if (!sqliteStore || typeof sqliteStore.rotateAuditLogNow !== 'function') {
      console.error(c.boldRed('Error:') + ' SQLite store required');
      process.exit(1);
    }

    console.log(`\n${c.boldCyan('Rotating Audit Log...')}\n`);
    const report = sqliteStore.rotateAuditLogNow();
    if (jsonOut()) { console.log(JSON.stringify(report)); return; }

    console.log(`${c.bold('Before:')}  ${report.before} rows`);
    console.log(`${c.bold('After:')}   ${report.after} rows`);
    console.log(`${c.bold('Removed:')} ${report.removed > 0 ? c.boldRed(String(report.removed)) : c.dim('0')} rows`);
  };

  // ─── Deep Clean — runs all cleanup operations in sequence ───

  handlers['deep-clean'] = (args) => {
    const sqliteStore = oracle.store.getSQLiteStore();
    if (!sqliteStore) {
      console.error(c.boldRed('Error:') + ' SQLite store required');
      process.exit(1);
    }

    const dryRun = parseDryRun(args);
    console.log(`\n${c.boldCyan('Deep Clean')}${dryRun ? c.dim(' (dry run)') : ''}`);
    console.log(`${c.dim('Running: dedup candidates → clean orphans → prune entries → rotate audit → vacuum...')}\n`);

    const results = {};

    // 1. Deduplicate candidates
    if (typeof sqliteStore.deduplicateCandidates === 'function') {
      results.candidates = sqliteStore.deduplicateCandidates({ dryRun });
      console.log(`${c.bold('Candidates deduped:')} ${results.candidates.removed} removed, ${results.candidates.kept} kept`);
    }

    // 2. Clean orphan candidates
    if (typeof sqliteStore.cleanOrphanCandidates === 'function') {
      results.orphans = sqliteStore.cleanOrphanCandidates({ dryRun });
      console.log(`${c.bold('Orphans cleaned:')}   ${results.orphans.removed} removed`);
    }

    // 3. Prune stale entries
    if (typeof sqliteStore.pruneStaleEntries === 'function') {
      results.entries = sqliteStore.pruneStaleEntries({ dryRun, maxAgeDays: 90 });
      console.log(`${c.bold('Entries pruned:')}    ${results.entries.removed} stale entries removed`);
    }

    // 4. Rotate audit log
    if (!dryRun && typeof sqliteStore.rotateAuditLogNow === 'function') {
      results.audit = sqliteStore.rotateAuditLogNow();
      console.log(`${c.bold('Audit log:')}        ${results.audit.removed} old rows removed`);
    }

    // 5. Clean fractal/embedding orphans
    if (!dryRun && typeof sqliteStore.cleanOrphans === 'function') {
      results.dataOrphans = sqliteStore.cleanOrphans();
      const dataTotal = (results.dataOrphans.deletedDeltas || 0) + (results.dataOrphans.deletedEmbeddings || 0) +
        (results.dataOrphans.deletedHealedVariants || 0) + (results.dataOrphans.deletedHealingStats || 0);
      console.log(`${c.bold('Data orphans:')}     ${dataTotal} rows cleaned`);
    }

    // 6. VACUUM
    if (!dryRun && typeof sqliteStore.vacuum === 'function') {
      results.vacuum = sqliteStore.vacuum();
      console.log(`${c.bold('VACUUM:')}           ${results.vacuum.beforeMB} MB → ${results.vacuum.afterMB} MB (${c.boldGreen(results.vacuum.savedMB + ' MB saved')})`);
    }

    if (jsonOut()) { console.log(JSON.stringify(results)); return; }
    console.log(`\n${c.boldGreen('Deep clean complete.')}`);
    if (dryRun) console.log(c.yellow('Run without --dry-run to apply changes.'));
  };
}

module.exports = { registerSelfManageCommands };
