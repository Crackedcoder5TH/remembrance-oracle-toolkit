'use strict';
const { execSync } = require('child_process');
const { c, colorScore } = require('../../colors');
const { parseDryRun } = require('../../validate-args');
const { out, outErr, outWarn, _quiet } = require('./out');

// Extracted from the admin monolith (decomposition #5, 2026-08-09).
// Handler bodies are verbatim except: console.* routed through the
// ./out seam, and every best-effort catch now names its failure via
// _quiet — silence became a measurement.
function registerToolsCommands(handlers, { oracle, jsonOut }) {
  handlers['hooks'] = (args) => {
    const { installHooks, uninstallHooks, runPreCommitCheck } = require('../../../ci/hooks');
    const subCmd = args._sub;
    if (subCmd === 'install') {
      const result = installHooks(process.cwd());
      if (result.installed) {
        out(`${c.boldGreen('Hooks installed:')} ${result.hooks.join(', ')}`);
        out(`  ${c.dim('Location:')} ${result.hooksDir}`);
        out(`  ${c.cyan('pre-commit')}  \u2014 Covenant check on staged files`);
        out(`  ${c.cyan('post-commit')} \u2014 Auto-seed patterns from committed files`);
        // Compliance: emit so session.hooksInstalled flips true.
        try {
          const { getEventBus } = require('../../../core/events');
          getEventBus().emitSync('hooks.installed', { hooks: result.hooks });
        } catch { _quiet('admin:tools'); /* ignore */ }
      } else {
        outErr(c.boldRed('Error:') + ' ' + result.error);
      }
    } else if (subCmd === 'uninstall') {
      const result = uninstallHooks(process.cwd());
      if (result.uninstalled) {
        out(`${c.boldGreen('Hooks removed:')} ${result.removed.join(', ') || 'none found'}`);
      } else {
        outErr(c.boldRed('Error:') + ' ' + result.error);
      }
    } else if (subCmd === 'run') {
      const hookName = args._positional[1];
      if (hookName === 'pre-commit') {
        const files = args._positional.slice(2);
        if (files.length === 0) {
          try {
            const staged = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' })
              .trim().split('\n').filter(f => /\.(js|ts|py|go|rs)$/.test(f));
            files.push(...staged);
          } catch (e) {
            if (process.env.ORACLE_DEBUG) outWarn('[admin:init] not in a git repo:', e?.message || e);
          }
        }
        if (files.length === 0) { out(c.dim('No staged source files to check.')); return; }
        const result = runPreCommitCheck(files);
        if (result.passed) {
          out(`${c.boldGreen('All files pass Covenant check')} (${result.total} files)`);
        } else {
          out(`${c.boldRed('Covenant violations in ' + result.blocked + ' file(s):')}`);
          for (const r of result.results.filter(r => !r.sealed)) {
            for (const v of r.violations) {
              out(`  ${c.red(r.file)}: [${c.bold(v.name)}] ${v.reason}`);
            }
          }
          process.exit(1);
        }
      } else {
        outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle hooks run pre-commit [files...]')}`);
      }
    } else {
      out(`Usage: ${c.cyan('oracle hooks')} <install|uninstall|run>`);
    }
  };
  handlers['registry'] = (args) => {
    const sub = args._sub;
    const {
      listRegistry, searchRegistry, getRegistryEntry, batchImport,
      discoverReposSync, checkLicense, getProvenance, findDuplicates,
    } = require('../../../ci/open-source-registry');

    if (!sub || sub === 'help') {
      out(`
${c.boldCyan('Open Source Registry')} \u2014 import proven patterns from curated repositories

${c.bold('Subcommands:')}
  ${c.cyan('registry list')}            List curated repos (${c.yellow('--language')} js, ${c.yellow('--topic')} algo)
  ${c.cyan('registry search')} <query>  Search repos by keyword (${c.yellow('--language')} py, ${c.yellow('--limit')} 5)
  ${c.cyan('registry import')} <name>   Import from a curated repo (${c.yellow('--dry-run')}, ${c.yellow('--split')} function)
  ${c.cyan('registry batch')}           Batch import all repos for a language (${c.yellow('--language')} js)
  ${c.cyan('registry discover')} <q>    Search GitHub for repos (${c.yellow('--min-stars')} 1000, ${c.yellow('--language')} go)
  ${c.cyan('registry license')} <spdx>  Check license compatibility (e.g. MIT, GPL-3.0)
  ${c.cyan('registry provenance')}      Show source/license info for imported patterns
  ${c.cyan('registry duplicates')}      Find duplicate patterns across sources
      `);
      return;
    }

    if (sub === 'list') {
      const repos = listRegistry({ language: args.language, topic: args.topic });
      if (jsonOut()) { out(JSON.stringify(repos)); return; }
      out(`\n${c.boldCyan('Curated Open Source Repos')} (${repos.length} repos)\n`);
      for (const r of repos) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue(r.language.padEnd(12));
        const lic = c.dim(r.license.padEnd(14));
        out(`  ${stars} ${c.green('\u2605')}  ${lang} ${c.bold(r.name.padEnd(25))} ${lic} ${c.dim(r.description.slice(0, 60))}`);
      }
      out(`\n${c.dim('Filter: --language <lang> --topic <topic>')}`);
      return;
    }

    if (sub === 'search') {
      const query = args._positional[1];
      if (!query) { outErr(c.boldRed('Error:') + ' provide a search query'); process.exit(1); }
      const results = searchRegistry(query, { language: args.language, limit: parseInt(args.limit, 10) || 10 });
      if (jsonOut()) { out(JSON.stringify(results)); return; }
      if (results.length === 0) {
        out(c.yellow('\nNo repos found matching: ') + c.bold(query));
        return;
      }
      out(`\n${c.boldCyan('Registry Search:')} ${c.bold(query)} (${results.length} results)\n`);
      for (const r of results) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue(r.language.padEnd(12));
        const scoreBar = c.green('\u2588'.repeat(Math.min(r.score, 10)));
        out(`  ${stars} ${c.green('\u2605')}  ${lang} ${c.bold(r.name.padEnd(25))} ${scoreBar} ${c.dim(r.description.slice(0, 50))}`);
      }
      return;
    }

    if (sub === 'import') {
      const name = args._positional[1];
      if (!name) { outErr(c.boldRed('Error:') + ` provide a repo name. Usage: ${c.cyan('oracle registry import lodash')}`); process.exit(1); }
      const entry = getRegistryEntry(name);
      if (!entry) {
        outErr(c.boldRed('Error:') + ` "${name}" not found in registry. Run ${c.cyan('oracle registry list')} to see available repos.`);
        process.exit(1);
      }
      const dryRun = parseDryRun(args);
      const licCheck = checkLicense(entry.license);
      if (!licCheck.allowed && !args['allow-copyleft']) {
        outErr(c.boldRed('Error:') + ` License blocked: ${entry.license} \u2014 ${licCheck.reason}`);
        outErr(c.dim('Use --allow-copyleft to override'));
        process.exit(1);
      }
      out(`\n${c.boldCyan('Registry Import:')} ${c.bold(entry.name)}`);
      out(`  ${c.dim('URL:')}     ${entry.url}`);
      out(`  ${c.dim('License:')} ${licCheck.allowed ? c.green(entry.license) : c.yellow(entry.license)} (${licCheck.category})`);
      out(`  ${c.dim('Lang:')}    ${c.blue(entry.language)}`);
      if (dryRun) out(`  ${c.dim('(dry run \u2014 no changes)')}`);
      out('');
      try {
        const result = batchImport(oracle, [name], {
          language: args.language,
          dryRun,
          splitMode: args.split || 'file',
          maxFiles: parseInt(args['max-files'], 10) || 200,
          skipLicenseCheck: true,
        });
        const r = result.results[0];
        if (r.status === 'success') {
          out(`  ${c.boldGreen('\u2713')} Harvested: ${c.bold(String(r.harvested))}  Registered: ${c.boldGreen(String(r.registered))}  Skipped: ${c.yellow(String(r.skipped))}`);
        } else {
          out(`  ${c.boldRed('\u2717')} ${r.reason}`);
        }
      } catch (err) {
        outErr(c.boldRed('Error:') + ' Import error: ' + err.message);
        process.exit(1);
      }
      return;
    }

    if (sub === 'batch') {
      const dryRun = parseDryRun(args);
      const language = args.language;
      const repos = listRegistry({ language });
      if (repos.length === 0) {
        outErr(c.boldRed('Error:') + ' No repos found' + (language ? ` for language: ${language}` : ''));
        process.exit(1);
      }
      out(`\n${c.boldCyan('Batch Import')} \u2014 ${repos.length} repos${language ? ' (' + c.blue(language) + ')' : ''}`);
      if (dryRun) out(c.dim('(dry run \u2014 no changes)\n'));
      else out('');
      const names = repos.map(r => r.name);
      const result = batchImport(oracle, names, {
        language: args.language,
        dryRun,
        splitMode: args.split || 'file',
        maxFiles: parseInt(args['max-files'], 10) || 100,
      });
      for (const r of result.results) {
        const icon = r.status === 'success' ? c.green('\u2713') : r.status === 'skipped' ? c.yellow('\u25CB') : c.red('\u2717');
        const detail = r.status === 'success'
          ? `harvested: ${r.harvested}, registered: ${c.boldGreen(String(r.registered))}`
          : r.reason;
        out(`  ${icon} ${c.bold(r.source.padEnd(25))} ${detail}`);
      }
      out(`\n  ${c.bold('Total:')} ${result.succeeded} succeeded, ${result.skipped} skipped, ${result.failed} failed`);
      return;
    }

    if (sub === 'discover') {
      const query = args._positional[1];
      if (!query) { outErr(c.boldRed('Error:') + ` provide a search query. Usage: ${c.cyan('oracle registry discover "sorting algorithms"')}`); process.exit(1); }
      out(c.dim('\nSearching GitHub...'));
      const repos = discoverReposSync(query, {
        language: args.language,
        minStars: parseInt(args['min-stars'], 10) || 100,
        limit: parseInt(args.limit, 10) || 10,
      });
      if (jsonOut()) { out(JSON.stringify(repos)); return; }
      if (repos.length === 0) {
        out(c.yellow('No repos found on GitHub for: ') + c.bold(query));
        return;
      }
      out(`\n${c.boldCyan('GitHub Discovery:')} ${c.bold(query)} (${repos.length} results)\n`);
      for (const r of repos) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue((r.language || 'unknown').padEnd(12));
        const lic = r.license !== 'unknown' ? c.dim(r.license) : c.red('no license');
        out(`  ${stars} ${c.green('\u2605')}  ${lang} ${c.bold(r.name.padEnd(25))} ${lic}`);
        out(`  ${' '.repeat(10)}  ${c.dim(r.url)}`);
        if (r.description) out(`  ${' '.repeat(10)}  ${c.dim(r.description.slice(0, 70))}`);
      }
      out(`\n${c.dim('To import: oracle harvest <url> or oracle registry import <name>')}`);
      return;
    }

    if (sub === 'license') {
      const spdx = args._positional[1];
      if (!spdx) { outErr(c.boldRed('Error:') + ' provide an SPDX license ID (e.g. MIT, GPL-3.0, Apache-2.0)'); process.exit(1); }
      const result = checkLicense(spdx, { allowCopyleft: args['allow-copyleft'] === true });
      if (jsonOut()) { out(JSON.stringify(result)); return; }
      const icon = result.allowed ? c.boldGreen('\u2713 ALLOWED') : c.boldRed('\u2717 BLOCKED');
      out(`\n  ${icon}  ${c.bold(spdx)}`);
      out(`  Category: ${c.cyan(result.category)}`);
      out(`  ${c.dim(result.reason)}\n`);
      return;
    }

    if (sub === 'provenance') {
      const patterns = getProvenance(oracle, { source: args.source, license: args.license });
      if (jsonOut()) { out(JSON.stringify(patterns)); return; }
      if (patterns.length === 0) {
        out(c.yellow('\nNo imported patterns found') + (args.source ? ` from source: ${args.source}` : ''));
        return;
      }
      out(`\n${c.boldCyan('Pattern Provenance')} (${patterns.length} imported patterns)\n`);
      const grouped = {};
      for (const p of patterns) {
        if (!grouped[p.source]) grouped[p.source] = [];
        grouped[p.source].push(p);
      }
      for (const [source, pats] of Object.entries(grouped)) {
        const lic = pats[0].license;
        out(`  ${c.bold(source)} (${c.dim(lic)}) \u2014 ${pats.length} patterns`);
        for (const p of pats.slice(0, 10)) {
          out(`    ${c.cyan(p.name.padEnd(30))} ${c.blue(p.language.padEnd(12))} coherency: ${colorScore(p.coherency)}`);
        }
        if (pats.length > 10) out(c.dim(`    ... and ${pats.length - 10} more`));
      }
      return;
    }

    if (sub === 'duplicates') {
      out(c.dim('\nScanning for duplicates...'));
      const dupes = findDuplicates(oracle, {
        threshold: args.threshold != null ? parseFloat(args.threshold) : 0.85,
        language: args.language,
      });
      if (jsonOut()) { out(JSON.stringify(dupes)); return; }
      if (dupes.length === 0) {
        out(c.boldGreen('\n  \u2713 No duplicates found\n'));
        return;
      }
      out(`\n${c.boldCyan('Duplicate Patterns')} (${dupes.length} pairs)\n`);
      for (const d of dupes.slice(0, 30)) {
        const simColor = d.similarity >= 0.95 ? c.red : c.yellow;
        const typeIcon = d.type === 'exact' ? c.red('EXACT') : c.yellow('NEAR');
        out(`  ${typeIcon}  ${simColor((d.similarity * 100).toFixed(0) + '%')}  ${c.bold(d.pattern1.name)} ${c.dim('\u2194')} ${c.bold(d.pattern2.name)}`);
      }
      if (dupes.length > 30) out(c.dim(`  ... and ${dupes.length - 30} more`));
      out(`\n${c.dim('Tip: use oracle deep-clean to remove duplicates')}`);
      return;
    }

    outErr(c.boldRed('Error:') + ` Unknown registry subcommand: ${sub}. Run ${c.cyan('oracle registry help')} for usage.`);
    process.exit(1);
  };
  handlers['forge'] = (args) => {
    try {
      const { TestForge } = require('../../../test-forge');
      const forge = new TestForge(oracle);
      const dryRun = parseDryRun(args);
      const id = args.id;
      const limit = args.limit ? parseInt(args.limit, 10) : undefined;

      // forge --score — score all existing tests
      if (args.score === true || args.score === 'true') {
        const result = forge.scoreTests();
        if (jsonOut()) { out(JSON.stringify(result)); return; }
        out(c.boldCyan(`Test Quality Scores — ${result.total} pattern(s)\n`));
        out(`  Average score: ${colorScore(result.avgScore)}\n`);
        for (const r of result.results.slice(0, 30)) {
          const scoreBar = c.green('\u2588'.repeat(Math.round(r.score * 10)));
          out(`  ${colorScore(r.score)} ${scoreBar} ${c.bold(r.name)}`);
          if (r.suggestions.length > 0) {
            out(`    ${c.dim(r.suggestions[0])}`);
          }
        }
        if (result.results.length > 30) out(c.dim(`  ... and ${result.results.length - 30} more`));
        return;
      }

      // forge --run — generate + run tests
      if (args.run === true || args.run === 'true') {
        const result = forge.runTests();
        if (jsonOut()) { out(JSON.stringify(result)); return; }
        out(c.boldCyan(`Test Run Results — ${result.total} pattern(s)\n`));
        out(`  Passed: ${c.boldGreen(String(result.passed))}  Failed: ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}\n`);
        for (const r of result.results) {
          const icon = r.passed ? c.green('\u2713') : c.red('\u2717');
          out(`  ${icon} ${c.bold(r.name)} ${c.dim(`(${r.duration}ms)`)}`);
          if (!r.passed && r.error) {
            out(`    ${c.red(r.error.slice(0, 120))}`);
          }
        }
        return;
      }

      // forge --promote — full pipeline
      if (args.promote === true || args.promote === 'true') {
        const result = forge.forgeAndPromote({ limit });
        if (jsonOut()) { out(JSON.stringify(result)); return; }
        out(c.boldCyan(`Test Forge — Full Pipeline\n`));
        out(`  Untested:   ${c.bold(String(result.total))}`);
        out(`  Generated:  ${c.boldGreen(String(result.generated))}`);
        out(`  Passed:     ${c.boldGreen(String(result.passed))}`);
        out(`  Failed:     ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);
        out(`  Promoted:   ${c.boldGreen(String(result.promoted))}`);
        out(`  Avg score:  ${colorScore(result.avgScore)}`);
        if (result.newlyEligible.length > 0) {
          out(`\n${c.bold('  Newly publication-eligible:')}`);
          for (const p of result.newlyEligible) {
            out(`    ${c.green('\u2713')} ${c.bold(p.name)} (coherency: ${colorScore(p.coherency)})`);
          }
        }
        return;
      }

      // forge --id <id> — single pattern
      if (id) {
        const result = forge.forgeTest(id, { dryRun });
        if (jsonOut()) { out(JSON.stringify(result)); return; }
        if (result.success) {
          out(`${c.boldGreen('Test generated')} for pattern ${c.cyan(id)}`);
          out(`  Strategy:    ${c.bold(result.strategy)}`);
          out(`  Assertions:  ${c.bold(String(result.assertions))}`);
          out(`  Duration:    ${c.dim(result.duration + 'ms')}`);
          if (dryRun) out(c.yellow('\n(dry run — test not stored)'));
          if (args.verbose === true) {
            out(`\n${c.dim('Generated test code:')}`);
            out(result.testCode);
          }
        } else {
          outErr(c.boldRed('Error:') + ' ' + result.error);
          if (result.testCode && args.verbose === true) {
            out(`\n${c.dim('Generated test code (failed):')}`);
            out(result.testCode);
          }
        }
        return;
      }

      // Default: forge — generate tests for all untested
      const result = forge.forgeTests({ dryRun, limit });
      if (jsonOut()) { out(JSON.stringify(result)); return; }
      out(c.boldCyan(`Test Forge — Generate Tests\n`));
      out(`  Untested:   ${c.bold(String(result.total))}`);
      out(`  Generated:  ${c.boldGreen(String(result.generated))}`);
      out(`  Skipped:    ${c.dim(String(result.skipped))}`);
      out(`  Failed:     ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);

      if (result.results.length > 0) {
        out('');
        for (const r of result.results.slice(0, 30)) {
          if (r.status === 'generated' || r.status === 'dry-run') {
            const tag = r.status === 'dry-run' ? c.yellow(' [dry-run]') : '';
            out(`  ${c.green('\u2713')} ${c.bold(r.name)} — ${r.strategy} (${r.assertions} assertions, ${r.duration}ms)${tag}`);
          } else if (r.status === 'failed' || r.status === 'error') {
            out(`  ${c.red('\u2717')} ${c.bold(r.name)} — ${c.dim(r.reason || 'failed')}`);
          } else {
            out(`  ${c.dim('-')} ${c.dim(r.name)} — ${c.dim(r.reason || 'skipped')}`);
          }
        }
        if (result.results.length > 30) out(c.dim(`  ... and ${result.results.length - 30} more`));
      }

      if (dryRun) out(c.yellow('\n(dry run — no tests stored)'));
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Test forge error: ' + err.message);
    }
  };
}
registerToolsCommands.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 14, period: 4,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'orchestration',
};

module.exports = { registerToolsCommands };
