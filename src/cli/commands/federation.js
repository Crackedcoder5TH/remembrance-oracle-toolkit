/**
 * Federation CLI commands: sync, share, community, global, repos, cross-search, nearest, dedup, remote, cloud
 */

const path = require('path');
const { c, colorScore, colorSource } = require('../colors');
const { validatePort } = require('../validate-args');

function registerFederationCommands(handlers, { oracle, jsonOut }) {

  handlers['sync'] = (args) => {
    const direction = process.argv[3] || 'both';
    const verbose = args.verbose === 'true' || args.verbose === true;
    const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
    const { PERSONAL_DIR } = require('../../core/persistence');

    console.log(c.boldCyan('Personal Sync') + c.dim(` — ${PERSONAL_DIR}\n`));

    if (direction === 'push' || direction === 'to') {
      const report = oracle.syncToGlobal({ verbose, dryRun });
      console.log(`Pushed to personal: ${c.boldGreen(String(report.synced))} patterns`);
      console.log(`  Duplicates:       ${c.dim(String(report.duplicates))}`);
      console.log(`  Skipped:          ${c.dim(String(report.skipped))}`);
    } else if (direction === 'pull' || direction === 'from') {
      const lang = args.language;
      const maxPull = parseInt(args['max-pull']) || Infinity;
      const report = oracle.syncFromGlobal({ verbose, dryRun, language: lang, maxPull });
      console.log(`Pulled from personal: ${c.boldGreen(String(report.pulled))} patterns`);
      console.log(`  Duplicates:         ${c.dim(String(report.duplicates))}`);
      console.log(`  Skipped:            ${c.dim(String(report.skipped))}`);
    } else {
      const report = oracle.sync({ verbose, dryRun });
      console.log(`${c.bold('Push')} (local → personal): ${c.boldGreen(String(report.push.synced))} synced, ${c.dim(String(report.push.duplicates))} duplicates`);
      console.log(`${c.bold('Pull')} (personal → local): ${c.boldGreen(String(report.pull.pulled))} pulled, ${c.dim(String(report.pull.duplicates))} duplicates`);
    }

    if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));

    const perStats = oracle.personalStats();
    const pStats = oracle.patternStats();
    console.log(`\nLocal:    ${c.bold(String(pStats.totalPatterns))} patterns`);
    console.log(`Personal: ${c.bold(String(perStats.totalPatterns || 0))} patterns ${c.dim('(private)')}`);
  };

  handlers['share'] = (args) => {
    const verbose = args.verbose === 'true' || args.verbose === true;
    const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
    const { COMMUNITY_DIR } = require('../../core/persistence');

    const nameFilter = process.argv.slice(3).filter(a => !a.startsWith('--'));
    const tagFilter = args.tags ? args.tags.split(',').map(t => t.trim()) : undefined;
    const minCoherency = parseFloat(args['min-coherency']) || 0.7;

    console.log(c.boldCyan('Share to Community') + c.dim(` — ${COMMUNITY_DIR}\n`));

    if (nameFilter.length > 0) {
      console.log(c.dim(`Sharing: ${nameFilter.join(', ')}\n`));
    } else {
      console.log(c.dim(`Sharing all patterns above coherency ${minCoherency} with tests\n`));
    }

    const report = oracle.share({
      verbose, dryRun, minCoherency,
      patterns: nameFilter.length > 0 ? nameFilter : undefined,
      tags: tagFilter,
    });

    console.log(`Shared to community: ${c.boldGreen(String(report.shared))} patterns`);
    console.log(`  Duplicates:        ${c.dim(String(report.duplicates))}`);
    console.log(`  Skipped:           ${c.dim(String(report.skipped))}`);

    if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));

    const comStats = oracle.communityStats();
    console.log(`\nCommunity: ${c.bold(String(comStats.totalPatterns || 0))} patterns ${c.dim('(shared)')}`);
  };

  handlers['community'] = (args) => {
    const sub = process.argv[3];
    const verbose = args.verbose === 'true' || args.verbose === true;
    const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;

    if (sub === 'pull') {
      const lang = args.language;
      const maxPull = parseInt(args['max-pull']) || Infinity;
      const nameFilter = process.argv.slice(4).filter(a => !a.startsWith('--'));
      const report = oracle.pullCommunity({
        verbose, dryRun, language: lang, maxPull,
        nameFilter: nameFilter.length > 0 ? nameFilter : undefined,
      });
      console.log(`Pulled from community: ${c.boldGreen(String(report.pulled))} patterns`);
      console.log(`  Duplicates:          ${c.dim(String(report.duplicates))}`);
      console.log(`  Skipped:             ${c.dim(String(report.skipped))}`);
      if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));
      return;
    }

    const comStats = oracle.communityStats();
    if (jsonOut()) { console.log(JSON.stringify(comStats)); return; }

    if (!comStats.available || comStats.totalPatterns === 0) {
      console.log(c.yellow('No community patterns yet. Use ') + c.cyan('oracle share') + c.yellow(' to contribute.'));
      return;
    }

    console.log(c.boldCyan('Community Store') + c.dim(` — ${comStats.path}\n`));
    console.log(`  Total patterns: ${c.bold(String(comStats.totalPatterns))}`);
    console.log(`  Avg coherency:  ${colorScore(comStats.avgCoherency)}`);
    if (Object.keys(comStats.byLanguage).length > 0) {
      console.log(`  By language:    ${Object.entries(comStats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(comStats.byType).length > 0) {
      console.log(`  By type:        ${Object.entries(comStats.byType).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
    }

    const federated = oracle.federatedSearch();
    const communityOnly = federated.communityOnly || 0;
    if (communityOnly > 0) {
      console.log(`\n  ${c.green(String(communityOnly))} community patterns not in local`);
      console.log(`  Run ${c.cyan('oracle community pull')} to import them`);
    }
  };

  handlers['global'] = (args) => {
    const stats = oracle.globalStats();
    if (jsonOut()) { console.log(JSON.stringify(stats)); return; }

    if (!stats.available) {
      console.log(c.yellow('No global stores found. Run ') + c.cyan('oracle sync push') + c.yellow(' to create your personal store.'));
      return;
    }

    console.log(c.boldCyan('Global Stores') + c.dim(` — ${stats.path}\n`));
    console.log(`  Total patterns: ${c.bold(String(stats.totalPatterns))}`);
    console.log(`  Avg coherency:  ${colorScore(stats.avgCoherency)}`);

    if (stats.personal && stats.personal.available) {
      console.log(`\n  ${c.bold('Personal')} ${c.dim('(private)')}: ${c.bold(String(stats.personal.totalPatterns))} patterns, avg ${colorScore(stats.personal.avgCoherency)}`);
    }
    if (stats.community && stats.community.available) {
      console.log(`  ${c.bold('Community')} ${c.dim('(shared)')}: ${c.bold(String(stats.community.totalPatterns))} patterns, avg ${colorScore(stats.community.avgCoherency)}`);
    }

    if (Object.keys(stats.byLanguage).length > 0) {
      console.log(`\n  By language:    ${Object.entries(stats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }

    const federated = oracle.federatedSearch();
    if (federated.globalOnly > 0) {
      console.log(`\n  ${c.green(String(federated.globalOnly))} patterns available from stores (not in local)`);
    }
  };

  handlers['repos'] = (args) => {
    const subCmd = process.argv[3];
    if (subCmd === 'add') {
      const repoPath = process.argv[4] || args.path;
      if (!repoPath) { console.error(`Usage: ${c.cyan('oracle repos add')} <path>`); process.exit(1); }
      const result = oracle.registerRepo(repoPath);
      console.log(`${c.boldGreen('Registered:')} ${c.bold(result.path)} (${result.totalRepos} total repos)`);
      return;
    }
    if (subCmd === 'discover') {
      const repos = oracle.discoverRepos();
      console.log(c.boldCyan(`Discovered ${repos.length} sibling oracle stores:\n`));
      for (const r of repos) {
        console.log(`  ${c.green('*')} ${c.bold(path.basename(r))} — ${c.dim(r)}`);
      }
      return;
    }
    const repos = oracle.listRepos();
    if (repos.length === 0) {
      console.log(c.dim('No repos configured. Use ') + c.cyan('oracle repos add <path>') + c.dim(' or ') + c.cyan('oracle repos discover'));
      return;
    }
    console.log(c.boldCyan(`Configured repos (${repos.length}):\n`));
    for (const r of repos) {
      const status = r.active ? c.green('active') : c.red('missing');
      console.log(`  ${r.active ? c.green('*') : c.red('x')} ${c.bold(r.name)} [${status}] — ${c.dim(r.path)}`);
    }
  };

  handlers['cross-search'] = (args) => {
    const desc = args.description || process.argv.slice(3).filter(a => !a.startsWith('--')).join(' ');
    if (!desc) { console.error(`Usage: ${c.cyan('oracle cross-search')} "<query>" [--language <lang>]`); process.exit(1); }
    const result = oracle.crossRepoSearch(desc, { language: args.language, limit: parseInt(args.limit) || 20 });
    console.log(c.boldCyan(`Cross-repo search for "${desc}" across ${result.totalSearched} repos:\n`));
    if (result.repos.length > 0) {
      console.log(c.dim('  Repos searched:'));
      for (const r of result.repos) {
        console.log(`    ${c.bold(r.name)} — ${r.patterns} patterns, ${c.green(String(r.matches))} matches`);
      }
      console.log('');
    }
    if (result.results.length === 0) {
      console.log(c.dim('  No matches found across repos.'));
    } else {
      for (const r of result.results) {
        const score = r.coherencyScore?.total ?? 0;
        console.log(`  [${c.blue(r._repo)}] ${c.bold(r.name)} (${r.language}) — coherency: ${colorScore(score.toFixed(3))}, match: ${colorScore(r._matchScore.toFixed(2))}`);
      }
    }
  };

  handlers['nearest'] = (args) => {
    const term = args.description || process.argv.slice(3).filter(a => !a.startsWith('--')).join(' ');
    if (!term) { console.error(c.boldRed('Error:') + ` provide a query. Usage: ${c.cyan('oracle nearest <term>')}`); process.exit(1); }
    const { nearestTerms } = require('../../core/vectors');
    const results = nearestTerms(term, parseInt(args.limit) || 10);
    console.log(`Nearest terms for ${c.cyan('"' + term + '"')}:\n`);
    for (const r of results) {
      const bar = '\u2588'.repeat(Math.round(r.similarity * 30));
      const faded = '\u2591'.repeat(30 - Math.round(r.similarity * 30));
      console.log(`  ${c.bold(r.term.padEnd(20))} ${c.green(bar)}${c.dim(faded)} ${colorScore(r.similarity.toFixed(3))}`);
    }
  };

  handlers['dedup'] = (args) => {
    console.log(c.boldCyan('Deduplicating pattern stores...\n'));
    const report = oracle.deduplicate();
    if (report.local) {
      console.log(`Local:     removed ${c.boldGreen(String(report.local.removed))} duplicates, kept ${c.bold(String(report.local.kept))} unique`);
    }
    if (report.personal) {
      console.log(`Personal:  removed ${c.boldGreen(String(report.personal.removed))} duplicates, kept ${c.bold(String(report.personal.kept))} unique`);
    }
    if (report.community) {
      console.log(`Community: removed ${c.boldGreen(String(report.community.removed))} duplicates, kept ${c.bold(String(report.community.kept))} unique`);
    }
    const total = (report.local?.removed || 0) + (report.personal?.removed || 0) + (report.community?.removed || 0);
    if (total === 0) {
      console.log(c.green('No duplicates found — all stores are clean.'));
    } else {
      console.log(`\nTotal: ${c.boldGreen(String(total))} duplicates removed`);
    }
  };

  handlers['remote'] = (args) => {
    const sub = process.argv[3];
    if (sub === 'add') {
      const url = process.argv[4] || args.url;
      if (!url) { console.error(`Usage: ${c.cyan('oracle remote add')} <url> [--name <name>] [--token <jwt>]`); process.exit(1); }
      const { registerRemote } = require('../../cloud/client');
      const result = registerRemote(url, { name: args.name, token: args.token });
      console.log(`${c.boldGreen('Remote registered:')} ${c.bold(result.name)} — ${c.cyan(result.url)}`);
      console.log(`  Total remotes: ${result.totalRemotes}`);
      return;
    }
    if (sub === 'remove') {
      const target = process.argv[4] || args.url || args.name;
      if (!target) { console.error(`Usage: ${c.cyan('oracle remote remove')} <url-or-name>`); process.exit(1); }
      const { removeRemote } = require('../../cloud/client');
      const result = removeRemote(target);
      if (result.removed) console.log(c.boldGreen('Remote removed.'));
      else console.log(c.red(result.error));
      return;
    }
    if (sub === 'health') {
      const { checkRemoteHealth } = require('../../cloud/client');
      checkRemoteHealth().then(results => {
        if (results.length === 0) { console.log(c.dim('No remotes configured.')); return; }
        console.log(c.boldCyan(`Remote Health Check (${results.length} remotes):\n`));
        for (const r of results) {
          const status = r.online ? c.boldGreen('ONLINE') : c.boldRed('OFFLINE');
          console.log(`  ${r.online ? c.green('*') : c.red('x')} ${c.bold(r.name)} [${status}] ${c.dim(r.url)} (${r.latencyMs}ms)`);
        }
      });
      return;
    }
    if (sub === 'search') {
      const desc = args.description || process.argv.slice(4).filter(a => !a.startsWith('--')).join(' ');
      if (!desc) { console.error(`Usage: ${c.cyan('oracle remote search')} "<query>" [--language <lang>]`); process.exit(1); }
      oracle.remoteSearch(desc, { language: args.language, limit: parseInt(args.limit) || 20 }).then(result => {
        console.log(c.boldCyan(`Remote federated search: "${desc}"\n`));
        if (result.remotes.length > 0) {
          for (const r of result.remotes) {
            const status = r.error ? c.red(`error: ${r.error}`) : c.green(`${r.count} results`);
            console.log(`  ${c.bold(r.name)} — ${status}`);
          }
          console.log('');
        }
        if (result.results.length === 0) {
          console.log(c.dim('  No remote matches found.'));
        } else {
          for (const p of result.results) {
            console.log(`  [${c.blue(p._remote || 'remote')}] ${c.bold(p.name)} (${p.language}) — coherency: ${colorScore((p.coherency || 0).toFixed(3))}`);
          }
        }
      });
      return;
    }
    const { listRemotes } = require('../../cloud/client');
    const remotes = listRemotes();
    if (remotes.length === 0) {
      console.log(c.dim('No remotes configured. Use ') + c.cyan('oracle remote add <url>'));
      return;
    }
    console.log(c.boldCyan(`Remote Oracle Servers (${remotes.length}):\n`));
    for (const r of remotes) {
      console.log(`  ${c.bold(r.name)} — ${c.cyan(r.url)} ${r.token ? c.dim('(authenticated)') : c.dim('(no token)')}`);
    }
  };

  handlers['cloud'] = (args) => {
    const { CloudSyncServer } = require('../../cloud/server');
    const sub = process.argv[3];
    if (sub === 'start' || sub === 'serve') {
      const port = validatePort(args.port, 3579);
      const host = args.host || '0.0.0.0';
      const server = new CloudSyncServer({ oracle, port, secret: args.secret, rateLimit: parseInt(args.rateLimit) || 120 });
      server.start().then((p) => {
        console.log(`\n${c.boldGreen('Oracle Cloud Server')} running on ${c.cyan('http://' + host + ':' + p)}\n`);
        console.log(`  ${c.bold('API Endpoints:')}`);
        console.log(`    ${c.cyan('GET  /api/health')}       — Server health + pattern count`);
        console.log(`    ${c.cyan('POST /api/auth/login')}   — Authenticate (get JWT token)`);
        console.log(`    ${c.cyan('POST /api/auth/register')} — Create account`);
        console.log(`    ${c.cyan('GET  /api/patterns')}     — Browse patterns (paginated)`);
        console.log(`    ${c.cyan('POST /api/search')}       — Search patterns`);
        console.log(`    ${c.cyan('POST /api/resolve')}      — Resolve (PULL/EVOLVE/GENERATE)`);
        console.log(`    ${c.cyan('POST /api/submit')}       — Submit proven code`);
        console.log(`    ${c.cyan('POST /api/feedback')}     — Report usage success/failure`);
        console.log(`    ${c.cyan('POST /api/vote')}         — Vote on pattern quality`);
        console.log(`    ${c.cyan('GET  /api/reputation')}   — Voter reputation`);
        console.log(`    ${c.cyan('GET  /api/stats')}        — Store statistics`);
        console.log(`    ${c.cyan('GET  /api/context')}      — AI context injection`);
        console.log(`    ${c.cyan('POST /api/sync/push')}    — Push patterns to this server`);
        console.log(`    ${c.cyan('POST /api/sync/pull')}    — Pull patterns from this server`);
        console.log(`    ${c.cyan('POST /api/reflect')}      — reflection loop`);
        console.log(`    ${c.cyan('POST /api/covenant')}     — Covenant check`);
        console.log(`    ${c.cyan('GET  /api/analytics')}    — Analytics report`);
        console.log(`    ${c.cyan('WS   /ws')}               — Real-time sync channel`);
        console.log(`\n  ${c.dim('Other clients can connect with:')} ${c.cyan('oracle remote add http://<ip>:' + p)}`);
      });
      return;
    }
    if (sub === 'status') {
      const { checkRemoteHealth } = require('../../cloud/client');
      console.log(`${c.bold('Cloud Server Status')}\n`);
      checkRemoteHealth().then((results) => {
        if (results.length === 0) {
          console.log(`  ${c.dim('No remote servers configured.')}`);
          console.log(`  ${c.dim('Add one with:')} ${c.cyan('oracle remote add <url>')}`);
          return;
        }
        for (const r of results) {
          const status = r.online ? c.boldGreen('ONLINE') : c.red('OFFLINE');
          console.log(`  ${status} ${c.bold(r.name)} (${c.dim(r.url)})`);
          if (r.online) {
            console.log(`    Patterns: ${r.patterns || '?'} | Latency: ${r.latencyMs}ms`);
          }
        }
      });
      return;
    }
    console.log(`${c.bold('Oracle Cloud Server')}\n`);
    console.log(`  ${c.cyan('oracle cloud start')} [--port 3579] [--host 0.0.0.0] [--secret <key>]`);
    console.log(`    ${c.dim('Start the cloud server for remote federation')}`);
    console.log(`  ${c.cyan('oracle cloud status')}`);
    console.log(`    ${c.dim('Check health of all configured remote servers')}`);
  };
}

module.exports = { registerFederationCommands };
