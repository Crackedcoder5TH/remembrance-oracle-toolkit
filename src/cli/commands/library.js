/**
 * Library CLI commands: patterns, search, resolve, register, diff, export, import,
 * seed, candidates, generate, promote, synthesize, etc.
 */

const fs = require('fs');
const path = require('path');
const { c, colorScore, colorStatus, colorDecision, colorSource } = require('../colors');

function registerLibraryCommands(handlers, { oracle, getCode, readFile, speakCLI, jsonOut }) {

  handlers['bug-report'] = (args) => {
    const id = args.id || process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle bug-report')} <pattern-id> [--description "..."]`); process.exit(1); }
    const result = oracle.patterns.reportBug(id, args.description || '');
    if (result.success) {
      console.log(`${c.boldRed('Bug reported:')} ${c.bold(result.patternName)} — now has ${result.bugReports} report(s)`);
    } else {
      console.log(`${c.red(result.reason)}`);
    }
  };

  handlers['reliability'] = (args) => {
    const id = args.id || process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle reliability')} <pattern-id>`); process.exit(1); }
    const r = oracle.patterns.getReliability(id);
    if (!r) { console.log(c.red('Pattern not found')); return; }
    console.log(c.boldCyan(`Reliability: ${c.bold(r.patternName)}\n`));
    console.log(`  Usage:     ${r.successCount}/${r.usageCount} (${colorScore(r.usageReliability.toFixed(3))})`);
    console.log(`  Bugs:      ${r.bugReports > 0 ? c.red(String(r.bugReports)) : c.dim('0')} (penalty: ${colorScore(r.bugPenalty.toFixed(3))})`);
    console.log(`  Healing:   ${colorScore(r.healingRate.toFixed(3))}`);
    console.log(`  Combined:  ${colorScore(r.combined.toFixed(3))}`);
  };

  handlers['resolve'] = (args) => {
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const noHeal = args['no-heal'] || args.raw;
    const result = oracle.resolve({
      description: args.description || '',
      tags,
      language: args.language,
      minCoherency: parseFloat(args['min-coherency']) || undefined,
      heal: !noHeal,
    });
    console.log(`Decision: ${colorDecision(result.decision)}`);
    console.log(`Confidence: ${colorScore(result.confidence)}`);
    console.log(`Reasoning: ${c.dim(result.reasoning)}`);
    if (result.pattern) {
      console.log(`\nPattern: ${c.bold(result.pattern.name)} [${c.cyan(result.pattern.id)}]`);
      console.log(`Language: ${c.blue(result.pattern.language)} | Type: ${c.magenta(result.pattern.patternType)} | Coherency: ${colorScore(result.pattern.coherencyScore)}`);
      console.log(`Tags: ${(result.pattern.tags || []).map(t => c.magenta(t)).join(', ')}`);
      if (result.healing) {
        console.log(`\n${c.dim('── Healing ──')}`);
        console.log(`Reflection: ${colorScore(result.healing.originalCoherence?.toFixed(3))} → ${colorScore(result.healing.finalCoherence?.toFixed(3))} (${result.healing.improvement >= 0 ? '+' : ''}${(result.healing.improvement || 0).toFixed(3)}) in ${result.healing.loops} loop(s)`);
        if (result.healing.healingPath?.length > 0) {
          console.log(`Path: ${c.dim(result.healing.healingPath.join(' → '))}`);
        }
      }
      console.log(`\n${c.dim('── Healed Code ──')}`);
      console.log(result.healedCode || result.pattern.code);
    }
    if (result.whisper) {
      console.log(`\n${c.boldMagenta('── Whisper from the Healed Future ──')}`);
      console.log(c.italic(result.whisper));
    }
    if (result.candidateNotes) {
      console.log(`\n${c.dim('── Why This One ──')}`);
      console.log(c.dim(result.candidateNotes));
    }
    if (result.alternatives?.length > 0) {
      console.log(`\n${c.dim('Alternatives:')} ${result.alternatives.map(a => `${c.cyan(a.name)}(${colorScore(a.composite?.toFixed(3))})`).join(', ')}`);
    }
    if (args.voice && result.whisper) {
      speakCLI(result.whisper);
    }
  };

  handlers['register'] = (args) => {
    if (!args.file) { console.error(c.boldRed('Error:') + ' --file required'); process.exit(1); }
    const code = fs.readFileSync(path.resolve(args.file), 'utf-8');
    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const result = oracle.registerPattern({
      name: args.name || path.basename(args.file, path.extname(args.file)),
      code,
      language: args.language,
      description: args.description || '',
      tags,
      testCode,
      author: args.author || process.env.USER || 'cli-user',
    });
    if (result.registered) {
      console.log(`${c.boldGreen('Pattern registered:')} ${c.bold(result.pattern.name)} [${c.cyan(result.pattern.id)}]`);
      console.log(`Type: ${c.magenta(result.pattern.patternType)} | Complexity: ${c.blue(result.pattern.complexity)}`);
      console.log(`Coherency: ${colorScore(result.pattern.coherencyScore.total)}`);
    } else {
      console.log(`${colorStatus(false)}: ${c.red(result.reason)}`);
    }
  };

  handlers['patterns'] = (args) => {
    const stats = oracle.patternStats();
    console.log(c.boldCyan('Pattern Library:'));
    console.log(`  Total patterns: ${c.bold(String(stats.totalPatterns))}`);
    console.log(`  Avg coherency: ${colorScore(stats.avgCoherency)}`);
    if (Object.keys(stats.byType).length > 0) {
      console.log(`  By type: ${Object.entries(stats.byType).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(stats.byLanguage).length > 0) {
      console.log(`  By language: ${Object.entries(stats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(stats.byComplexity).length > 0) {
      console.log(`  By complexity: ${Object.entries(stats.byComplexity).map(([k, v]) => `${c.cyan(k)}(${v})`).join(', ')}`);
    }
  };

  handlers['search'] = (args) => {
    const term = args.description || args._rest || process.argv.slice(3).filter(a => !a.startsWith('--')).join(' ');
    if (!term) { console.error(c.boldRed('Error:') + ` provide a search term. Usage: ${c.cyan('oracle search <term>')}`); process.exit(1); }
    const mode = args.mode || 'hybrid';
    const results = oracle.search(term, {
      limit: parseInt(args.limit) || 10,
      language: args.language,
      mode,
    });
    if (jsonOut()) { console.log(JSON.stringify(results)); return; }
    if (results.length === 0) {
      console.log(c.yellow('No matches found.'));
    } else {
      const modeLabel = mode === 'semantic' ? c.magenta('[semantic]') : mode === 'hybrid' ? c.cyan('[hybrid]') : '';
      console.log(`Found ${c.bold(String(results.length))} match(es) for ${c.cyan('"' + term + '"')} ${modeLabel}:\n`);
      for (const r of results) {
        const label = r.name || r.description || 'untitled';
        const concepts = r.matchedConcepts?.length > 0 ? c.dim(` (${r.matchedConcepts.join(', ')})`) : '';
        console.log(`  [${colorSource(r.source)}] ${c.bold(label)}  (coherency: ${colorScore(r.coherency)}, match: ${colorScore(r.matchScore)})${concepts}`);
        console.log(`         ${c.blue(r.language)} | ${r.tags.map(t => c.magenta(t)).join(', ') || c.dim('no tags')} | ${c.dim(r.id)}`);
      }
    }
  };

  handlers['smart-search'] = (args) => {
    const term = args.description || args._rest || process.argv.slice(3).filter(a => !a.startsWith('--')).join(' ');
    if (!term) { console.error(c.boldRed('Error:') + ` provide a search term. Usage: ${c.cyan('oracle smart-search <term>')}`); process.exit(1); }
    const result = oracle.smartSearch(term, {
      limit: parseInt(args.limit) || 10,
      language: args.language,
      mode: args.mode || 'hybrid',
    });
    if (jsonOut()) { console.log(JSON.stringify(result)); return; }

    if (result.corrections) {
      console.log(c.yellow(`Auto-corrected: "${term}" → "${result.corrections}"\n`));
    }
    if (result.intent.intents.length > 0) {
      console.log(c.dim(`Detected intents: ${result.intent.intents.map(i => c.magenta(i.name)).join(', ')}`));
    }
    if (result.intent.language) {
      console.log(c.dim(`Language: ${c.blue(result.intent.language)}`));
    }
    if (result.intent.constraints && Object.keys(result.intent.constraints).length > 0) {
      console.log(c.dim(`Constraints: ${Object.entries(result.intent.constraints).map(([k, v]) => `${k}=${v}`).join(', ')}`));
    }
    if (result.intent.intents.length > 0 || result.intent.language || result.corrections) console.log();

    if (result.results.length === 0) {
      console.log(c.yellow('No matches found.'));
      if (result.suggestions.length > 0) {
        console.log(c.dim('\nSuggestions:'));
        for (const s of result.suggestions) console.log(`  ${c.cyan('→')} ${s}`);
      }
    } else {
      console.log(`Found ${c.bold(String(result.results.length))} match(es) (${result.totalMatches} total before limit):\n`);
      for (const r of result.results) {
        const label = r.name || r.description || 'untitled';
        const boost = r.intentBoost > 0 ? c.green(` +${r.intentBoost}`) : '';
        const cross = r.crossLanguage ? c.yellow(' [cross-lang]') : '';
        console.log(`  ${c.bold(label)}  (match: ${colorScore(r.matchScore)}${boost})${cross}`);
        console.log(`         ${c.blue(r.language || '?')} | ${(r.tags || []).map(t => c.magenta(t)).join(', ') || c.dim('no tags')} | ${c.dim(r.id || '')}`);
      }
      if (result.suggestions.length > 0) {
        console.log(c.dim('\nSuggestions:'));
        for (const s of result.suggestions) console.log(`  ${c.cyan('→')} ${s}`);
      }
    }
  };

  handlers['diff'] = (args) => {
    const { colorDiff } = require('../colors');
    const ids = process.argv.slice(3).filter(a => !a.startsWith('--'));
    if (ids.length < 2) { console.error(`Usage: ${c.cyan('oracle diff')} <id-a> <id-b>`); process.exit(1); }
    const result = oracle.diff(ids[0], ids[1]);
    if (result.error) { console.error(c.boldRed(result.error)); process.exit(1); }
    console.log(`${c.red('---')} ${c.bold(result.a.name)} [${c.cyan(result.a.id)}]  coherency: ${colorScore(result.a.coherency)}`);
    console.log(`${c.green('+++')} ${c.bold(result.b.name)} [${c.cyan(result.b.id)}]  coherency: ${colorScore(result.b.coherency)}`);
    console.log('');
    for (const d of result.diff) {
      console.log(colorDiff(d.type, d.line));
    }
    console.log(`\n${c.green(String(result.stats.added) + ' added')}, ${c.red(String(result.stats.removed) + ' removed')}, ${c.dim(String(result.stats.same) + ' unchanged')}`);
  };

  handlers['export'] = (args) => {
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : undefined;
    const output = oracle.export({
      format: args.format || (args.file && args.file.endsWith('.md') ? 'markdown' : 'json'),
      limit: parseInt(args.limit) || 20,
      minCoherency: parseFloat(args['min-coherency']) || 0.5,
      language: args.language,
      tags,
    });
    if (args.file) {
      fs.writeFileSync(path.resolve(args.file), output, 'utf-8');
      console.log(`${c.boldGreen('Exported')} to ${c.cyan(args.file)}`);
    } else {
      console.log(output);
    }
  };

  handlers['import'] = (args) => {
    if (!args.file) { console.error(c.boldRed('Error:') + ` --file required. Usage: ${c.cyan('oracle import --file patterns.json [--dry-run]')}`); process.exit(1); }
    const data = fs.readFileSync(path.resolve(args.file), 'utf-8');
    const dryRun = args['dry-run'] === true;
    const result = oracle.import(data, { dryRun, author: args.author || 'cli-import' });
    if (dryRun) console.log(c.dim('(dry run — no changes written)\n'));
    console.log(`${c.boldGreen('Imported:')} ${result.imported}  |  ${c.yellow('Skipped:')} ${result.skipped}`);
    for (const r of result.results) {
      const icon = r.status === 'imported' || r.status === 'would_import' ? c.green('+') : r.status === 'duplicate' ? c.yellow('=') : c.red('x');
      console.log(`  ${icon} ${r.name} — ${r.status}${r.reason ? ' (' + r.reason.slice(0, 60) + ')' : ''}`);
    }
    if (result.errors.length > 0) {
      console.log(`\n${c.boldRed('Errors:')}`);
      for (const e of result.errors) console.log(`  ${c.red(e)}`);
    }
  };

  handlers['seed'] = (args) => {
    const { seedLibrary, seedNativeLibrary } = require('../../patterns/seeds');
    const results = seedLibrary(oracle);
    console.log(`Core seeds: ${c.boldGreen(String(results.registered))} registered (${c.dim(results.skipped + ' skipped')}, ${results.failed > 0 ? c.boldRed(String(results.failed)) : c.dim(String(results.failed))} failed)`);

    const { seedExtendedLibrary } = require('../../patterns/seeds-extended');
    const ext = seedExtendedLibrary(oracle, { verbose: !!args.verbose });
    console.log(`Extended seeds: ${c.boldGreen(String(ext.registered))} registered (${c.dim(ext.skipped + ' skipped')}, ${ext.failed > 0 ? c.boldRed(String(ext.failed)) : c.dim(String(ext.failed))} failed)`);

    const native = seedNativeLibrary(oracle, { verbose: !!args.verbose });
    console.log(`Native seeds (Python/Go/Rust): ${c.boldGreen(String(native.registered))} registered (${c.dim(native.skipped + ' skipped')}, ${native.failed > 0 ? c.boldRed(String(native.failed)) : c.dim(String(native.failed))} failed)`);

    const { seedProductionLibrary3 } = require('../../patterns/seeds-production-3');
    const prod3 = seedProductionLibrary3(oracle, { verbose: !!args.verbose });
    console.log(`Production seeds 3: ${c.boldGreen(String(prod3.registered))} registered (${c.dim(prod3.skipped + ' skipped')}, ${prod3.failed > 0 ? c.boldRed(String(prod3.failed)) : c.dim(String(prod3.failed))} failed)`);

    const { seedProductionLibrary4 } = require('../../patterns/seeds-production-4');
    const prod4 = seedProductionLibrary4(oracle, { verbose: !!args.verbose });
    console.log(`Production seeds 4: ${c.boldGreen(String(prod4.registered))} registered (${c.dim(prod4.skipped + ' skipped')}, ${prod4.failed > 0 ? c.boldRed(String(prod4.failed)) : c.dim(String(prod4.failed))} failed)`);

    const total = results.registered + ext.registered + native.registered + prod3.registered + prod4.registered;
    console.log(`\nTotal seeded: ${c.boldGreen(String(total))} patterns`);
    console.log(`Library now has ${c.bold(String(oracle.patternStats().totalPatterns))} patterns`);
  };

  handlers['candidates'] = (args) => {
    const filters = {};
    if (args.language) filters.language = args.language;
    if (args['min-coherency']) filters.minCoherency = parseFloat(args['min-coherency']);
    if (args.method) filters.generationMethod = args.method;

    const candidates = oracle.candidates(filters);
    const stats = oracle.candidateStats();

    if (jsonOut()) { console.log(JSON.stringify({ stats, candidates })); return; }

    console.log(c.boldCyan('Candidate Patterns') + c.dim(' (coherent but unproven)\n'));
    console.log(`  Total candidates: ${c.bold(String(stats.totalCandidates))}`);
    console.log(`  Promoted:         ${c.boldGreen(String(stats.promoted))}`);
    console.log(`  Avg coherency:    ${colorScore(stats.avgCoherency)}`);
    if (Object.keys(stats.byLanguage).length > 0) {
      console.log(`  By language:      ${Object.entries(stats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(stats.byMethod).length > 0) {
      console.log(`  By method:        ${Object.entries(stats.byMethod).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
    }

    if (candidates.length > 0) {
      console.log(`\n${c.bold('Candidates:')}`);
      const limit = parseInt(args.limit) || 20;
      for (const cand of candidates.slice(0, limit)) {
        const parent = cand.parentPattern ? c.dim(` ← ${cand.parentPattern}`) : '';
        console.log(`  ${c.cyan(cand.id.slice(0, 8))} ${c.bold(cand.name)} (${c.blue(cand.language)}) coherency: ${colorScore(cand.coherencyTotal)}${parent}`);
      }
      if (candidates.length > limit) {
        console.log(c.dim(`  ... and ${candidates.length - limit} more`));
      }
    }
  };

  handlers['generate'] = (args) => {
    const languages = (args.languages || 'python,typescript').split(',').map(s => s.trim());
    const methods = (args.methods || 'variant,iterative-refine,approach-swap').split(',').map(s => s.trim());
    const maxPatterns = parseInt(args['max-patterns']) || Infinity;
    const minCoherency = parseFloat(args['min-coherency']) || 0.5;

    console.log(c.boldCyan('Continuous Generation') + ' — proven → coherency → candidates\n');
    oracle.recycler.verbose = true;

    const report = oracle.generateCandidates({ maxPatterns, languages, minCoherency, methods });

    console.log('\n' + c.boldCyan('─'.repeat(50)));
    console.log(`Generated:    ${c.bold(String(report.generated))}`);
    console.log(`  Stored:     ${c.boldGreen(String(report.stored))}`);
    console.log(`  Skipped:    ${c.yellow(String(report.skipped))}`);
    console.log(`  Duplicates: ${c.dim(String(report.duplicates))}`);
    if (Object.keys(report.byMethod).length > 0) {
      console.log(`  By method:  ${Object.entries(report.byMethod).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(report.byLanguage).length > 0) {
      console.log(`  By lang:    ${Object.entries(report.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }
    console.log(`\nCascade:      ${report.cascadeBoost}x  |  ξ_global: ${report.xiGlobal}`);

    const cStats = oracle.candidateStats();
    const pStats = oracle.patternStats();
    console.log(`\nLibrary:      ${c.bold(String(pStats.totalPatterns))} proven + ${c.bold(String(cStats.totalCandidates))} candidates`);
    console.log(c.boldCyan('─'.repeat(50)));

    const promo = oracle.autoPromote();
    if (promo.promoted > 0) {
      console.log(`\n${c.boldGreen('Auto-promoted:')} ${promo.promoted} candidate(s) → proven`);
      for (const d of promo.details.filter(d => d.status === 'promoted')) {
        console.log(`  ${c.green('+')} ${c.bold(d.name)} coherency: ${colorScore(d.coherency)}`);
      }
    }
  };

  handlers['promote'] = (args) => {
    const id = args.id || process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle promote')} <candidate-id> [--test <test-file>]`); process.exit(1); }

    if (id === 'auto' || id === '--auto') {
      const result = oracle.autoPromote();
      console.log(c.boldCyan('Auto-Promote Results:\n'));
      console.log(`  Attempted: ${c.bold(String(result.attempted))}`);
      console.log(`  Promoted:  ${c.boldGreen(String(result.promoted))}`);
      console.log(`  Failed:    ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);
      for (const d of result.details) {
        const icon = d.status === 'promoted' ? c.green('+') : c.red('x');
        console.log(`  ${icon} ${c.bold(d.name)} — ${d.status}${d.reason ? ' (' + d.reason.slice(0, 60) + ')' : ''}`);
      }
      return;
    }

    if (id === 'smart') {
      const minCoherency = parseFloat(args['min-coherency']) || 0.9;
      const minConfidence = parseFloat(args['min-confidence']) || 0.8;
      const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
      const override = args['override'] === 'true' || args['override'] === true;
      const result = oracle.smartAutoPromote({ minCoherency, minConfidence, dryRun, manualOverride: override });
      console.log(c.boldCyan('Smart Auto-Promote Results:\n'));
      console.log(`  Total candidates: ${c.bold(String(result.total))}`);
      console.log(`  Promoted:         ${c.boldGreen(String(result.promoted))}`);
      console.log(`  Skipped:          ${c.dim(String(result.skipped))}`);
      console.log(`  Vetoed:           ${result.vetoed > 0 ? c.boldRed(String(result.vetoed)) : c.dim('0')}`);
      if (dryRun) console.log(`  ${c.yellow('(dry run — no changes made)')}`);
      for (const d of result.details) {
        const icon = d.status === 'promoted' || d.status === 'would-promote' ? c.green('+') : d.status === 'vetoed' ? c.red('x') : c.dim('-');
        console.log(`  ${icon} ${c.bold(d.name)} — ${d.status}${d.reason ? ' (' + d.reason.slice(0, 80) + ')' : ''}${d.coherency ? ' [' + colorScore(d.coherency) + ']' : ''}`);
      }
      return;
    }

    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const result = oracle.promote(id, testCode);

    if (result.promoted) {
      console.log(`${c.boldGreen('Promoted:')} ${c.bold(result.pattern.name)} → proven`);
      console.log(`  Coherency: ${colorScore(result.coherency)}`);
      console.log(`  ID: ${c.cyan(result.pattern.id)}`);
    } else {
      console.log(`${c.boldRed('Failed:')} ${result.reason}`);
    }
  };

  handlers['synthesize'] = (args) => {
    const maxCandidates = parseInt(args['max-candidates']) || Infinity;
    const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
    const autoPromoteFlag = args['no-promote'] ? false : true;

    console.log(c.boldCyan('Test Synthesis') + ' — generating tests for candidates\n');

    const result = oracle.synthesizeTests({
      maxCandidates,
      dryRun,
      autoPromote: autoPromoteFlag,
    });

    const syn = result.synthesis;
    console.log(`Processed:    ${c.bold(String(syn.processed))}`);
    console.log(`  Synthesized: ${c.boldGreen(String(syn.synthesized))}`);
    console.log(`  Improved:    ${c.blue(String(syn.improved))}`);
    console.log(`  Failed:      ${syn.failed > 0 ? c.boldRed(String(syn.failed)) : c.dim('0')}`);

    for (const d of syn.details.filter(d => d.status === 'synthesized' || d.status === 'improved')) {
      console.log(`  ${c.green('+')} ${c.bold(d.name)} (${c.blue(d.language)}) — ${d.testLines} test lines`);
    }

    if (result.promotion && result.promotion.promoted > 0) {
      console.log(`\n${c.boldGreen('Auto-promoted:')} ${result.promotion.promoted} candidate(s) → proven`);
      for (const d of result.promotion.details.filter(d => d.status === 'promoted')) {
        console.log(`  ${c.green('+')} ${c.bold(d.name)} coherency: ${colorScore(d.coherency)}`);
      }
    }

    const cStats = oracle.candidateStats();
    const pStats = oracle.patternStats();
    console.log(`\nLibrary: ${c.bold(String(pStats.totalPatterns))} proven + ${c.bold(String(cStats.totalCandidates))} candidates`);
  };
}

module.exports = { registerLibraryCommands };
