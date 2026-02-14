/**
 * Debug Oracle CLI commands: debug capture/search/feedback/grow/seed/patterns/stats/share/pull/sync/global
 */

const fs = require('fs');
const path = require('path');
const { c, colorScore, colorSource } = require('../colors');

function registerDebugCommands(handlers, { oracle, jsonOut }) {

  handlers['debug'] = (args) => {
    const sub = process.argv[3];

    if (!sub || sub === 'help') {
      console.log(`
${c.boldCyan('Debug Oracle')} \u2014 exponential debugging intelligence

${c.bold('Subcommands:')}
  ${c.cyan('debug capture')}    Capture an error\u2192fix pair as a debug pattern
  ${c.cyan('debug search')}     Search for fixes matching an error message
  ${c.cyan('debug feedback')}   Report whether a fix worked (grows confidence)
  ${c.cyan('debug grow')}       Generate variants from high-confidence patterns
  ${c.cyan('debug patterns')}   List stored debug patterns
  ${c.cyan('debug stats')}      Show debug pattern statistics
  ${c.cyan('debug seed')}       Seed debug patterns for all 10 error categories
  ${c.cyan('debug share')}      Share debug patterns to community
  ${c.cyan('debug pull')}       Pull debug patterns from community
  ${c.cyan('debug sync')}       Sync debug patterns to personal store
  ${c.cyan('debug global')}     Show debug stats across all tiers

${c.bold('Options:')}
  ${c.yellow('--error')} <message>     Error message to capture/search
  ${c.yellow('--stack')} <trace>       Stack trace (optional)
  ${c.yellow('--fix')} <file>          Fix code file
  ${c.yellow('--description')} <text>  Description of the fix
  ${c.yellow('--language')} <lang>     Programming language
  ${c.yellow('--id')} <id>             Debug pattern ID (for feedback)
  ${c.yellow('--success')}             Mark feedback as resolved
  ${c.yellow('--category')} <cat>      Filter by error category
  ${c.yellow('--min-confidence')} <n>  Minimum confidence threshold
  ${c.yellow('--json')}                JSON output
      `);
      return;
    }

    if (sub === 'capture') {
      const errorMessage = args.error;
      if (!errorMessage) { console.error(c.boldRed('Error:') + ' --error required'); process.exit(1); }
      const fixFile = args.fix;
      if (!fixFile) { console.error(c.boldRed('Error:') + ' --fix required (path to fix code)'); process.exit(1); }
      const fixCode = fs.readFileSync(path.resolve(fixFile), 'utf-8');
      const result = oracle.debugCapture({
        errorMessage,
        stackTrace: args.stack || '',
        fixCode,
        fixDescription: args.description || '',
        language: args.language || 'javascript',
        tags: args.tags ? args.tags.split(',').map(t => t.trim()) : [],
      });
      if (jsonOut()) { console.log(JSON.stringify(result)); return; }
      if (result.captured) {
        const p = result.pattern;
        console.log(`${c.boldGreen('Captured!')} ${c.bold(p.errorClass)}:${c.cyan(p.errorCategory)} [${c.dim(p.id)}]`);
        console.log(`  Confidence: ${colorScore(p.confidence)}`);
        console.log(`  Language:   ${c.blue(p.language)}`);
        if (result.variants?.length > 0) {
          console.log(`  Variants:   ${c.boldGreen('+' + result.variants.length)} auto-generated`);
          for (const v of result.variants) {
            console.log(`    ${c.green('+')} ${c.blue(v.language)} ${c.dim(v.id)}`);
          }
        }
        if (result.updated) {
          console.log(c.yellow('  (Updated existing pattern with new fix)'));
        }
      } else if (result.duplicate) {
        console.log(`${c.yellow('Duplicate:')} existing pattern ${c.cyan(result.existingId)} (confidence: ${colorScore(result.confidence)})`);
      } else {
        console.log(`${c.boldRed('Failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'search') {
      const errorMessage = args.error || process.argv.slice(4).filter(a => !a.startsWith('--')).join(' ');
      if (!errorMessage) { console.error(c.boldRed('Error:') + ` provide an error message. Usage: ${c.cyan('oracle debug search --error "TypeError: x is not a function"')}`); process.exit(1); }
      const results = oracle.debugSearch({
        errorMessage,
        stackTrace: args.stack || '',
        language: args.language,
        limit: parseInt(args.limit) || 5,
        federated: args.local !== true,
      });
      if (jsonOut()) { console.log(JSON.stringify(results)); return; }
      if (results.length === 0) {
        console.log(c.yellow('No matching debug patterns found.'));
      } else {
        console.log(`Found ${c.bold(String(results.length))} fix(es) for ${c.red('"' + errorMessage.slice(0, 60) + '"')}:\n`);
        for (const r of results) {
          const sourceLabel = r.source ? colorSource(r.source) : c.dim('local');
          console.log(`  [${sourceLabel}] ${c.bold(r.errorClass)}:${c.cyan(r.errorCategory)} \u2014 match: ${colorScore(r.matchScore)} confidence: ${colorScore(r.confidence)}`);
          console.log(`    ${c.blue(r.language)} | ${r.matchType} match | applied ${r.timesApplied}x \u2192 resolved ${r.timesResolved}x`);
          console.log(`    ${c.dim('Fix:')} ${r.fixDescription || r.fixCode.split('\n')[0].slice(0, 80)}`);
          console.log(`    ${c.dim('ID:')} ${r.id}`);
          console.log('');
        }
      }
      return;
    }

    if (sub === 'feedback') {
      const id = args.id || process.argv[4];
      if (!id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const resolved = args.success === true || args.success === 'true';
      const result = oracle.debugFeedback(id, resolved);
      if (result.success) {
        console.log(`${resolved ? c.boldGreen('Resolved!') : c.boldRed('Not resolved.')} Confidence: ${colorScore(result.confidence)}`);
        console.log(`  Applied: ${result.timesApplied}x | Resolved: ${result.timesResolved}x`);
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
      const maxPatterns = parseInt(args['max-patterns']) || Infinity;
      console.log(c.boldCyan('Debug Growth Engine') + ' \u2014 exponential variant generation\n');
      const report = oracle.debugGrow({ minConfidence, maxPatterns });
      console.log(`  Processed:  ${c.bold(String(report.processed))} patterns`);
      console.log(`  Generated:  ${c.bold(String(report.generated))} variants`);
      console.log(`  Stored:     ${c.boldGreen(String(report.stored))} new`);
      console.log(`  Skipped:    ${c.dim(String(report.skipped))} duplicates`);
      if (Object.keys(report.byLanguage).length > 0) {
        console.log(`  By language: ${Object.entries(report.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
      }
      if (Object.keys(report.byCategory).length > 0) {
        console.log(`  By category: ${Object.entries(report.byCategory).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
      }
      return;
    }

    if (sub === 'seed') {
      console.log(c.boldCyan('Debug Pattern Seeding') + ' \u2014 covering all 10 error categories\n');
      const verbose = args.verbose === 'true' || args.verbose === true;
      const categories = args.category ? args.category.split(',').map(ct => ct.trim()) : undefined;
      const languages = args.language ? args.language.split(',').map(l => l.trim()) : undefined;
      const report = oracle.debugSeed({ verbose, categories, languages });
      if (jsonOut()) { console.log(JSON.stringify(report)); return; }
      console.log(`  Seeded:     ${c.boldGreen(String(report.seeded))} debug patterns`);
      console.log(`  Variants:   ${c.boldGreen('+' + String(report.variants))} auto-generated`);
      console.log(`  Duplicates: ${c.dim(String(report.duplicates))} already existed`);
      console.log(`  Skipped:    ${c.dim(String(report.skipped))}`);
      if (Object.keys(report.byCategory).length > 0) {
        console.log(`\n  By category: ${Object.entries(report.byCategory).map(([k, v]) => `${k}(${v})`).join(', ')}`);
      }
      if (Object.keys(report.byLanguage).length > 0) {
        console.log(`  By language: ${Object.entries(report.byLanguage).map(([k, v]) => `${k}(${v})`).join(', ')}`);
      }
      const syncReport = oracle.debugSyncPersonal({ verbose: false });
      if (syncReport.synced > 0) {
        console.log(`\n  ${c.green('Auto-synced')} ${c.boldGreen(String(syncReport.synced))} debug patterns to personal store`);
      }
      const stats = oracle.debugStats();
      console.log(`\n  Total debug patterns: ${c.bold(String(stats.totalPatterns))} across ${Object.keys(stats.byCategory).length} categories`);
      return;
    }

    if (sub === 'patterns') {
      const filters = {};
      if (args.language) filters.language = args.language;
      if (args.category) filters.category = args.category;
      if (args['min-confidence']) filters.minConfidence = parseFloat(args['min-confidence']);
      filters.limit = parseInt(args.limit) || 20;
      const patterns = oracle.debugPatterns(filters);
      if (jsonOut()) { console.log(JSON.stringify(patterns)); return; }
      if (patterns.length === 0) {
        console.log(c.yellow('No debug patterns found. Use ') + c.cyan('oracle debug capture') + c.yellow(' to add one.'));
      } else {
        console.log(c.boldCyan(`Debug Patterns (${patterns.length}):\n`));
        for (const p of patterns) {
          const method = p.generationMethod === 'capture' ? c.green('captured') : c.cyan(p.generationMethod);
          console.log(`  ${c.dim(p.id.slice(0, 8))} ${c.bold(p.errorClass)}:${c.cyan(p.errorCategory)} (${c.blue(p.language)}) confidence: ${colorScore(p.confidence)} [${method}]`);
          console.log(`    ${c.dim(p.errorMessage.slice(0, 80))}`);
        }
      }
      return;
    }

    if (sub === 'stats') {
      const stats = oracle.debugStats();
      if (jsonOut()) { console.log(JSON.stringify(stats)); return; }
      console.log(c.boldCyan('Debug Oracle Stats:\n'));
      console.log(`  Total patterns:    ${c.bold(String(stats.totalPatterns))}`);
      console.log(`  Avg confidence:    ${colorScore(stats.avgConfidence)}`);
      console.log(`  Total applied:     ${c.bold(String(stats.totalApplied))}`);
      console.log(`  Total resolved:    ${c.boldGreen(String(stats.totalResolved))}`);
      console.log(`  Resolution rate:   ${colorScore(stats.resolutionRate)}`);
      console.log(`  Captured:          ${c.bold(String(stats.captured))}`);
      console.log(`  Generated:         ${c.bold(String(stats.generated))}`);
      if (Object.keys(stats.byCategory).length > 0) {
        console.log(`\n  By category:  ${Object.entries(stats.byCategory).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
      }
      if (Object.keys(stats.byLanguage).length > 0) {
        console.log(`  By language:  ${Object.entries(stats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
      }
      if (Object.keys(stats.byMethod).length > 0) {
        console.log(`  By method:    ${Object.entries(stats.byMethod).map(([k, v]) => `${c.cyan(k)}(${v})`).join(', ')}`);
      }
      return;
    }

    if (sub === 'share') {
      const verbose = args.verbose === 'true' || args.verbose === true;
      const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
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
      const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
      console.log(c.boldCyan('Pull Debug Patterns from Community\n'));
      const report = oracle.debugPullCommunity({
        verbose, dryRun, category: args.category, language: args.language,
        minConfidence: parseFloat(args['min-confidence']) || 0.3,
        limit: parseInt(args.limit) || Infinity,
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
        dryRun: args['dry-run'] === true || args['dry-run'] === 'true',
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
        console.log(`\n  ${c.bold('Personal:')} ${c.bold(String(stats.personal.totalPatterns))} patterns, avg confidence ${colorScore(stats.personal.avgConfidence)}`);
      }
      if (stats.community) {
        console.log(`  ${c.bold('Community:')} ${c.bold(String(stats.community.totalPatterns))} patterns, avg confidence ${colorScore(stats.community.avgConfidence)}`);
      }
      return;
    }

    console.error(c.boldRed('Error:') + ` Unknown debug subcommand: ${sub}. Run ${c.cyan('oracle debug help')} for usage.`);
    process.exit(1);
  };
}

module.exports = { registerDebugCommands };
