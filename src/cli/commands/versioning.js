/**
 * Versioning CLI commands: versions, rollback, verify, healing-stats, sdiff
 */

const { c, colorScore } = require('../colors');

function registerVersioningCommands(handlers, { oracle, jsonOut }) {

  handlers['versions'] = (args) => {
    const id = args.id || args._sub;
    if (!id) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle versions')} <pattern-id>`); process.exit(1); }
    try {
      const { VersionManager } = require('../../core/versioning');
      const sqliteStore = oracle.store.getSQLiteStore();
      const vm = new VersionManager(sqliteStore);
      const history = vm.getHistory(id);
      if (history.length === 0) {
        console.log(c.yellow('No version history found for this pattern.'));
      } else {
        console.log(`${c.boldCyan('Version History')} for ${c.cyan(id)}:\n`);
        for (const v of history) {
          console.log(`  ${c.bold('v' + v.version)} \u2014 ${c.dim(v.timestamp)}`);
          if (v.metadata.reason) console.log(`    ${c.dim('Reason:')} ${v.metadata.reason}`);
          console.log(`    ${c.dim(v.code.split('\n').length + ' lines')}`);
        }
      }
    } catch (err) {
      console.error(c.boldRed('Error:') + ' Versioning requires SQLite: ' + err.message);
    }
  };

  handlers['rollback'] = (args) => {
    const id = args.id || args._sub;
    if (!id) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle rollback')} <pattern-id> [--version <n>]`); process.exit(1); }
    const version = parseInt(args.version) || undefined;
    const result = oracle.rollback(id, version);
    if (result.success) {
      console.log(`${c.boldGreen('Rolled back:')} ${c.bold(result.patternName)} \u2192 v${result.restoredVersion}`);
      console.log(`  Previous version: v${result.previousVersion}`);
      console.log(`  Code restored (${result.restoredCode.split('\n').length} lines)`);
    } else {
      console.log(`${c.boldRed('Rollback failed:')} ${result.reason}`);
    }
  };

  handlers['verify'] = (args) => {
    const id = args.id || args._sub;
    if (!id) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle verify')} <pattern-id>`); process.exit(1); }
    const result = oracle.verifyOrRollback(id);
    if (result.passed) {
      console.log(`${c.boldGreen('Verified:')} ${c.bold(result.patternName || id)} \u2014 tests pass`);
    } else {
      console.log(`${c.boldRed('Failed:')} ${c.bold(result.patternName || id)} \u2014 tests broke`);
      if (result.rolledBack) {
        console.log(`  ${c.yellow('Auto-rolled back')} to v${result.restoredVersion}`);
      }
    }
  };

  handlers['healing-stats'] = (args) => {
    const stats = oracle.healingStats();
    console.log(c.boldCyan('Healing Success Rates:\n'));
    console.log(`  Tracked patterns: ${c.bold(String(stats.patterns))}`);
    console.log(`  Total attempts:   ${c.bold(String(stats.totalAttempts))}`);
    console.log(`  Total successes:  ${c.boldGreen(String(stats.totalSuccesses))}`);
    console.log(`  Overall rate:     ${colorScore(stats.overallRate)}`);
    if (stats.details.length > 0) {
      console.log('');
      for (const d of stats.details) {
        const icon = parseFloat(d.rate) >= 0.8 ? c.green('\u25CF') : parseFloat(d.rate) >= 0.5 ? c.yellow('\u25CF') : c.red('\u25CF');
        const deltaStr = d.avgDelta != null ? ` \u0394${d.avgDelta > 0 ? '+' : ''}${d.avgDelta}` : '';
        const peakStr = d.peakCoherency != null ? ` peak:${d.peakCoherency}` : '';
        console.log(`  ${icon} ${c.bold(d.name)} \u2014 ${d.successes}/${d.attempts} (${colorScore(d.rate)})${c.dim(deltaStr + peakStr)}`);
      }
    }
  };

  handlers['healing-lineage'] = (args) => {
    const id = args.id || args._sub;
    if (!id) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle healing-lineage')} <pattern-id>`); process.exit(1); }
    const lineage = oracle.getHealingLineage(id);
    console.log(`${c.boldCyan('Healing Lineage')} for ${c.bold(lineage.patternName)} [${c.dim(id)}]\n`);
    console.log(`  Original coherency: ${colorScore(lineage.originalCoherency)}`);
    console.log(`  Healing count:      ${c.bold(String(lineage.healingCount))}`);
    if (lineage.bestCoherency != null) {
      console.log(`  Best coherency:     ${colorScore(lineage.bestCoherency)}`);
      console.log(`  Total improvement:  ${c.boldGreen('+' + (Math.round(lineage.totalImprovement * 1000) / 1000))}`);
    }
    if (lineage.variants.length > 0) {
      console.log('');
      console.log(`  ${c.bold('Variants:')}`);
      for (const v of lineage.variants) {
        const delta = v.delta > 0 ? c.green('+' + (Math.round(v.delta * 1000) / 1000)) : c.red(String(Math.round(v.delta * 1000) / 1000));
        console.log(`    ${c.dim(v.id.slice(0, 8))} \u2014 ${colorScore(v.coherencyBefore)} \u2192 ${colorScore(v.coherencyAfter)} (${delta}) ${c.dim(v.strategy || '')} ${c.dim(v.healedAt || '')}`);
      }
    } else {
      console.log(`\n  ${c.yellow('No healed variants yet.')}`);
    }
  };

  handlers['healing-improved'] = (args) => {
    const minDelta = parseFloat(args['min-delta']) || 0.2;
    const results = oracle.queryHealingImprovement(minDelta);
    console.log(`${c.boldCyan('Patterns improved >')} ${c.bold(String(minDelta))} ${c.boldCyan('through healing:')}\n`);
    if (results.length === 0) {
      console.log(`  ${c.yellow('No patterns found above threshold.')}`);
      return;
    }
    for (const r of results) {
      const delta = c.green('+' + r.bestDelta);
      console.log(`  ${c.bold(r.name)} [${c.dim(r.language)}] \u2014 best: ${delta} avg: +${r.avgDelta} (${r.successes}/${r.attempts} heals) peak: ${colorScore(r.peakCoherency)}`);
    }
  };

  handlers['healing-variants'] = (args) => {
    const id = args.id || args._sub;
    if (!id) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle healing-variants')} <pattern-id>`); process.exit(1); }
    try {
      const sqliteStore = oracle.store.getSQLiteStore ? oracle.store.getSQLiteStore() : oracle.patterns._sqlite;
      if (!sqliteStore || !sqliteStore.getHealedVariants) {
        console.error(c.boldRed('Error:') + ' Healing variants require SQLite store');
        return;
      }
      const variants = sqliteStore.getHealedVariants(id);
      if (variants.length === 0) {
        console.log(c.yellow('No healed variants found for this pattern.'));
        return;
      }
      console.log(`${c.boldCyan('Healed Variants')} for ${c.dim(id)} (${variants.length} total):\n`);
      for (const v of variants) {
        const delta = v.coherencyDelta > 0 ? c.green('+' + (Math.round(v.coherencyDelta * 1000) / 1000)) : c.red(String(Math.round(v.coherencyDelta * 1000) / 1000));
        console.log(`  ${c.bold(v.id.slice(0, 12))} \u2014 coherency: ${colorScore(v.healedCoherency)} (${delta}) loops: ${v.healingLoops} strategy: ${c.dim(v.healingStrategy || 'N/A')}`);
        console.log(`    ${c.dim(v.healedAt)}`);
        if (v.whisper) console.log(`    ${c.dim('"' + v.whisper.slice(0, 100) + '"')}`);
        console.log('');
      }
    } catch (err) {
      console.error(c.boldRed('Error:') + ' ' + err.message);
    }
  };

  handlers['sdiff'] = (args) => {
    const ids = args._positional;
    if (!ids[0] || !ids[1]) { console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle sdiff')} <id-a> <id-b>`); process.exit(1); }
    try {
      const { semanticDiff } = require('../../core/versioning');
      const a = oracle.patterns.getAll().find(p => p.id === ids[0]) || oracle.store.get(ids[0]);
      const b = oracle.patterns.getAll().find(p => p.id === ids[1]) || oracle.store.get(ids[1]);
      if (!a) { console.error(c.boldRed('Error:') + ` Entry ${ids[0]} not found`); process.exit(1); }
      if (!b) { console.error(c.boldRed('Error:') + ` Entry ${ids[1]} not found`); process.exit(1); }
      const result = semanticDiff(a.code, b.code, a.language);
      console.log(`${c.boldCyan('Semantic Diff:')}`);
      console.log(`  Similarity: ${colorScore(result.similarity)} (${c.dim(result.changeType)})`);
      console.log(`  Functions: ${c.green('+' + result.summary.added)} ${c.red('-' + result.summary.removed)} ${c.yellow('~' + result.summary.modified)} ${c.dim('=' + result.summary.unchanged)}`);
      if (result.structuralChanges.length > 0) {
        console.log(`\n  ${c.bold('Structural Changes:')}`);
        for (const ch of result.structuralChanges) {
          const color = ch.type.includes('added') ? c.green : ch.type.includes('removed') ? c.red : c.yellow;
          console.log(`    ${color(ch.type)}: ${c.dim(ch.detail)}`);
        }
      }
    } catch (err) {
      console.error(c.boldRed('Error:') + ' ' + err.message);
    }
  };
}

module.exports = { registerVersioningCommands };
