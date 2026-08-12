'use strict';

const fs = require('fs');
const { safePath } = require('../../../core/safe-path');
const { c, colorScore } = require('../../colors');
const { parseDryRun, parseMinCoherency } = require('../../validate-args');
const { out, outErr } = require('./out');

/**
 * Library commands — evolve.
 * Grow new patterns: list candidates, generate variants, run tournaments, promote winners, synthesize tests.
 *
 * Commands: candidates, generate, tournament, promote, synthesize
 *
 * Registered onto the shared `handlers` map by the library façade
 * (../library.js). Printing goes through the ./out seam so the organ
 * itself holds zero console sites.
 */
function registerEvolveCommands(handlers, deps) {
  const { oracle, jsonOut } = deps;

  handlers['candidates'] = (args) => {
    const filters = {};
    if (args.language) filters.language = args.language;
    if (args['min-coherency']) filters.minCoherency = parseMinCoherency(args);
    if (args.method) filters.generationMethod = args.method;

    const candidates = oracle.candidates(filters);
    const stats = oracle.candidateStats();

    if (jsonOut()) { out(JSON.stringify({ stats, candidates })); return; }

    out(c.boldCyan('Candidate Patterns') + c.dim(' (coherent but unproven)\n'));
    out(`  Total candidates: ${c.bold(String(stats.totalCandidates))}`);
    out(`  Promoted:         ${c.boldGreen(String(stats.promoted))}`);
    out(`  Avg coherency:    ${colorScore(stats.avgCoherency)}`);
    if (Object.keys(stats.byLanguage).length > 0) {
      out(`  By language:      ${Object.entries(stats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(stats.byMethod).length > 0) {
      out(`  By method:        ${Object.entries(stats.byMethod).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
    }

    if (candidates.length > 0) {
      out(`\n${c.bold('Candidates:')}`);
      const limit = parseInt(args.limit, 10) || 20;
      for (const cand of candidates.slice(0, limit)) {
        const parent = cand.parentPattern ? c.dim(` ← ${cand.parentPattern}`) : '';
        out(`  ${c.cyan(cand.id.slice(0, 8))} ${c.bold(cand.name)} (${c.blue(cand.language)}) coherency: ${colorScore(cand.coherencyTotal)}${parent}`);
      }
      if (candidates.length > limit) {
        out(c.dim(`  ... and ${candidates.length - limit} more`));
      }
    }
  };

  handlers['generate'] = (args) => {
    const languages = (args.languages || 'python,typescript').split(',').map(s => s.trim());
    const methods = (args.methods || 'variant,iterative-refine,approach-swap').split(',').map(s => s.trim());
    const maxPatterns = parseInt(args['max-patterns'], 10) || 999999;
    const minCoherency = parseMinCoherency(args, 0.5);

    out(c.boldCyan('Continuous Generation') + ' — proven → coherency → candidates\n');
    oracle.recycler.verbose = true;

    const report = oracle.generateCandidates({ maxPatterns, languages, minCoherency, methods });

    out('\n' + c.boldCyan('─'.repeat(50)));
    out(`Generated:    ${c.bold(String(report.generated))}`);
    out(`  Stored:     ${c.boldGreen(String(report.stored))}`);
    out(`  Skipped:    ${c.yellow(String(report.skipped))}`);
    out(`  Duplicates: ${c.dim(String(report.duplicates))}`);
    if (Object.keys(report.byMethod).length > 0) {
      out(`  By method:  ${Object.entries(report.byMethod).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(report.byLanguage).length > 0) {
      out(`  By lang:    ${Object.entries(report.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }
    out(`\nCascade:      ${report.cascadeBoost}x  |  ξ_global: ${report.xiGlobal}`);

    const cStats = oracle.candidateStats();
    const pStats = oracle.patternStats();
    out(`\nLibrary:      ${c.bold(String(pStats.totalPatterns))} proven + ${c.bold(String(cStats.totalCandidates))} candidates`);
    out(c.boldCyan('─'.repeat(50)));

    const promo = oracle.autoPromote();
    if (promo.promoted > 0) {
      out(`\n${c.boldGreen('Auto-promoted:')} ${promo.promoted} candidate(s) → proven`);
      for (const d of promo.details.filter(d => d.status === 'promoted')) {
        out(`  ${c.green('+')} ${c.bold(d.name)} coherency: ${colorScore(d.coherency)}`);
      }
    }
  };

  handlers['tournament'] = (args) => {
    const maxPatterns = parseInt(args['max-patterns'], 10) || 999999;
    const candidatesPerRound = parseInt(args['candidates-per-round'], 10) || 3;
    const rounds = parseInt(args['rounds'], 10) || 3;
    const minWinnerCoherency = parseFloat(args['min-coherency']) || 0.6;
    const loserHarvestFloor = parseFloat(args['harvest-floor']) || 0.5;

    out(c.boldCyan('Tournament Generation') + ` — ${candidatesPerRound} contenders × ${rounds} rounds, best advances\n`);
    oracle.recycler.verbose = true;

    const report = oracle.recycler.tournamentGenerate({
      maxPatterns, candidatesPerRound, rounds, minWinnerCoherency, loserHarvestFloor,
    });

    out('\n' + c.boldCyan('─'.repeat(50)));
    out(`Patterns processed: ${c.bold(String(report.patternsProcessed))}`);
    out(`Total generated:    ${c.bold(String(report.totalGenerated))}`);
    out(`Winners stored:     ${c.boldGreen(String(report.winners.length))}`);
    out(`Losers harvested:   ${c.yellow(String(report.losersHarvested))}`);
    out(`Losers discarded:   ${c.dim(String(report.losersDiscarded))}`);
    out(`Cascade:            ${report.cascadeBoost}x  |  ξ_global: ${report.xiGlobal}`);

    if (report.winners.length > 0) {
      out('\n' + c.boldGreen('Winners:'));
      for (const w of report.winners) {
        out(`  ${c.green('★')} ${c.bold(w.name)} coherency: ${colorScore(w.coherency)} ← ${c.dim(w.source)}`);
      }
    }

    for (const rd of report.roundDetails) {
      if (rd.rounds.length > 0) {
        out(`\n${c.cyan(rd.source)}:`);
        for (const r of rd.rounds) {
          const loserStr = r.losers.map(l => `${l.name}(${l.coherency.toFixed(3)})`).join(', ');
          out(`  Round ${r.round}: winner=${c.bold(r.winner.name)}(${colorScore(r.winner.coherency)}) losers=[${c.dim(loserStr)}]`);
        }
      }
    }

    const cStats = oracle.candidateStats();
    const pStats = oracle.patternStats();
    out(`\nLibrary:      ${c.bold(String(pStats.totalPatterns))} proven + ${c.bold(String(cStats.totalCandidates))} candidates`);
    out(c.boldCyan('─'.repeat(50)));

    // Auto-promote any tournament winners/losers that have test code
    const promo = oracle.autoPromote();
    if (promo.promoted > 0) {
      out(`\n${c.boldGreen('Auto-promoted:')} ${promo.promoted} candidate(s) → proven`);
      for (const d of promo.details.filter(d => d.status === 'promoted')) {
        out(`  ${c.green('+')} ${c.bold(d.name)} coherency: ${colorScore(d.coherency)}`);
      }
    }
  };

  handlers['promote'] = (args) => {
    const id = args.id || args._sub;
    if (!id) { outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle promote')} <candidate-id> [--test <test-file>]`); process.exit(1); }

    if (id === 'auto' || id === '--auto') {
      const result = oracle.autoPromote();
      out(c.boldCyan('Auto-Promote Results:\n'));
      out(`  Attempted: ${c.bold(String(result.attempted))}`);
      out(`  Promoted:  ${c.boldGreen(String(result.promoted))}${result.healed ? ` (${result.healed} via auto-heal)` : ''}`);
      out(`  Failed:    ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);
      for (const d of result.details) {
        const icon = d.status === 'promoted' ? c.green('+') : c.red('x');
        const healTag = d.healMethod ? ` [${d.healMethod}]` : '';
        out(`  ${icon} ${c.bold(d.name)} — ${d.status}${healTag}${d.reason ? ' (' + d.reason.slice(0, 60) + ')' : ''}`);
      }
      return;
    }

    if (id === 'smart') {
      const minCoherency = parseMinCoherency(args, 0.9);
      const minConfidence = parseFloat(args['min-confidence']) || 0.8;
      const dryRun = parseDryRun(args);
      const override = args['override'] === 'true' || args['override'] === true;
      const result = oracle.smartAutoPromote({ minCoherency, minConfidence, dryRun, manualOverride: override });
      out(c.boldCyan('Smart Auto-Promote Results:\n'));
      out(`  Total candidates: ${c.bold(String(result.total))}`);
      out(`  Promoted:         ${c.boldGreen(String(result.promoted))}`);
      out(`  Skipped:          ${c.dim(String(result.skipped))}`);
      out(`  Vetoed:           ${result.vetoed > 0 ? c.boldRed(String(result.vetoed)) : c.dim('0')}`);
      if (dryRun) out(`  ${c.yellow('(dry run — no changes made)')}`);
      for (const d of result.details) {
        const icon = d.status === 'promoted' || d.status === 'would-promote' ? c.green('+') : d.status === 'vetoed' ? c.red('x') : c.dim('-');
        out(`  ${icon} ${c.bold(d.name)} — ${d.status}${d.reason ? ' (' + d.reason.slice(0, 80) + ')' : ''}${d.coherency ? ' [' + colorScore(d.coherency) + ']' : ''}`);
      }
      return;
    }

    let testCode;
    if (args.test) {
      try { testCode = fs.readFileSync(safePath(args.test, process.cwd()), 'utf-8'); }
      catch (e) { outErr(c.boldRed('Error:') + ` Cannot read test file: ${e.message}`); process.exit(1); }
    }
    const result = oracle.promote(id, testCode);

    if (result.promoted && result.pattern) {
      out(`${c.boldGreen('Promoted:')} ${c.bold(result.pattern.name)} → proven`);
      out(`  Coherency: ${colorScore(result.coherency)}`);
      out(`  ID: ${c.cyan(result.pattern.id)}`);
    } else if (result.promoted) {
      out(`${c.boldGreen('Promoted')} → proven`);
    } else {
      out(`${c.boldRed('Failed:')} ${result.reason}`);
    }
  };

  handlers['synthesize'] = (args) => {
    const maxCandidates = parseInt(args['max-candidates'], 10) || 999999;
    const dryRun = parseDryRun(args);
    const autoPromoteFlag = args['no-promote'] ? false : true;

    out(c.boldCyan('Test Synthesis') + ' — generating tests for candidates\n');

    const result = oracle.synthesizeTests({
      maxCandidates,
      dryRun,
      autoPromote: autoPromoteFlag,
    });

    const syn = result.synthesis;
    out(`Processed:    ${c.bold(String(syn.processed))}`);
    out(`  Synthesized: ${c.boldGreen(String(syn.synthesized))}`);
    out(`  Improved:    ${c.blue(String(syn.improved))}`);
    out(`  Failed:      ${syn.failed > 0 ? c.boldRed(String(syn.failed)) : c.dim('0')}`);

    for (const d of syn.details.filter(d => d.status === 'synthesized' || d.status === 'improved')) {
      out(`  ${c.green('+')} ${c.bold(d.name)} (${c.blue(d.language)}) — ${d.testLines} test lines`);
    }

    if (result.promotion && result.promotion.promoted > 0) {
      out(`\n${c.boldGreen('Auto-promoted:')} ${result.promotion.promoted} candidate(s) → proven`);
      for (const d of result.promotion.details.filter(d => d.status === 'promoted')) {
        out(`  ${c.green('+')} ${c.bold(d.name)} coherency: ${colorScore(d.coherency)}`);
      }
    }

    const cStats = oracle.candidateStats();
    const pStats = oracle.patternStats();
    out(`\nLibrary: ${c.bold(String(pStats.totalPatterns))} proven + ${c.bold(String(cStats.totalCandidates))} candidates`);
  };
}


module.exports = { registerEvolveCommands };
