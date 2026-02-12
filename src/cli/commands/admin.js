/**
 * Admin CLI commands: users, audit, auto-seed, ci-feedback, ci-stats, ci-track, hooks, registry
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { c, colorScore } = require('../colors');

function registerAdminCommands(handlers, { oracle, jsonOut }) {

  handlers['users'] = (args) => {
    try {
      const { AuthManager } = require('../../auth/auth');
      const sqliteStore = oracle.store.getSQLiteStore();
      const auth = new AuthManager(sqliteStore);
      const subCmd = process.argv[3];

      if (subCmd === 'add') {
        const username = args.username || args.name;
        const password = args.password;
        const role = args.role || 'contributor';
        if (!username || !password) { console.error(`Usage: ${c.cyan('oracle users add')} --username <name> --password <pass> [--role admin|contributor|viewer]`); process.exit(1); }
        const user = auth.createUser(username, password, role);
        console.log(`${c.boldGreen('User created:')} ${c.bold(user.username)} (${user.role})`);
        console.log(`  API Key: ${c.cyan(user.apiKey)}`);
      } else if (subCmd === 'delete') {
        const id = args.id;
        if (!id) { console.error(`Usage: ${c.cyan('oracle users delete')} --id <user-id>`); process.exit(1); }
        const deleted = auth.deleteUser(id);
        console.log(deleted ? c.boldGreen('User deleted.') : c.yellow('User not found.'));
      } else {
        const users = auth.listUsers();
        console.log(c.boldCyan(`Users (${users.length}):\n`));
        for (const u of users) {
          console.log(`  ${c.bold(u.username)} [${c.cyan(u.id.slice(0, 8))}] role: ${c.magenta(u.role)} key: ${c.dim(u.apiKey.slice(0, 12) + '...')}`);
        }
      }
    } catch (err) {
      console.error(c.red('Auth error: ' + err.message));
    }
  };

  handlers['audit'] = (args) => {
    const sqliteStore = oracle.store.getSQLiteStore();
    if (!sqliteStore) {
      console.log(c.yellow('Audit log requires SQLite backend.'));
      return;
    }
    const entries = sqliteStore.getAuditLog({
      limit: parseInt(args.limit) || 20,
      table: args.table,
      id: args.id,
      action: args.action,
    });
    if (entries.length === 0) {
      console.log(c.yellow('No audit log entries found.'));
    } else {
      console.log(c.boldCyan(`Audit Log (${entries.length} entries):\n`));
      for (const e of entries) {
        const actionColor = e.action === 'add' ? c.green : e.action === 'prune' || e.action === 'retire' ? c.red : c.yellow;
        console.log(`  ${c.dim(e.timestamp)} ${actionColor(e.action.padEnd(7))} ${c.cyan(e.table.padEnd(8))} ${c.dim(e.id)} ${c.dim(JSON.stringify(e.detail))}`);
      }
    }
  };

  handlers['auto-seed'] = (args) => {
    try {
      const { autoSeed } = require('../../ci/auto-seed');
      const baseDir = args.dir || process.cwd();
      const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
      const result = autoSeed(oracle, baseDir, { language: args.language, dryRun });
      if (dryRun) {
        console.log(c.boldCyan('Auto-Seed Dry Run:'));
        console.log(`  Discovered ${c.bold(String(result.discovered))} source file(s) with tests`);
        for (const p of result.patterns) {
          console.log(`  ${c.cyan(p.name)} (${c.blue(p.language)}) \u2014 ${p.functions.slice(0, 5).join(', ')}`);
        }
      } else {
        console.log(`${c.boldGreen('Auto-seeded:')} ${result.registered} registered, ${result.skipped} skipped, ${result.failed} failed`);
        for (const p of result.patterns) {
          console.log(`  ${c.cyan(p.name)} [${c.dim(p.id)}] coherency: ${colorScore(p.coherency)}`);
        }
      }
    } catch (err) {
      console.error(c.red('Auto-seed error: ' + err.message));
    }
  };

  handlers['ci-feedback'] = (args) => {
    const { CIFeedbackReporter } = require('../../ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    const status = args.status;
    if (!status) { console.error(c.boldRed('Error:') + ` --status required (pass or fail). Usage: ${c.cyan('oracle ci-feedback --status pass')}`); process.exit(1); }
    const result = reporter.reportResults(status, {
      testOutput: args.output || '',
      commitSha: process.env.GITHUB_SHA || process.env.CI_COMMIT_SHA || '',
      ciProvider: process.env.GITHUB_ACTIONS ? 'github' : process.env.CI ? 'ci' : 'local',
    });
    if (result.reported === 0) {
      console.log(c.yellow(result.message));
    } else {
      console.log(`${c.boldGreen('Reported')} ${result.reported} pattern(s) as ${status === 'pass' ? c.boldGreen('PASS') : c.boldRed('FAIL')}:`);
      for (const u of result.updated) {
        console.log(`  ${c.cyan(u.id)} ${u.name ? c.bold(u.name) : ''} \u2192 reliability: ${colorScore(u.newReliability)}`);
      }
    }
    if (result.errors.length > 0) {
      console.log(`${c.boldRed('Errors:')} ${result.errors.map(e => `${e.id}: ${e.error}`).join(', ')}`);
    }
  };

  handlers['ci-stats'] = (args) => {
    const { CIFeedbackReporter } = require('../../ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    const stats = reporter.stats();
    console.log(c.boldCyan('CI Feedback Stats:'));
    console.log(`  Tracked patterns: ${c.bold(String(stats.trackedPatterns))}`);
    console.log(`  Unreported: ${stats.unreported > 0 ? c.boldYellow(String(stats.unreported)) : c.dim('0')}`);
    console.log(`  Reported: ${c.boldGreen(String(stats.reported))}`);
    console.log(`  Total feedback events: ${c.bold(String(stats.totalFeedbackEvents))}`);
    if (stats.recentFeedback.length > 0) {
      console.log(`\n${c.bold('Recent feedback:')}`);
      for (const fb of stats.recentFeedback) {
        const statusColor = fb.status === 'pass' ? c.boldGreen : c.boldRed;
        console.log(`  ${c.dim(fb.timestamp)} ${statusColor(fb.status)} \u2014 ${fb.patternsReported} pattern(s) ${fb.commitSha ? c.dim(fb.commitSha.slice(0, 8)) : ''}`);
      }
    }
  };

  handlers['ci-track'] = (args) => {
    const { CIFeedbackReporter } = require('../../ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
    const record = reporter.trackPull({ id: args.id, name: args.name || null, source: args.source || 'manual' });
    console.log(`${c.boldGreen('Tracking:')} ${c.cyan(record.id)} ${record.name ? c.bold(record.name) : ''}`);
  };

  handlers['hooks'] = (args) => {
    const { installHooks, uninstallHooks, runPreCommitCheck } = require('../../ci/hooks');
    const subCmd = process.argv[3];
    if (subCmd === 'install') {
      const result = installHooks(process.cwd());
      if (result.installed) {
        console.log(`${c.boldGreen('Hooks installed:')} ${result.hooks.join(', ')}`);
        console.log(`  ${c.dim('Location:')} ${result.hooksDir}`);
        console.log(`  ${c.cyan('pre-commit')}  \u2014 Covenant check on staged files`);
        console.log(`  ${c.cyan('post-commit')} \u2014 Auto-seed patterns from committed files`);
      } else {
        console.error(c.red(result.error));
      }
    } else if (subCmd === 'uninstall') {
      const result = uninstallHooks(process.cwd());
      if (result.uninstalled) {
        console.log(`${c.boldGreen('Hooks removed:')} ${result.removed.join(', ') || 'none found'}`);
      } else {
        console.error(c.red(result.error));
      }
    } else if (subCmd === 'run') {
      const hookName = process.argv[4];
      if (hookName === 'pre-commit') {
        const files = process.argv.slice(5).filter(a => !a.startsWith('--'));
        if (files.length === 0) {
          try {
            const staged = execSync('git diff --cached --name-only --diff-filter=ACM', { encoding: 'utf-8' })
              .trim().split('\n').filter(f => /\.(js|ts|py|go|rs)$/.test(f));
            files.push(...staged);
          } catch { /* not in a git repo */ }
        }
        if (files.length === 0) { console.log(c.dim('No staged source files to check.')); return; }
        const result = runPreCommitCheck(files);
        if (result.passed) {
          console.log(`${c.boldGreen('All files pass Covenant check')} (${result.total} files)`);
        } else {
          console.log(`${c.boldRed('Covenant violations in ' + result.blocked + ' file(s):')}`);
          for (const r of result.results.filter(r => !r.sealed)) {
            for (const v of r.violations) {
              console.log(`  ${c.red(r.file)}: [${c.bold(v.name)}] ${v.reason}`);
            }
          }
          process.exit(1);
        }
      } else {
        console.error(`Usage: ${c.cyan('oracle hooks run pre-commit [files...]')}`);
      }
    } else {
      console.log(`Usage: ${c.cyan('oracle hooks')} <install|uninstall|run>`);
    }
  };

  handlers['registry'] = (args) => {
    const sub = process.argv[3];
    const {
      listRegistry, searchRegistry, getRegistryEntry, batchImport,
      discoverReposSync, checkLicense, getProvenance, findDuplicates,
    } = require('../../ci/open-source-registry');

    if (!sub || sub === 'help') {
      console.log(`
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
      if (jsonOut()) { console.log(JSON.stringify(repos)); return; }
      console.log(`\n${c.boldCyan('Curated Open Source Repos')} (${repos.length} repos)\n`);
      for (const r of repos) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue(r.language.padEnd(12));
        const lic = c.dim(r.license.padEnd(14));
        console.log(`  ${stars} ${c.green('\u2605')}  ${lang} ${c.bold(r.name.padEnd(25))} ${lic} ${c.dim(r.description.slice(0, 60))}`);
      }
      console.log(`\n${c.dim('Filter: --language <lang> --topic <topic>')}`);
      return;
    }

    if (sub === 'search') {
      const query = process.argv[4];
      if (!query) { console.error(c.boldRed('Error:') + ' provide a search query'); process.exit(1); }
      const results = searchRegistry(query, { language: args.language, limit: parseInt(args.limit) || 10 });
      if (jsonOut()) { console.log(JSON.stringify(results)); return; }
      if (results.length === 0) {
        console.log(c.yellow('\nNo repos found matching: ') + c.bold(query));
        return;
      }
      console.log(`\n${c.boldCyan('Registry Search:')} ${c.bold(query)} (${results.length} results)\n`);
      for (const r of results) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue(r.language.padEnd(12));
        const scoreBar = c.green('\u2588'.repeat(Math.min(r.score, 10)));
        console.log(`  ${stars} ${c.green('\u2605')}  ${lang} ${c.bold(r.name.padEnd(25))} ${scoreBar} ${c.dim(r.description.slice(0, 50))}`);
      }
      return;
    }

    if (sub === 'import') {
      const name = process.argv[4];
      if (!name) { console.error(c.boldRed('Error:') + ` provide a repo name. Usage: ${c.cyan('oracle registry import lodash')}`); process.exit(1); }
      const entry = getRegistryEntry(name);
      if (!entry) {
        console.error(c.boldRed('Error:') + ` "${name}" not found in registry. Run ${c.cyan('oracle registry list')} to see available repos.`);
        process.exit(1);
      }
      const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
      const licCheck = checkLicense(entry.license);
      if (!licCheck.allowed && !args['allow-copyleft']) {
        console.error(c.boldRed('License blocked:') + ` ${entry.license} \u2014 ${licCheck.reason}`);
        console.error(c.dim('Use --allow-copyleft to override'));
        process.exit(1);
      }
      console.log(`\n${c.boldCyan('Registry Import:')} ${c.bold(entry.name)}`);
      console.log(`  ${c.dim('URL:')}     ${entry.url}`);
      console.log(`  ${c.dim('License:')} ${licCheck.allowed ? c.green(entry.license) : c.yellow(entry.license)} (${licCheck.category})`);
      console.log(`  ${c.dim('Lang:')}    ${c.blue(entry.language)}`);
      if (dryRun) console.log(`  ${c.dim('(dry run \u2014 no changes)')}`);
      console.log('');
      try {
        const result = batchImport(oracle, [name], {
          language: args.language,
          dryRun,
          splitMode: args.split || 'file',
          maxFiles: parseInt(args['max-files']) || 200,
          skipLicenseCheck: true,
        });
        const r = result.results[0];
        if (r.status === 'success') {
          console.log(`  ${c.boldGreen('\u2713')} Harvested: ${c.bold(String(r.harvested))}  Registered: ${c.boldGreen(String(r.registered))}  Skipped: ${c.yellow(String(r.skipped))}`);
        } else {
          console.log(`  ${c.boldRed('\u2717')} ${r.reason}`);
        }
      } catch (err) {
        console.error(c.red('Import error: ' + err.message));
        process.exit(1);
      }
      return;
    }

    if (sub === 'batch') {
      const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
      const language = args.language;
      const repos = listRegistry({ language });
      if (repos.length === 0) {
        console.error(c.yellow('No repos found') + (language ? ` for language: ${language}` : ''));
        process.exit(1);
      }
      console.log(`\n${c.boldCyan('Batch Import')} \u2014 ${repos.length} repos${language ? ' (' + c.blue(language) + ')' : ''}`);
      if (dryRun) console.log(c.dim('(dry run \u2014 no changes)\n'));
      else console.log('');
      const names = repos.map(r => r.name);
      const result = batchImport(oracle, names, {
        language: args.language,
        dryRun,
        splitMode: args.split || 'file',
        maxFiles: parseInt(args['max-files']) || 100,
      });
      for (const r of result.results) {
        const icon = r.status === 'success' ? c.green('\u2713') : r.status === 'skipped' ? c.yellow('\u25CB') : c.red('\u2717');
        const detail = r.status === 'success'
          ? `harvested: ${r.harvested}, registered: ${c.boldGreen(String(r.registered))}`
          : r.reason;
        console.log(`  ${icon} ${c.bold(r.source.padEnd(25))} ${detail}`);
      }
      console.log(`\n  ${c.bold('Total:')} ${result.succeeded} succeeded, ${result.skipped} skipped, ${result.failed} failed`);
      return;
    }

    if (sub === 'discover') {
      const query = process.argv[4];
      if (!query) { console.error(c.boldRed('Error:') + ` provide a search query. Usage: ${c.cyan('oracle registry discover "sorting algorithms"')}`); process.exit(1); }
      console.log(c.dim('\nSearching GitHub...'));
      const repos = discoverReposSync(query, {
        language: args.language,
        minStars: parseInt(args['min-stars']) || 100,
        limit: parseInt(args.limit) || 10,
      });
      if (jsonOut()) { console.log(JSON.stringify(repos)); return; }
      if (repos.length === 0) {
        console.log(c.yellow('No repos found on GitHub for: ') + c.bold(query));
        return;
      }
      console.log(`\n${c.boldCyan('GitHub Discovery:')} ${c.bold(query)} (${repos.length} results)\n`);
      for (const r of repos) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue((r.language || 'unknown').padEnd(12));
        const lic = r.license !== 'unknown' ? c.dim(r.license) : c.red('no license');
        console.log(`  ${stars} ${c.green('\u2605')}  ${lang} ${c.bold(r.name.padEnd(25))} ${lic}`);
        console.log(`  ${' '.repeat(10)}  ${c.dim(r.url)}`);
        if (r.description) console.log(`  ${' '.repeat(10)}  ${c.dim(r.description.slice(0, 70))}`);
      }
      console.log(`\n${c.dim('To import: oracle harvest <url> or oracle registry import <name>')}`);
      return;
    }

    if (sub === 'license') {
      const spdx = process.argv[4];
      if (!spdx) { console.error(c.boldRed('Error:') + ' provide an SPDX license ID (e.g. MIT, GPL-3.0, Apache-2.0)'); process.exit(1); }
      const result = checkLicense(spdx, { allowCopyleft: args['allow-copyleft'] === true });
      if (jsonOut()) { console.log(JSON.stringify(result)); return; }
      const icon = result.allowed ? c.boldGreen('\u2713 ALLOWED') : c.boldRed('\u2717 BLOCKED');
      console.log(`\n  ${icon}  ${c.bold(spdx)}`);
      console.log(`  Category: ${c.cyan(result.category)}`);
      console.log(`  ${c.dim(result.reason)}\n`);
      return;
    }

    if (sub === 'provenance') {
      const patterns = getProvenance(oracle, { source: args.source, license: args.license });
      if (jsonOut()) { console.log(JSON.stringify(patterns)); return; }
      if (patterns.length === 0) {
        console.log(c.yellow('\nNo imported patterns found') + (args.source ? ` from source: ${args.source}` : ''));
        return;
      }
      console.log(`\n${c.boldCyan('Pattern Provenance')} (${patterns.length} imported patterns)\n`);
      const grouped = {};
      for (const p of patterns) {
        if (!grouped[p.source]) grouped[p.source] = [];
        grouped[p.source].push(p);
      }
      for (const [source, pats] of Object.entries(grouped)) {
        const lic = pats[0].license;
        console.log(`  ${c.bold(source)} (${c.dim(lic)}) \u2014 ${pats.length} patterns`);
        for (const p of pats.slice(0, 10)) {
          console.log(`    ${c.cyan(p.name.padEnd(30))} ${c.blue(p.language.padEnd(12))} coherency: ${colorScore(p.coherency)}`);
        }
        if (pats.length > 10) console.log(c.dim(`    ... and ${pats.length - 10} more`));
      }
      return;
    }

    if (sub === 'duplicates') {
      console.log(c.dim('\nScanning for duplicates...'));
      const dupes = findDuplicates(oracle, {
        threshold: parseFloat(args.threshold) || 0.85,
        language: args.language,
      });
      if (jsonOut()) { console.log(JSON.stringify(dupes)); return; }
      if (dupes.length === 0) {
        console.log(c.boldGreen('\n  \u2713 No duplicates found\n'));
        return;
      }
      console.log(`\n${c.boldCyan('Duplicate Patterns')} (${dupes.length} pairs)\n`);
      for (const d of dupes.slice(0, 30)) {
        const simColor = d.similarity >= 0.95 ? c.red : c.yellow;
        const typeIcon = d.type === 'exact' ? c.red('EXACT') : c.yellow('NEAR');
        console.log(`  ${typeIcon}  ${simColor((d.similarity * 100).toFixed(0) + '%')}  ${c.bold(d.pattern1.name)} ${c.dim('\u2194')} ${c.bold(d.pattern2.name)}`);
      }
      if (dupes.length > 30) console.log(c.dim(`  ... and ${dupes.length - 30} more`));
      console.log(`\n${c.dim('Tip: use oracle deep-clean to remove duplicates')}`);
      return;
    }

    console.error(`${c.boldRed('Unknown registry subcommand:')} ${sub}. Run ${c.cyan('oracle registry help')} for usage.`);
    process.exit(1);
  };
}

module.exports = { registerAdminCommands };
