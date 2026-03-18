/**
 * Debug Oracle CLI commands — Quantum Debugging Intelligence
 *
 * Subcommands: capture/search/feedback/grow/seed/patterns/stats/share/pull/sync/global
 *              + quantum-native: decohere/reexcite/entanglement/field
 */

const fs = require('fs');
const path = require('path');
const { c, colorScore, colorSource } = require('../colors');
const { parseDryRun, parseTags } = require('../validate-args');

/**
 * Format a quantum state as a colored ket notation string.
 */
function colorQuantumState(state) {
  switch (state) {
    case 'superposition': return c.magenta('|superposition\u27E9');
    case 'collapsed':     return c.green('|collapsed\u27E9');
    case 'decohered':     return c.dim('|decohered\u27E9');
    default:              return c.dim(`|${state || 'unknown'}\u27E9`);
  }
}

function registerDebugCommands(handlers, { oracle, jsonOut }) {

  handlers['debug'] = (args) => {
    const sub = args._sub;

    if (!sub || sub === 'help') {
      console.log(`
${c.boldCyan('Debug Oracle')} \u2014 quantum debugging intelligence

${c.bold('Quantum Field Operations:')}
  ${c.cyan('debug capture')}       Inject a pattern into the quantum field in |superposition\u27E9
  ${c.cyan('debug search')}        Observe the field \u2014 collapses states, applies tunneling + interference
  ${c.cyan('debug feedback')}      Post-measurement update \u2014 propagates entanglement to linked patterns
  ${c.cyan('debug grow')}          Expand the field \u2014 create entangled variants from high-amplitude patterns
  ${c.cyan('debug patterns')}      List patterns with quantum state
  ${c.cyan('debug stats')}         Quantum field statistics (superposition/collapsed/decohered counts)
  ${c.cyan('debug seed')}          Seed patterns across all 10 error field sectors

${c.bold('Quantum State Management:')}
  ${c.cyan('debug decohere')}      Sweep the field \u2014 decay unobserved patterns (temporal decoherence)
  ${c.cyan('debug reexcite')}      Re-excite a decohered pattern back to |superposition\u27E9
  ${c.cyan('debug reexcite-all')}  Bulk re-excite ALL decohered patterns back to |superposition\u27E9
  ${c.cyan('debug entanglement')}  Show the entanglement graph for a pattern
  ${c.cyan('debug field')}         Quantum field overview (state distribution + energy)

${c.bold('Distribution:')}
  ${c.cyan('debug share')}         Share patterns to community
  ${c.cyan('debug pull')}          Pull patterns from community
  ${c.cyan('debug sync')}          Sync patterns to personal store
  ${c.cyan('debug global')}        Stats across all tiers

${c.bold('Options:')}
  ${c.yellow('--error')} <message>     Error message to capture/search
  ${c.yellow('--stack')} <trace>       Stack trace (optional)
  ${c.yellow('--fix')} <file>          Fix code file
  ${c.yellow('--description')} <text>  Description of the fix
  ${c.yellow('--language')} <lang>     Programming language
  ${c.yellow('--id')} <id>             Debug pattern ID (for feedback/reexcite/entanglement)
  ${c.yellow('--success')}             Mark feedback as resolved
  ${c.yellow('--category')} <cat>      Filter by error category (field sector)
  ${c.yellow('--min-confidence')} <n>  Minimum amplitude threshold
  ${c.yellow('--json')}                JSON output
      `);
      return;
    }

    if (sub === 'capture') {
      const errorMessage = args.error;
      if (!errorMessage) { console.error(c.boldRed('Error:') + ' --error required'); process.exit(1); }
      const fixFile = args.fix;
      if (!fixFile) { console.error(c.boldRed('Error:') + ' --fix required (path to fix code)'); process.exit(1); }
      const { safePath } = require('../../core/safe-path');
      const fixCode = fs.readFileSync(safePath(fixFile, process.cwd()), 'utf-8');
      const result = oracle.debugCapture({
        errorMessage,
        stackTrace: args.stack || '',
        fixCode,
        fixDescription: args.description || '',
        language: args.language || 'javascript',
        tags: parseTags(args),
      });
      if (jsonOut()) { console.log(JSON.stringify(result)); return; }
      if (result.captured) {
        const p = result.pattern;
        console.log(`${c.boldGreen('Captured!')} ${c.bold(p.errorClass)}:${c.cyan(p.errorCategory)} ${colorQuantumState(p.quantumState)} [${c.dim(p.id)}]`);
        console.log(`  Amplitude:  ${colorScore(p.amplitude || p.confidence)}`);
        console.log(`  Language:   ${c.blue(p.language)}`);
        if (result.variants?.length > 0) {
          console.log(`  Entangled:  ${c.boldGreen('+' + result.variants.length)} variants created in |superposition\u27E9`);
          for (const v of result.variants) {
            console.log(`    ${c.green('\u2B61')} ${c.blue(v.language)} ${colorQuantumState(v.quantumState)} ${c.dim(v.id)}`);
          }
        }
        if (result.updated) {
          console.log(c.yellow('  (Updated existing pattern \u2014 re-entered |superposition\u27E9)'));
        }
      } else if (result.duplicate) {
        console.log(`${c.yellow('Duplicate:')} existing pattern ${c.cyan(result.existingId)} (amplitude: ${colorScore(result.confidence)})`);
      } else {
        console.log(`${c.boldRed('Failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'search') {
      const errorMessage = args.error || args._positional.slice(1).join(' ');
      if (!errorMessage) { console.error(c.boldRed('Error:') + ` provide an error message. Usage: ${c.cyan('oracle debug search --error "TypeError: x is not a function"')}`); process.exit(1); }
      const results = oracle.debugSearch({
        errorMessage,
        stackTrace: args.stack || '',
        language: args.language,
        limit: parseInt(args.limit, 10) || 5,
        federated: args.local !== true,
      });
      if (jsonOut()) { console.log(JSON.stringify(results)); return; }
      if (results.length === 0) {
        console.log(c.yellow('No matching patterns in the quantum field.'));
      } else {
        console.log(`${c.boldCyan('Observation')} collapsed ${c.bold(String(results.length))} pattern(s) for ${c.red('"' + errorMessage.slice(0, 60) + '"')}:\n`);
        for (const r of results) {
          const sourceLabel = r.source ? colorSource(r.source) : c.dim('local');
          const matchLabel = r.matchType === 'tunneled'
            ? c.magenta('\u2937 tunneled')
            : r.matchType === 'exact' ? c.green('\u2261 exact') : r.matchType === 'class' ? c.cyan('\u2248 class') : c.dim('\u223C category');
          const qState = colorQuantumState(r.quantumState);
          console.log(`  [${sourceLabel}] ${c.bold(r.errorClass)}:${c.cyan(r.errorCategory)} ${qState}`);
          console.log(`    ${matchLabel} | score: ${colorScore(r.matchScore)} | amplitude: ${colorScore(r.amplitude || r.confidence)}`);
          if (r.interference != null && r.interference !== 0) {
            const intLabel = r.interference > 0
              ? c.green(`+${r.interference} constructive`)
              : c.red(`${r.interference} destructive`);
            console.log(`    Interference: ${intLabel}`);
          }
          console.log(`    ${c.blue(r.language)} | applied ${r.timesApplied}x \u2192 resolved ${r.timesResolved}x | observed ${r.observationCount || 0}x`);
          console.log(`    ${c.dim('Fix:')} ${r.fixDescription || r.fixCode.split('\n')[0].slice(0, 80)}`);
          console.log(`    ${c.dim('ID:')} ${r.id}`);
          console.log('');
        }
      }
      return;
    }

    if (sub === 'feedback') {
      const id = args.id || args._positional[1];
      if (!id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const resolved = args.success === true || args.success === 'true';
      const result = oracle.debugFeedback(id, resolved);
      if (result.success) {
        console.log(`${resolved ? c.boldGreen('Resolved!') : c.boldRed('Not resolved.')} Amplitude: ${colorScore(result.amplitude || result.confidence)}`);
        console.log(`  Applied: ${result.timesApplied}x | Resolved: ${result.timesResolved}x`);
        if (result.quantumState) {
          console.log(`  State: ${colorQuantumState(result.quantumState)}`);
        }
        if (result.entanglementPropagated > 0) {
          console.log(`  ${c.magenta('\u2B61')} Entanglement propagated to ${result.entanglementPropagated} linked pattern(s)`);
        }
        if (result.cascadeVariants > 0) {
          console.log(`  ${c.boldGreen('+' + result.cascadeVariants)} cascade variants generated!`);
        }
      } else {
        console.log(c.red(result.error));
      }
      return;
    }

    if (sub === 'grow') {
      const minConfidence = parseFloat(args['min-confidence']) || 0.5;
      const maxPatterns = parseInt(args['max-patterns'], 10) || 999999;
      console.log(c.boldCyan('Quantum Field Expansion') + ' \u2014 entangled variant generation\n');
      const report = oracle.debugGrow({ minConfidence, maxPatterns });
      console.log(`  Processed:     ${c.bold(String(report.processed))} patterns`);
      console.log(`  Generated:     ${c.bold(String(report.generated))} variants`);
      console.log(`  Stored:        ${c.boldGreen(String(report.stored))} new entangled states`);
      console.log(`  Skipped:       ${c.dim(String(report.skipped))} duplicates`);
      if (report.entanglementLinks > 0) {
        console.log(`  Entangled:     ${c.magenta(String(report.entanglementLinks))} new links`);
      }
      if (Object.keys(report.byLanguage).length > 0) {
        console.log(`  By language:   ${Object.entries(report.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
      }
      if (Object.keys(report.byCategory).length > 0) {
        console.log(`  By category:   ${Object.entries(report.byCategory).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
      }
      return;
    }

    if (sub === 'seed') {
      console.log(c.boldCyan('Quantum Field Seeding') + ' \u2014 populating all 10 error field sectors\n');
      const verbose = args.verbose === 'true' || args.verbose === true;
      const categories = args.category ? args.category.split(',').map(ct => ct.trim()) : undefined;
      const languages = args.language ? args.language.split(',').map(l => l.trim()) : undefined;
      const report = oracle.debugSeed({ verbose, categories, languages });
      if (jsonOut()) { console.log(JSON.stringify(report)); return; }
      console.log(`  Seeded:     ${c.boldGreen(String(report.seeded))} patterns in |superposition\u27E9`);
      console.log(`  Entangled:  ${c.boldGreen('+' + String(report.variants))} auto-generated variants`);
      console.log(`  Duplicates: ${c.dim(String(report.duplicates))} already in field`);
      console.log(`  Skipped:    ${c.dim(String(report.skipped))}`);
      if (Object.keys(report.byCategory).length > 0) {
        console.log(`\n  By sector:   ${Object.entries(report.byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}`);
      }
      if (Object.keys(report.byLanguage).length > 0) {
        console.log(`  By language: ${Object.entries(report.byLanguage).map(([k, v]) => `${k}(${v})`).join(', ')}`);
      }
      const syncReport = oracle.debugSyncPersonal({ verbose: false });
      if (syncReport.synced > 0) {
        console.log(`\n  ${c.green('Auto-synced')} ${c.boldGreen(String(syncReport.synced))} patterns to personal store`);
      }
      const stats = oracle.debugStats();
      console.log(`\n  Field size: ${c.bold(String(stats.totalPatterns))} patterns across ${Object.keys(stats.byCategory).length} sectors`);
      return;
    }

    if (sub === 'patterns') {
      const filters = {};
      if (args.language) filters.language = args.language;
      if (args.category) filters.category = args.category;
      if (args['min-confidence']) filters.minConfidence = parseFloat(args['min-confidence']);
      if (args['quantum-state']) filters.quantumState = args['quantum-state'];
      filters.limit = parseInt(args.limit, 10) || 20;
      const patterns = oracle.debugPatterns(filters);
      if (jsonOut()) { console.log(JSON.stringify(patterns)); return; }
      if (patterns.length === 0) {
        console.log(c.yellow('No patterns in the quantum field. Use ') + c.cyan('oracle debug capture') + c.yellow(' to inject one.'));
      } else {
        console.log(c.boldCyan(`Quantum Field \u2014 ${patterns.length} pattern(s):\n`));
        for (const p of patterns) {
          const method = p.generationMethod === 'capture' ? c.green('captured') : c.cyan(p.generationMethod);
          const qState = colorQuantumState(p.quantumState);
          const entangled = (p.entangledWith || []).length;
          const entLabel = entangled > 0 ? c.magenta(` \u2B61${entangled}`) : '';
          console.log(`  ${c.dim(p.id.slice(0, 8))} ${c.bold(p.errorClass)}:${c.cyan(p.errorCategory)} ${qState} (${c.blue(p.language)}) amplitude: ${colorScore(p.amplitude || p.confidence)} [${method}]${entLabel}`);
          console.log(`    ${c.dim(p.errorMessage.slice(0, 80))}`);
        }
      }
      return;
    }

    if (sub === 'stats') {
      const stats = oracle.debugStats();
      if (jsonOut()) { console.log(JSON.stringify(stats)); return; }
      console.log(c.boldCyan('Quantum Field Stats:\n'));
      console.log(`  Total patterns:    ${c.bold(String(stats.totalPatterns))}`);
      console.log(`  Avg amplitude:     ${colorScore(stats.avgAmplitude || stats.avgConfidence)}`);
      console.log(`  Total applied:     ${c.bold(String(stats.totalApplied))}`);
      console.log(`  Total resolved:    ${c.boldGreen(String(stats.totalResolved))}`);
      console.log(`  Resolution rate:   ${colorScore(stats.resolutionRate)}`);
      console.log(`  Captured:          ${c.bold(String(stats.captured))}`);
      console.log(`  Generated:         ${c.bold(String(stats.generated))}`);

      // Quantum field metrics
      if (stats.quantumField) {
        const qf = stats.quantumField;
        console.log(`\n  ${(c.boldMagenta || c.bold)('Quantum Field:')}`);
        console.log(`    |superposition\u27E9  ${c.magenta(String(qf.superposition))}`);
        console.log(`    |collapsed\u27E9      ${c.green(String(qf.collapsed))}`);
        console.log(`    |decohered\u27E9      ${c.dim(String(qf.decohered))}`);
        console.log(`    Observations:    ${c.bold(String(qf.totalObservations))}`);
        console.log(`    Entanglements:   ${c.magenta(String(qf.entanglementLinks))}`);
        console.log(`    Field energy:    ${c.bold(String(qf.fieldEnergy))}`);
      }

      if (Object.keys(stats.byCategory).length > 0) {
        console.log(`\n  By sector:    ${Object.entries(stats.byCategory).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
      }
      if (Object.keys(stats.byLanguage).length > 0) {
        console.log(`  By language:  ${Object.entries(stats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
      }
      if (Object.keys(stats.byMethod).length > 0) {
        console.log(`  By method:    ${Object.entries(stats.byMethod).map(([k, v]) => `${c.cyan(k)}(${v})`).join(', ')}`);
      }
      return;
    }

    // ─── Quantum State Management Commands ───

    if (sub === 'decohere') {
      const maxDays = parseInt(args['max-days'], 10) || 180;
      console.log(c.boldCyan('Decoherence Sweep') + ` \u2014 decaying patterns unobserved for ${maxDays}+ days\n`);
      const report = oracle.debugDecohereSweep({ maxDays });
      if (jsonOut()) { console.log(JSON.stringify(report)); return; }
      console.log(`  Swept:      ${c.bold(String(report.swept))} stale patterns`);
      console.log(`  Decohered:  ${c.dim(String(report.decohered))} \u2192 |decohered\u27E9`);
      return;
    }

    if (sub === 'reexcite') {
      const id = args.id || args._positional[1];
      if (!id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.debugReexcite(id);
      if (jsonOut()) { console.log(JSON.stringify(result)); return; }
      if (result.success) {
        console.log(`${c.boldGreen('Re-excited!')} ${colorQuantumState(result.previousState)} \u2192 ${colorQuantumState(result.newState)}`);
        console.log(`  Amplitude: ${colorScore(result.amplitude)}`);
      } else {
        console.log(c.red(result.error));
      }
      return;
    }

    if (sub === 'reexcite-all') {
      console.log(c.boldCyan('Bulk Re-excitation') + ' \u2014 restoring all decohered patterns to |superposition\u27E9\n');
      const result = oracle.debugReexciteAll({
        boostAmount: parseFloat(args.boost) || 0.15,
      });
      if (jsonOut()) { console.log(JSON.stringify(result)); return; }
      console.log(`  Decohered found: ${c.bold(String(result.total))}`);
      console.log(`  Re-excited:      ${c.boldGreen(String(result.reexcited))} \u2192 |superposition\u27E9`);
      // Show updated field stats
      const stats = oracle.debugStats();
      if (stats.quantumField) {
        const qf = stats.quantumField;
        console.log(`\n  Field state:     ${c.magenta('superposition(' + qf.superposition + ')')} ${c.green('collapsed(' + qf.collapsed + ')')} ${c.dim('decohered(' + qf.decohered + ')')}`);
        console.log(`  Field energy:    ${c.bold(String(qf.fieldEnergy))}`);
      }
      return;
    }

    if (sub === 'entanglement') {
      const id = args.id || args._positional[1];
      if (!id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const depth = parseInt(args.depth, 10) || 2;
      const graph = oracle.debugEntanglementGraph(id, depth);
      if (jsonOut()) { console.log(JSON.stringify(graph)); return; }
      if (!graph || graph.nodes.length === 0) {
        console.log(c.yellow('Pattern not found or has no entanglement links.'));
        return;
      }
      console.log(c.boldCyan(`Entanglement Graph`) + ` for ${c.dim(id.slice(0, 8))} (depth ${depth}):\n`);
      for (const node of graph.nodes) {
        const isRoot = node.id === id;
        const prefix = isRoot ? c.bold('\u25C9') : c.dim('\u25CB');
        console.log(`  ${prefix} ${c.dim(node.id.slice(0, 8))} ${c.bold(node.errorClass)}:${c.cyan(node.category)} (${c.blue(node.language)}) ${colorQuantumState(node.quantumState)} amplitude: ${colorScore(node.amplitude)}`);
      }
      if (graph.edges.length > 0) {
        console.log(`\n  Links: ${graph.edges.map(e => `${c.dim(e.from.slice(0, 6))}\u2192${c.dim(e.to.slice(0, 6))}`).join(', ')}`);
      }
      return;
    }

    if (sub === 'field') {
      const stats = oracle.debugStats();
      if (jsonOut()) { console.log(JSON.stringify(stats)); return; }
      const qf = stats.quantumField || {};
      const total = stats.totalPatterns || 0;
      console.log(c.boldCyan('Quantum Field Overview:\n'));

      // State distribution bar
      if (total > 0) {
        const sBar = Math.round((qf.superposition || 0) / total * 30);
        const cBar = Math.round((qf.collapsed || 0) / total * 30);
        const dBar = Math.round((qf.decohered || 0) / total * 30);
        console.log(`  State:  ${c.magenta('\u2588'.repeat(sBar))}${c.green('\u2588'.repeat(cBar))}${c.dim('\u2588'.repeat(dBar))}`);
        console.log(`          ${c.magenta(`\u25CF superposition(${qf.superposition || 0})`)}  ${c.green(`\u25CF collapsed(${qf.collapsed || 0})`)}  ${c.dim(`\u25CF decohered(${qf.decohered || 0})`)}`);
      }

      console.log(`\n  Patterns:       ${c.bold(String(total))}`);
      console.log(`  Avg amplitude:  ${colorScore(stats.avgAmplitude || stats.avgConfidence)}`);
      console.log(`  Field energy:   ${c.bold(String(qf.fieldEnergy || 0))}`);
      console.log(`  Observations:   ${c.bold(String(qf.totalObservations || 0))}`);
      console.log(`  Entanglements:  ${c.magenta(String(qf.entanglementLinks || 0))}`);
      console.log(`  Resolution:     ${colorScore(stats.resolutionRate)} (${stats.totalResolved}/${stats.totalApplied})`);

      if (Object.keys(stats.byCategory).length > 0) {
        console.log(`\n  Field sectors:  ${Object.entries(stats.byCategory).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
      }
      return;
    }

    // ─── Distribution Commands ───

    if (sub === 'share') {
      const verbose = args.verbose === 'true' || args.verbose === true;
      const dryRun = parseDryRun(args);
      const minConfidence = parseFloat(args['min-confidence']) || 0.5;
      console.log(c.boldCyan('Share Debug Patterns to Community\n'));
      const report = oracle.debugShare({ verbose, dryRun, minConfidence, category: args.category, language: args.language });
      console.log(`  Shared:     ${c.boldGreen(String(report.shared))}`);
      console.log(`  Duplicates: ${c.dim(String(report.duplicates))}`);
      console.log(`  Skipped:    ${c.dim(String(report.skipped))}`);
      if (dryRun) console.log(c.yellow('\n(dry run \u2014 no changes made)'));
      return;
    }

    if (sub === 'pull') {
      const verbose = args.verbose === 'true' || args.verbose === true;
      const dryRun = parseDryRun(args);
      console.log(c.boldCyan('Pull Debug Patterns from Community\n'));
      const report = oracle.debugPullCommunity({
        verbose, dryRun, category: args.category, language: args.language,
        minConfidence: parseFloat(args['min-confidence']) || 0.3,
        limit: parseInt(args.limit, 10) || 999999,
      });
      console.log(`  Pulled:     ${c.boldGreen(String(report.pulled))}`);
      console.log(`  Duplicates: ${c.dim(String(report.duplicates))}`);
      console.log(`  Skipped:    ${c.dim(String(report.skipped))}`);
      if (dryRun) console.log(c.yellow('\n(dry run \u2014 no changes made)'));
      return;
    }

    if (sub === 'sync') {
      console.log(c.boldCyan('Sync Debug Patterns to Personal Store\n'));
      const report = oracle.debugSyncPersonal({
        verbose: args.verbose === true || args.verbose === 'true',
        dryRun: parseDryRun(args),
      });
      console.log(`  Synced:     ${c.boldGreen(String(report.synced))}`);
      console.log(`  Duplicates: ${c.dim(String(report.duplicates))}`);
      console.log(`  Skipped:    ${c.dim(String(report.skipped))}`);
      return;
    }

    if (sub === 'global') {
      const stats = oracle.debugGlobalStats();
      if (jsonOut()) { console.log(JSON.stringify(stats)); return; }
      if (!stats.available) {
        console.log(c.yellow('No debug patterns in global stores yet.'));
        return;
      }
      console.log(c.boldCyan('Debug Global Stats:\n'));
      console.log(`  Total patterns:  ${c.bold(String(stats.totalPatterns))}`);
      console.log(`  Total applied:   ${c.bold(String(stats.totalApplied))}`);
      console.log(`  Total resolved:  ${c.boldGreen(String(stats.totalResolved))}`);
      console.log(`  Resolution rate: ${colorScore(stats.resolutionRate)}`);
      if (stats.personal) {
        console.log(`\n  ${c.bold('Personal:')} ${c.bold(String(stats.personal.totalPatterns))} patterns, avg amplitude ${colorScore(stats.personal.avgAmplitude || stats.personal.avgConfidence)}`);
      }
      if (stats.community) {
        console.log(`  ${c.bold('Community:')} ${c.bold(String(stats.community.totalPatterns))} patterns, avg amplitude ${colorScore(stats.community.avgAmplitude || stats.community.avgConfidence)}`);
      }
      return;
    }

    console.error(c.boldRed('Error:') + ` Unknown debug subcommand: ${sub}. Run ${c.cyan('oracle debug help')} for usage.`);
    process.exit(1);
  };
}

module.exports = { registerDebugCommands };
