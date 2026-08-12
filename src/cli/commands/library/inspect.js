'use strict';

const { c, colorScore, colorSource } = require('../../colors');
const { validatePositiveInt } = require('../../validate-args');
const { quiet } = require('../../../core/quiet');
const { out, outErr } = require('./out');

/**
 * Library commands — inspect.
 * Look at what is already in the library — stats, search, diff, reliability.
 *
 * Commands: bug-report, reliability, patterns, search, smart-search, diff
 *
 * Registered onto the shared `handlers` map by the library façade
 * (../library.js). Printing goes through the ./out seam so the organ
 * itself holds zero console sites.
 */
function registerInspectCommands(handlers, deps) {
  const { oracle, jsonOut } = deps;

  handlers['bug-report'] = (args) => {
    const id = args.id || args._sub;
    if (!id) { outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle bug-report')} <pattern-id> [--description "..."]`); process.exit(1); }
    const result = oracle.patterns.reportBug(id, args.description || '');
    if (result.success) {
      out(`${c.boldRed('Bug reported:')} ${c.bold(result.patternName)} — now has ${result.bugReports} report(s)`);
    } else {
      out(`${c.red(result.reason)}`);
    }
  };

  handlers['reliability'] = (args) => {
    const id = args.id || args._sub;
    if (!id) { outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle reliability')} <pattern-id>`); process.exit(1); }
    const r = oracle.patterns.getReliability(id);
    if (!r) { out(c.red('Pattern not found')); return; }
    out(c.boldCyan(`Reliability: ${c.bold(r.patternName)}\n`));
    out(`  Usage:     ${r.successCount}/${r.usageCount} (${colorScore(r.usageReliability.toFixed(3))})`);
    out(`  Bugs:      ${r.bugReports > 0 ? c.red(String(r.bugReports)) : c.dim('0')} (penalty: ${colorScore(r.bugPenalty.toFixed(3))})`);
    out(`  Healing:   ${colorScore(r.healingRate.toFixed(3))}`);
    out(`  Combined:  ${colorScore(r.combined.toFixed(3))}`);
  };

  handlers['patterns'] = (args) => {
    // Subcommand: `oracle patterns delete <id> --reason "..."`
    // Archives + deletes a single pattern and fires `pattern.deleted`
    // on the event bus so reactions (indexes, analytics) stay in sync.
    const sub = args._sub;
    if (sub === 'delete') {
      const id = args.id || (args._positional && args._positional[1]);
      if (!id) {
        outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle patterns delete <id>')} [--reason "..."]`);
        process.exit(1);
      }
      const reason = args.reason || 'manual-delete';
      const store = oracle.store.getSQLiteStore?.() || oracle.store;
      if (typeof store.deletePatternById !== 'function') {
        outErr(c.boldRed('Error:') + ' Delete is only supported on the SQLite store.');
        process.exit(1);
      }
      const result = store.deletePatternById(id, { reason });
      if (jsonOut()) { out(JSON.stringify(result)); return; }
      if (result.deleted) {
        out(`${c.boldGreen('Deleted:')} ${c.bold(result.name || result.id)} ${c.dim('(' + result.reason + ')')}`);
        out(c.dim('  archived — restore with `oracle restore <name>`'));
      } else {
        out(`${c.yellow('Not deleted:')} ${result.reason}`);
      }
      return;
    }

    const stats = oracle.patternStats();
    out(c.boldCyan('Pattern Library:'));
    out(`  Total patterns: ${c.bold(String(stats.totalPatterns))}`);
    // Published to chain count
    let publishedCount = 0;
    try {
      const sqliteStore = oracle.store?.getSQLiteStore?.() || oracle.patterns?._sqlite;
      if (sqliteStore && sqliteStore.db) {
        const pub = sqliteStore.db.prepare('SELECT COUNT(*) as c FROM patterns WHERE blockchain_tx IS NOT NULL').get();
        publishedCount = pub ? pub.c : 0;
      }
    } catch (_) { quiet('cli:commands:library:jsonOut', _); /* non-fatal */ }
    out(`  Published to chain: ${c.bold(String(publishedCount))}`);
    out(`  Avg coherency: ${colorScore(stats.avgCoherency)}`);
    if (Object.keys(stats.byType).length > 0) {
      out(`  By type: ${Object.entries(stats.byType).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(stats.byLanguage).length > 0) {
      out(`  By language: ${Object.entries(stats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(stats.byComplexity).length > 0) {
      out(`  By complexity: ${Object.entries(stats.byComplexity).map(([k, v]) => `${c.cyan(k)}(${v})`).join(', ')}`);
    }
  };

  handlers['search'] = (args) => {
    const term = args.description || args._rest;
    if (!term) { outErr(c.boldRed('Error:') + ` provide a search term. Usage: ${c.cyan('oracle search <term>')}`); process.exit(1); }
    const mode = args.mode || 'hybrid';
    const results = oracle.search(term, {
      limit: validatePositiveInt(args.limit, 'limit', 10),
      language: args.language,
      mode,
    });
    // Emit a compliance signal so the session ledger records this
    // search. `--file <f>` associates the search with a target file;
    // otherwise we record the query term as the signal.
    try {
      const { getEventBus } = require('../../../core/events');
      getEventBus().emitSync('search', { file: args.file, term, mode });
    } catch (_e) { quiet('cli:commands:library:getEventBus', _e); /* ignore */ }
    if (jsonOut()) { out(JSON.stringify(results)); return; }
    if (results.length === 0) {
      out(c.yellow('No matches found.'));
    } else {
      const modeLabel = mode === 'semantic' ? c.magenta('[semantic]') : mode === 'hybrid' ? c.cyan('[hybrid]') : '';
      out(`Found ${c.bold(String(results.length))} match(es) for ${c.cyan('"' + term + '"')} ${modeLabel}:\n`);
      for (const r of results) {
        const label = r.name || r.description || 'untitled';
        const concepts = r.matchedConcepts?.length > 0 ? c.dim(` (${r.matchedConcepts.join(', ')})`) : '';
        out(`  [${colorSource(r.source)}] ${c.bold(label)}  (coherency: ${colorScore(r.coherency)}, match: ${colorScore(r.matchScore)})${concepts}`);
        out(`         ${c.blue(r.language)} | ${r.tags.map(t => c.magenta(t)).join(', ') || c.dim('no tags')} | ${c.dim(r.id)}`);
      }
    }
  };

  handlers['smart-search'] = (args) => {
    const term = args.description || args._rest;
    if (!term) { outErr(c.boldRed('Error:') + ` provide a search term. Usage: ${c.cyan('oracle smart-search <term>')}`); process.exit(1); }
    const result = oracle.smartSearch(term, {
      limit: validatePositiveInt(args.limit, 'limit', 10),
      language: args.language,
      mode: args.mode || 'hybrid',
    });
    if (jsonOut()) { out(JSON.stringify(result)); return; }

    if (result.corrections) {
      out(c.yellow(`Auto-corrected: "${term}" → "${result.corrections}"\n`));
    }
    if (result.intent.intents.length > 0) {
      out(c.dim(`Detected intents: ${result.intent.intents.map(i => c.magenta(i.name)).join(', ')}`));
    }
    if (result.intent.language) {
      out(c.dim(`Language: ${c.blue(result.intent.language)}`));
    }
    if (result.intent.constraints && Object.keys(result.intent.constraints).length > 0) {
      out(c.dim(`Constraints: ${Object.entries(result.intent.constraints).map(([k, v]) => `${k}=${v}`).join(', ')}`));
    }
    if (result.intent.intents.length > 0 || result.intent.language || result.corrections) out();

    if (result.results.length === 0) {
      out(c.yellow('No matches found.'));
      if (result.suggestions.length > 0) {
        out(c.dim('\nSuggestions:'));
        for (const s of result.suggestions) out(`  ${c.cyan('→')} ${s}`);
      }
    } else {
      out(`Found ${c.bold(String(result.results.length))} match(es) (${result.totalMatches} total before limit):\n`);
      for (const r of result.results) {
        const label = r.name || r.description || 'untitled';
        const boost = r.intentBoost > 0 ? c.green(` +${r.intentBoost}`) : '';
        const cross = r.crossLanguage ? c.yellow(' [cross-lang]') : '';
        out(`  ${c.bold(label)}  (match: ${colorScore(r.matchScore)}${boost})${cross}`);
        out(`         ${c.blue(r.language || '?')} | ${(r.tags || []).map(t => c.magenta(t)).join(', ') || c.dim('no tags')} | ${c.dim(r.id || '')}`);
      }
      if (result.suggestions.length > 0) {
        out(c.dim('\nSuggestions:'));
        for (const s of result.suggestions) out(`  ${c.cyan('→')} ${s}`);
      }
    }
  };

  handlers['diff'] = (args) => {
    const { colorDiff } = require('../../colors');
    const ids = args._positional;
    if (ids.length < 2) { outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle diff')} <id-a> <id-b>`); process.exit(1); }
    const result = oracle.diff(ids[0], ids[1]);
    if (result.error) { outErr(c.boldRed('Error:') + ' ' + result.error); process.exit(1); }
    out(`${c.red('---')} ${c.bold(result.a.name)} [${c.cyan(result.a.id)}]  coherency: ${colorScore(result.a.coherency)}`);
    out(`${c.green('+++')} ${c.bold(result.b.name)} [${c.cyan(result.b.id)}]  coherency: ${colorScore(result.b.coherency)}`);
    out('');
    for (const d of result.diff) {
      out(colorDiff(d.type, d.line));
    }
    out(`\n${c.green(String(result.stats.added) + ' added')}, ${c.red(String(result.stats.removed) + ' removed')}, ${c.dim(String(result.stats.same) + ' unchanged')}`);
  };
}


module.exports = { registerInspectCommands };
