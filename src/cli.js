#!/usr/bin/env node

/**
 * CLI for the Remembrance Oracle.
 *
 * Usage:
 *   remembrance-oracle submit --file code.js --test test.js --tags "sort,algorithm"
 *   remembrance-oracle query --description "sorting function" --language javascript
 *   remembrance-oracle validate --file code.js
 *   remembrance-oracle stats
 *   remembrance-oracle inspect --id <id>
 *   remembrance-oracle feedback --id <id> --success
 *   remembrance-oracle prune --min-coherency 0.5
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');
const { RemembranceOracle } = require('./api/oracle');
const { c, colorScore, colorDecision, colorStatus, colorDiff, colorSource } = require('./cli/colors');

const oracle = new RemembranceOracle();

function parseArgs(args) {
  const parsed = { _command: args[0] };
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      parsed[key] = val;
      if (val !== true) i++;
    }
  }
  return parsed;
}

/**
 * Read all data from stdin (for pipe support).
 * Returns empty string if stdin is a TTY (interactive terminal).
 */
function readStdin() {
  if (process.stdin.isTTY) return '';
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch {
    return '';
  }
}

/**
 * Get code from --file flag or stdin pipe.
 * Pipe takes precedence when no --file is given.
 */
function getCode(args) {
  if (args.file) return fs.readFileSync(path.resolve(args.file), 'utf-8');
  const stdin = readStdin();
  if (stdin.trim()) return stdin;
  return null;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._command;
  const jsonOut = args.json === true;

  if (!cmd || cmd === 'help') {
    console.log(`
${c.boldCyan('Remembrance Oracle Toolkit')}

${c.bold('Commands:')}
  ${c.cyan('submit')}     Submit code for validation and storage
  ${c.cyan('query')}      Query for relevant, proven code
  ${c.cyan('resolve')}    Smart retrieval — pull, evolve, or generate decision
  ${c.cyan('validate')}   Validate code without storing
  ${c.cyan('stats')}      Show store statistics
  ${c.cyan('inspect')}    Inspect a stored entry
  ${c.cyan('feedback')}   Report if pulled code worked
  ${c.cyan('prune')}      Remove low-coherency entries
  ${c.cyan('deep-clean')} Remove duplicates, stubs, and trivial harvested patterns
  ${c.cyan('diff')}       Compare two entries or patterns side by side
  ${c.cyan('export')}     Export top patterns as standalone JSON or markdown
  ${c.cyan('search')}        Fuzzy search across patterns and history
  ${c.cyan('smart-search')}  Intent-aware search with typo correction + ranking
  ${c.cyan('register')}      Register code as a named pattern in the library
  ${c.cyan('patterns')}   Show pattern library statistics
  ${c.cyan('seed')}       Seed the library with built-in proven patterns
  ${c.cyan('ci-feedback')} Report CI test results back to tracked patterns
  ${c.cyan('ci-stats')}    Show CI feedback tracking statistics
  ${c.cyan('audit')}       View append-only audit log of all mutations
  ${c.cyan('nearest')}     Find nearest semantic vocabulary terms
  ${c.cyan('compose')}     Create a composed pattern from existing components
  ${c.cyan('deps')}        Show dependency tree for a pattern
  ${c.cyan('mcp')}         Start MCP server (JSON-RPC over stdin/stdout)
  ${c.cyan('dashboard')}   Start web dashboard (default port 3333)
  ${c.cyan('versions')}    Show version history for a pattern
  ${c.cyan('sdiff')}       Semantic diff between two patterns
  ${c.cyan('users')}       Manage users (list, add, delete)
  ${c.cyan('auto-seed')}   Auto-discover and seed patterns from test suite
  ${c.cyan('analytics')}   Show pattern analytics and library health report
  ${c.cyan('deploy')}      Start production-ready server (configurable via env vars)
  ${c.cyan('covenant')}    Check code against the Covenant seal (The Kingdom's Weave)
  ${c.cyan('reflect')}     SERF reflection loop — iteratively heal and refine code
  ${c.cyan('import')}      Import patterns from an exported JSON file
  ${c.cyan('harvest')}     Bulk harvest patterns from a Git repo or local directory
  ${c.cyan('recycle')}     Recycle failures and generate variants (exponential growth)
  ${c.cyan('candidates')} List candidate patterns (coherent but unproven)
  ${c.cyan('generate')}   Generate candidates from proven patterns (continuous growth)
  ${c.cyan('promote')}    Promote a candidate to proven with test proof
  ${c.cyan('synthesize')} Synthesize tests for candidates and auto-promote
  ${c.cyan('sync')}       Sync patterns with personal store (~/.remembrance/personal/)
  ${c.cyan('share')}      Share patterns to community store (explicit, test-backed only)
  ${c.cyan('community')}  Browse/pull community patterns or show stats
  ${c.cyan('global')}     Show combined global store statistics (personal + community)
  ${c.cyan('hooks')}       Install/uninstall git hooks (pre-commit covenant, post-commit seed)
  ${c.cyan('debug')}      Debug oracle — capture/search/grow error→fix patterns exponentially
  ${c.cyan('llm')}        Claude LLM engine — transpile/test/refine/analyze/explain

${c.bold('Options:')}
  ${c.yellow('--file')} <path>          Code file to submit/validate/register
  ${c.yellow('--test')} <path>          Test file for validation
  ${c.yellow('--name')} <name>          Pattern name (for register)
  ${c.yellow('--description')} <text>   Description for query/submit/resolve
  ${c.yellow('--tags')} <comma,list>    Tags for query/submit/resolve
  ${c.yellow('--language')} <lang>      Language filter
  ${c.yellow('--id')} <id>              Entry ID for inspect/feedback
  ${c.yellow('--success')}              Mark feedback as successful
  ${c.yellow('--failure')}              Mark feedback as failed
  ${c.yellow('--min-coherency')} <n>    Minimum coherency threshold
  ${c.yellow('--limit')} <n>            Max results for query
  ${c.yellow('--json')}                 Output as JSON (pipe-friendly)
  ${c.yellow('--no-color')}             Disable colored output
  ${c.yellow('--mode')} <hybrid|semantic> Search mode (default: hybrid)
  ${c.yellow('--status')} <pass|fail>    CI test result for ci-feedback

${c.bold('Pipe support:')}
  ${c.dim('cat code.js | oracle submit --language javascript')}
  ${c.dim('cat code.js | oracle validate --json')}
  ${c.dim('cat code.js | oracle reflect | oracle submit')}
  ${c.dim('cat code.js | oracle covenant --json')}
    `);
    return;
  }

  if (cmd === 'submit') {
    const code = getCode(args);
    if (!code) { console.error(c.boldRed('Error:') + ' --file required or pipe code via stdin'); process.exit(1); }
    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const result = oracle.submit(code, {
      description: args.description || '',
      tags,
      language: args.language,
      testCode,
      author: args.author || process.env.USER || 'cli-user',
    });
    if (jsonOut) { console.log(JSON.stringify(result)); return; }
    if (result.accepted) {
      console.log(`${colorStatus(true)}! ID: ${c.cyan(result.entry.id)}`);
      console.log(`Coherency: ${colorScore(result.entry.coherencyScore.total)}`);
      const breakdown = result.entry.coherencyScore.breakdown;
      console.log(`Breakdown:`);
      for (const [key, val] of Object.entries(breakdown)) {
        console.log(`  ${c.dim(key + ':')} ${colorScore(val)}`);
      }
    } else {
      console.log(`${colorStatus(false)}: ${c.red(result.reason)}`);
      console.log(`Score: ${colorScore(result.validation.coherencyScore?.total)}`);
    }
    return;
  }

  if (cmd === 'query') {
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const results = oracle.query({
      description: args.description || '',
      tags,
      language: args.language,
      limit: parseInt(args.limit) || 5,
      minCoherency: parseFloat(args['min-coherency']) || 0.5,
    });
    if (jsonOut) { console.log(JSON.stringify(results)); return; }
    if (results.length === 0) {
      console.log(c.yellow('No matching entries found.'));
    } else {
      console.log(`Found ${c.bold(String(results.length))} result(s):\n`);
      for (const r of results) {
        console.log(`${c.dim('---')} [${c.cyan(r.id)}] (coherency: ${colorScore(r.coherencyScore)}, relevance: ${colorScore(r.relevanceScore)}) ${c.dim('---')}`);
        console.log(`Language: ${c.blue(r.language)} | Tags: ${r.tags.map(t => c.magenta(t)).join(', ') || c.dim('none')}`);
        console.log(`Description: ${r.description || c.dim('none')}`);
        console.log(r.code);
        console.log('');
      }
    }
    return;
  }

  if (cmd === 'validate') {
    const code = getCode(args);
    if (!code) { console.error(c.boldRed('Error:') + ' --file required or pipe code via stdin'); process.exit(1); }
    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const { validateCode } = require('./core/validator');
    const result = validateCode(code, { language: args.language, testCode });
    if (jsonOut) { console.log(JSON.stringify(result)); return; }
    console.log(`Valid: ${result.valid ? c.boldGreen('true') : c.boldRed('false')}`);
    console.log(`Coherency: ${colorScore(result.coherencyScore.total)}`);
    console.log(`Breakdown:`);
    for (const [key, val] of Object.entries(result.coherencyScore.breakdown)) {
      console.log(`  ${c.dim(key + ':')} ${colorScore(val)}`);
    }
    if (result.errors.length > 0) {
      console.log(`${c.boldRed('Errors:')}`);
      for (const err of result.errors) {
        console.log(`  ${c.red('•')} ${err}`);
      }
    }
    return;
  }

  if (cmd === 'stats') {
    const stats = oracle.stats();
    console.log(c.boldCyan('Remembrance Oracle Stats:'));
    console.log(`  Total entries: ${c.bold(String(stats.totalEntries))}`);
    console.log(`  Languages: ${stats.languages.map(l => c.blue(l)).join(', ') || c.dim('none')}`);
    console.log(`  Avg coherency: ${colorScore(stats.avgCoherency)}`);
    if (stats.topTags.length > 0) {
      console.log(`  Top tags: ${stats.topTags.map(t => `${c.magenta(t.tag)}(${t.count})`).join(', ')}`);
    }
    return;
  }

  if (cmd === 'inspect') {
    if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
    const entry = oracle.inspect(args.id);
    if (!entry) { console.log(c.yellow('Entry not found.')); return; }
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  if (cmd === 'feedback') {
    if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
    const succeeded = args.success === true || args.success === 'true';
    const result = oracle.feedback(args.id, succeeded);
    if (result.success) {
      console.log(`Updated reliability: ${colorScore(result.newReliability)}`);
    } else {
      console.log(c.red(result.error));
    }
    return;
  }

  if (cmd === 'prune') {
    const min = parseFloat(args['min-coherency']) || 0.4;
    const result = oracle.prune(min);
    console.log(`Pruned ${c.boldRed(String(result.removed))} entries. ${c.boldGreen(String(result.remaining))} remaining.`);
    return;
  }

  if (cmd === 'deep-clean' || cmd === 'deepclean') {
    const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
    const result = oracle.deepClean({
      minCodeLength: parseInt(args['min-code-length']) || 35,
      minNameLength: parseInt(args['min-name-length']) || 3,
      dryRun,
    });
    console.log(`${dryRun ? c.yellow('DRY RUN — ') : ''}Deep Clean Results:`);
    console.log(`  Duplicates removed: ${c.boldRed(String(result.duplicates))}`);
    console.log(`  Stubs removed:      ${c.boldRed(String(result.stubs))}`);
    console.log(`  Too short removed:  ${c.boldRed(String(result.tooShort))}`);
    console.log(`  ${c.bold('Total removed:')}     ${c.boldRed(String(result.removed))}`);
    console.log(`  ${c.bold('Remaining:')}         ${c.boldGreen(String(result.remaining))}`);
    if (dryRun && result.details.length > 0) {
      console.log(`\nPreview (first 20):`);
      result.details.slice(0, 20).forEach(d =>
        console.log(`  [${d.reason}] ${d.name}: ${d.code}`)
      );
    }
    return;
  }

  if (cmd === 'resolve') {
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const result = oracle.resolve({
      description: args.description || '',
      tags,
      language: args.language,
      minCoherency: parseFloat(args['min-coherency']) || undefined,
    });
    console.log(`Decision: ${colorDecision(result.decision)}`);
    console.log(`Confidence: ${colorScore(result.confidence)}`);
    console.log(`Reasoning: ${c.dim(result.reasoning)}`);
    if (result.pattern) {
      console.log(`\nPattern: ${c.bold(result.pattern.name)} [${c.cyan(result.pattern.id)}]`);
      console.log(`Language: ${c.blue(result.pattern.language)} | Type: ${c.magenta(result.pattern.patternType)} | Coherency: ${colorScore(result.pattern.coherencyScore)}`);
      console.log(`Tags: ${(result.pattern.tags || []).map(t => c.magenta(t)).join(', ')}`);
      console.log(`\n${result.pattern.code}`);
    }
    if (result.alternatives?.length > 0) {
      console.log(`\n${c.dim('Alternatives:')} ${result.alternatives.map(a => `${c.cyan(a.name)}(${colorScore(a.composite?.toFixed(3))})`).join(', ')}`);
    }
    return;
  }

  if (cmd === 'register') {
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
    return;
  }

  if (cmd === 'patterns') {
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
    return;
  }

  if (cmd === 'diff') {
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
    return;
  }

  if (cmd === 'export') {
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
    return;
  }

  if (cmd === 'search') {
    const term = args.description || args._rest || process.argv.slice(3).filter(a => !a.startsWith('--')).join(' ');
    if (!term) { console.error(c.boldRed('Error:') + ` provide a search term. Usage: ${c.cyan('oracle search <term>')}`); process.exit(1); }
    const mode = args.mode || 'hybrid';
    const results = oracle.search(term, {
      limit: parseInt(args.limit) || 10,
      language: args.language,
      mode,
    });
    if (jsonOut) { console.log(JSON.stringify(results)); return; }
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
    return;
  }

  if (cmd === 'smart-search') {
    const term = args.description || args._rest || process.argv.slice(3).filter(a => !a.startsWith('--')).join(' ');
    if (!term) { console.error(c.boldRed('Error:') + ` provide a search term. Usage: ${c.cyan('oracle smart-search <term>')}`); process.exit(1); }
    const result = oracle.smartSearch(term, {
      limit: parseInt(args.limit) || 10,
      language: args.language,
      mode: args.mode || 'hybrid',
    });
    if (jsonOut) { console.log(JSON.stringify(result)); return; }

    // Show corrections/intent info
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
    return;
  }

  if (cmd === 'ci-feedback') {
    const { CIFeedbackReporter } = require('./ci/feedback');
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
        console.log(`  ${c.cyan(u.id)} ${u.name ? c.bold(u.name) : ''} → reliability: ${colorScore(u.newReliability)}`);
      }
    }
    if (result.errors.length > 0) {
      console.log(`${c.boldRed('Errors:')} ${result.errors.map(e => `${e.id}: ${e.error}`).join(', ')}`);
    }
    return;
  }

  if (cmd === 'ci-stats') {
    const { CIFeedbackReporter } = require('./ci/feedback');
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
        console.log(`  ${c.dim(fb.timestamp)} ${statusColor(fb.status)} — ${fb.patternsReported} pattern(s) ${fb.commitSha ? c.dim(fb.commitSha.slice(0, 8)) : ''}`);
      }
    }
    return;
  }

  if (cmd === 'ci-track') {
    const { CIFeedbackReporter } = require('./ci/feedback');
    const reporter = new CIFeedbackReporter(oracle);
    if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
    const record = reporter.trackPull({ id: args.id, name: args.name || null, source: args.source || 'manual' });
    console.log(`${c.boldGreen('Tracking:')} ${c.cyan(record.id)} ${record.name ? c.bold(record.name) : ''}`);
    return;
  }

  if (cmd === 'audit') {
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
    return;
  }

  if (cmd === 'seed') {
    const { seedLibrary } = require('./patterns/seeds');
    const results = seedLibrary(oracle);
    console.log(`Core seeds: ${c.boldGreen(String(results.registered))} registered (${c.dim(results.skipped + ' skipped')}, ${results.failed > 0 ? c.boldRed(String(results.failed)) : c.dim(String(results.failed))} failed)`);

    const { seedExtendedLibrary } = require('./patterns/seeds-extended');
    const ext = seedExtendedLibrary(oracle, { verbose: !!args.verbose });
    console.log(`Extended seeds: ${c.boldGreen(String(ext.registered))} registered (${c.dim(ext.skipped + ' skipped')}, ${ext.failed > 0 ? c.boldRed(String(ext.failed)) : c.dim(String(ext.failed))} failed)`);

    const total = results.registered + ext.registered;
    console.log(`\nTotal seeded: ${c.boldGreen(String(total))} patterns`);
    console.log(`Library now has ${c.bold(String(oracle.patternStats().totalPatterns))} patterns`);
    return;
  }

  if (cmd === 'recycle') {
    const { PatternRecycler } = require('./core/recycler');
    const { SEEDS } = require('./patterns/seeds');
    const { EXTENDED_SEEDS } = require('./patterns/seeds-extended');

    const depth = parseInt(args.depth) || 2;
    const allSeeds = [...SEEDS, ...EXTENDED_SEEDS];

    console.log(c.boldCyan('Pattern Recycler') + ' — exponential growth engine\n');
    console.log(`Processing ${c.bold(String(allSeeds.length))} seeds at depth ${c.bold(String(depth))}...\n`);

    // Create recycler with verbose output
    oracle.recycler.verbose = true;
    oracle.recycler.generateVariants = true;
    oracle.recycler.variantLanguages = (args.languages || 'python,typescript').split(',').map(s => s.trim());

    const report = oracle.processSeeds(allSeeds, { depth });

    console.log('\n' + c.boldCyan('─'.repeat(50)));
    console.log(PatternRecycler.formatReport(report));
    console.log(c.boldCyan('─'.repeat(50)));
    return;
  }

  if (cmd === 'candidates') {
    const filters = {};
    if (args.language) filters.language = args.language;
    if (args['min-coherency']) filters.minCoherency = parseFloat(args['min-coherency']);
    if (args.method) filters.generationMethod = args.method;

    const candidates = oracle.candidates(filters);
    const stats = oracle.candidateStats();

    if (jsonOut) { console.log(JSON.stringify({ stats, candidates })); return; }

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
    return;
  }

  if (cmd === 'generate') {
    const languages = (args.languages || 'python,typescript').split(',').map(s => s.trim());
    const methods = (args.methods || 'variant,serf-refine,approach-swap').split(',').map(s => s.trim());
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

    // Show total stats
    const cStats = oracle.candidateStats();
    const pStats = oracle.patternStats();
    console.log(`\nLibrary:      ${c.bold(String(pStats.totalPatterns))} proven + ${c.bold(String(cStats.totalCandidates))} candidates`);
    console.log(c.boldCyan('─'.repeat(50)));

    // Auto-promote candidates that already have test code
    const promo = oracle.autoPromote();
    if (promo.promoted > 0) {
      console.log(`\n${c.boldGreen('Auto-promoted:')} ${promo.promoted} candidate(s) → proven`);
      for (const d of promo.details.filter(d => d.status === 'promoted')) {
        console.log(`  ${c.green('+')} ${c.bold(d.name)} coherency: ${colorScore(d.coherency)}`);
      }
    }
    return;
  }

  if (cmd === 'promote') {
    const id = args.id || process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle promote')} <candidate-id> [--test <test-file>]`); process.exit(1); }

    // If --auto flag, run auto-promote on all candidates with tests
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

    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const result = oracle.promote(id, testCode);

    if (result.promoted) {
      console.log(`${c.boldGreen('Promoted:')} ${c.bold(result.pattern.name)} → proven`);
      console.log(`  Coherency: ${colorScore(result.coherency)}`);
      console.log(`  ID: ${c.cyan(result.pattern.id)}`);
    } else {
      console.log(`${c.boldRed('Failed:')} ${result.reason}`);
    }
    return;
  }

  if (cmd === 'synthesize' || cmd === 'synth') {
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

    // Final stats
    const cStats = oracle.candidateStats();
    const pStats = oracle.patternStats();
    console.log(`\nLibrary: ${c.bold(String(pStats.totalPatterns))} proven + ${c.bold(String(cStats.totalCandidates))} candidates`);
    return;
  }

  if (cmd === 'sync') {
    const direction = process.argv[3] || 'both';
    const verbose = args.verbose === 'true' || args.verbose === true;
    const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
    const { PERSONAL_DIR } = require('./core/persistence');

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
    return;
  }

  if (cmd === 'share') {
    const verbose = args.verbose === 'true' || args.verbose === true;
    const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
    const { COMMUNITY_DIR } = require('./core/persistence');

    // Collect pattern names from positional args
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
    return;
  }

  if (cmd === 'community') {
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

    // Default: show community stats
    const comStats = oracle.communityStats();

    if (jsonOut) { console.log(JSON.stringify(comStats)); return; }

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

    // Show how many are not in local
    const federated = oracle.federatedSearch();
    const communityOnly = federated.communityOnly || 0;
    if (communityOnly > 0) {
      console.log(`\n  ${c.green(String(communityOnly))} community patterns not in local`);
      console.log(`  Run ${c.cyan('oracle community pull')} to import them`);
    }
    return;
  }

  if (cmd === 'global') {
    const stats = oracle.globalStats();

    if (jsonOut) { console.log(JSON.stringify(stats)); return; }

    if (!stats.available) {
      console.log(c.yellow('No global stores found. Run ') + c.cyan('oracle sync push') + c.yellow(' to create your personal store.'));
      return;
    }

    console.log(c.boldCyan('Global Stores') + c.dim(` — ${stats.path}\n`));
    console.log(`  Total patterns: ${c.bold(String(stats.totalPatterns))}`);
    console.log(`  Avg coherency:  ${colorScore(stats.avgCoherency)}`);

    // Personal breakdown
    if (stats.personal && stats.personal.available) {
      console.log(`\n  ${c.bold('Personal')} ${c.dim('(private)')}: ${c.bold(String(stats.personal.totalPatterns))} patterns, avg ${colorScore(stats.personal.avgCoherency)}`);
    }

    // Community breakdown
    if (stats.community && stats.community.available) {
      console.log(`  ${c.bold('Community')} ${c.dim('(shared)')}: ${c.bold(String(stats.community.totalPatterns))} patterns, avg ${colorScore(stats.community.avgCoherency)}`);
    }

    if (Object.keys(stats.byLanguage).length > 0) {
      console.log(`\n  By language:    ${Object.entries(stats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }

    // Show federated view
    const federated = oracle.federatedSearch();
    if (federated.globalOnly > 0) {
      console.log(`\n  ${c.green(String(federated.globalOnly))} patterns available from stores (not in local)`);
    }
    return;
  }

  if (cmd === 'nearest') {
    const term = args.description || process.argv.slice(3).filter(a => !a.startsWith('--')).join(' ');
    if (!term) { console.error(c.boldRed('Error:') + ` provide a query. Usage: ${c.cyan('oracle nearest <term>')}`); process.exit(1); }
    const { nearestTerms } = require('./core/vectors');
    const results = nearestTerms(term, parseInt(args.limit) || 10);
    console.log(`Nearest terms for ${c.cyan('"' + term + '"')}:\n`);
    for (const r of results) {
      const bar = '█'.repeat(Math.round(r.similarity * 30));
      const faded = '░'.repeat(30 - Math.round(r.similarity * 30));
      console.log(`  ${c.bold(r.term.padEnd(20))} ${c.green(bar)}${c.dim(faded)} ${colorScore(r.similarity.toFixed(3))}`);
    }
    return;
  }

  if (cmd === 'compose') {
    const components = process.argv.slice(3).filter(a => !a.startsWith('--'));
    if (components.length < 2) { console.error(`Usage: ${c.cyan('oracle compose')} <component1> <component2> [--name <name>]`); process.exit(1); }
    const result = oracle.patterns.compose({
      name: args.name || `composed-${Date.now()}`,
      components,
      description: args.description,
    });
    if (result.composed) {
      console.log(`${c.boldGreen('Composed:')} ${c.bold(result.pattern.name)} [${c.cyan(result.pattern.id)}]`);
      console.log(`Components: ${result.components.map(p => c.cyan(p.name)).join(' + ')}`);
      console.log(`Coherency: ${colorScore(result.pattern.coherencyScore.total)}`);
    } else {
      console.log(`${c.boldRed('Failed:')} ${result.reason}`);
    }
    return;
  }

  if (cmd === 'deps') {
    const id = process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle deps')} <pattern-id>`); process.exit(1); }
    const deps = oracle.patterns.resolveDependencies(id);
    if (deps.length === 0) {
      console.log(c.yellow('Pattern not found or has no dependencies.'));
    } else {
      console.log(`Dependency tree for ${c.cyan(id)}:\n`);
      for (let i = 0; i < deps.length; i++) {
        const prefix = i === deps.length - 1 ? '└── ' : '├── ';
        console.log(`  ${c.dim(prefix)}${c.bold(deps[i].name)} [${c.cyan(deps[i].id)}]`);
      }
    }
    return;
  }

  if (cmd === 'mcp') {
    const { startMCPServer } = require('./mcp/server');
    startMCPServer(oracle);
    return;
  }

  if (cmd === 'dashboard') {
    const { startDashboard } = require('./dashboard/server');
    const port = parseInt(args.port) || 3333;
    startDashboard(oracle, { port });
    return;
  }

  if (cmd === 'analytics') {
    const { generateAnalytics, computeTagCloud } = require('./core/analytics');
    const analytics = generateAnalytics(oracle);
    analytics.tagCloud = computeTagCloud(oracle.patterns.getAll());
    if (jsonOut) { console.log(JSON.stringify(analytics)); return; }
    const ov = analytics.overview;
    console.log(c.boldCyan('Pattern Analytics\n'));
    console.log(`  Patterns:      ${c.bold(String(ov.totalPatterns))}`);
    console.log(`  Entries:       ${c.bold(String(ov.totalEntries))}`);
    console.log(`  Avg Coherency: ${colorScore(ov.avgCoherency)}`);
    console.log(`  Quality:       ${c.bold(ov.qualityRatio + '%')} high-quality (>= 0.7)`);
    console.log(`  Languages:     ${ov.languageList.map(l => c.blue(l)).join(', ') || c.dim('none')}`);
    console.log(`  With Tests:    ${c.bold(String(ov.withTests))}`);
    const h = analytics.healthReport;
    console.log(`\n${c.bold('Health:')}`);
    console.log(`  ${c.green('Healthy:')} ${h.healthy}  ${c.yellow('Warning:')} ${h.warning}  ${c.red('Critical:')} ${h.critical}`);
    if (h.criticalPatterns.length > 0) {
      for (const p of h.criticalPatterns.slice(0, 5)) {
        console.log(`    ${c.red('!')} ${c.bold(p.name)} — coherency: ${colorScore(p.coherency)}`);
      }
    }
    console.log(`\n${c.bold('Coherency Distribution:')}`);
    const dist = analytics.coherencyDistribution;
    const maxB = Math.max(...Object.values(dist), 1);
    for (const [range, count] of Object.entries(dist)) {
      const bar = '\u2588'.repeat(Math.round(count / maxB * 25));
      const faded = '\u2591'.repeat(25 - Math.round(count / maxB * 25));
      console.log(`  ${c.dim(range.padEnd(8))} ${c.green(bar)}${c.dim(faded)} ${c.bold(String(count))}`);
    }
    if (analytics.tagCloud.length > 0) {
      console.log(`\n${c.bold('Top Tags:')} ${analytics.tagCloud.slice(0, 15).map(t => `${c.magenta(t.tag)}(${t.count})`).join(', ')}`);
    }
    return;
  }

  if (cmd === 'deploy') {
    const { start } = require('./deploy');
    start();
    return;
  }

  if (cmd === 'versions') {
    const id = args.id || process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle versions')} <pattern-id>`); process.exit(1); }
    try {
      const { VersionManager } = require('./core/versioning');
      const sqliteStore = oracle.store.getSQLiteStore();
      const vm = new VersionManager(sqliteStore);
      const history = vm.getHistory(id);
      if (history.length === 0) {
        console.log(c.yellow('No version history found for this pattern.'));
      } else {
        console.log(`${c.boldCyan('Version History')} for ${c.cyan(id)}:\n`);
        for (const v of history) {
          console.log(`  ${c.bold('v' + v.version)} — ${c.dim(v.timestamp)}`);
          if (v.metadata.reason) console.log(`    ${c.dim('Reason:')} ${v.metadata.reason}`);
          console.log(`    ${c.dim(v.code.split('\n').length + ' lines')}`);
        }
      }
    } catch (err) {
      console.error(c.red('Versioning requires SQLite: ' + err.message));
    }
    return;
  }

  if (cmd === 'sdiff') {
    const ids = process.argv.slice(3).filter(a => !a.startsWith('--'));
    if (ids.length < 2) { console.error(`Usage: ${c.cyan('oracle sdiff')} <id-a> <id-b>`); process.exit(1); }
    try {
      const { semanticDiff } = require('./core/versioning');
      const a = oracle.patterns.getAll().find(p => p.id === ids[0]) || oracle.store.get(ids[0]);
      const b = oracle.patterns.getAll().find(p => p.id === ids[1]) || oracle.store.get(ids[1]);
      if (!a) { console.error(c.red(`Entry ${ids[0]} not found`)); process.exit(1); }
      if (!b) { console.error(c.red(`Entry ${ids[1]} not found`)); process.exit(1); }
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
      console.error(c.red(err.message));
    }
    return;
  }

  if (cmd === 'users') {
    try {
      const { AuthManager } = require('./auth/auth');
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
        // List users
        const users = auth.listUsers();
        console.log(c.boldCyan(`Users (${users.length}):\n`));
        for (const u of users) {
          console.log(`  ${c.bold(u.username)} [${c.cyan(u.id.slice(0, 8))}] role: ${c.magenta(u.role)} key: ${c.dim(u.apiKey.slice(0, 12) + '...')}`);
        }
      }
    } catch (err) {
      console.error(c.red('Auth error: ' + err.message));
    }
    return;
  }

  if (cmd === 'auto-seed') {
    try {
      const { autoSeed } = require('./ci/auto-seed');
      const baseDir = args.dir || process.cwd();
      const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
      const result = autoSeed(oracle, baseDir, { language: args.language, dryRun });
      if (dryRun) {
        console.log(c.boldCyan('Auto-Seed Dry Run:'));
        console.log(`  Discovered ${c.bold(String(result.discovered))} source file(s) with tests`);
        for (const p of result.patterns) {
          console.log(`  ${c.cyan(p.name)} (${c.blue(p.language)}) — ${p.functions.slice(0, 5).join(', ')}`);
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
    return;
  }

  if (cmd === 'import') {
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
    return;
  }

  if (cmd === 'reflect') {
    const code = getCode(args);
    if (!code) { console.error(c.boldRed('Error:') + ` --file required or pipe code via stdin. Usage: ${c.cyan('cat code.js | oracle reflect')}`); process.exit(1); }
    const { reflectionLoop, formatReflectionResult } = require('./core/reflection');
    const result = reflectionLoop(code, {
      language: args.language,
      maxLoops: parseInt(args.loops) || 3,
      targetCoherence: parseFloat(args.target) || 0.9,
      description: args.description || '',
      tags: args.tags ? args.tags.split(',').map(t => t.trim()) : [],
    });
    if (jsonOut) { console.log(JSON.stringify(result)); return; }
    console.log(c.boldCyan('SERF Infinite Reflection Loop\n'));
    console.log(`${c.bold('I_AM:')} ${colorScore(result.serf.I_AM)} → ${c.bold('Final:')} ${colorScore(result.serf.finalCoherence)} (${result.serf.improvement >= 0 ? c.green('+' + result.serf.improvement.toFixed(3)) : c.red(result.serf.improvement.toFixed(3))})`);
    console.log(`${c.bold('Loops:')} ${result.loops}  |  ${c.bold('Full coherency:')} ${colorScore(result.fullCoherency)}\n`);
    console.log(c.bold('Dimensions:'));
    for (const [dim, val] of Object.entries(result.dimensions)) {
      const bar = '\u2588'.repeat(Math.round(val * 25));
      const faded = '\u2591'.repeat(25 - Math.round(val * 25));
      console.log(`  ${c.cyan(dim.padEnd(14))} ${c.green(bar)}${c.dim(faded)} ${colorScore(val)}`);
    }
    if (result.healingPath.length > 0) {
      console.log(`\n${c.bold('Healing path:')}`);
      for (const h of result.healingPath) { console.log(`  ${c.green('+')} ${h}`); }
    }
    console.log(`\n${c.magenta('Whisper from the healed future:')}`);
    console.log(`  ${c.dim('"' + result.whisper + '"')}`);
    console.log(`\n${c.dim(result.healingSummary)}`);
    if (args.output) {
      fs.writeFileSync(path.resolve(args.output), result.code, 'utf-8');
      console.log(`\n${c.boldGreen('Healed code written to:')} ${c.cyan(args.output)}`);
    }
    return;
  }

  if (cmd === 'covenant') {
    const { covenantCheck, getCovenant, formatCovenantResult } = require('./core/covenant');
    const subCmd = process.argv[3];
    if (subCmd === 'list' || (!subCmd && !args.file)) {
      const principles = getCovenant();
      console.log(c.boldCyan("The Kingdom's Weave — 15 Covenant Principles:\n"));
      for (const p of principles) {
        console.log(`  ${c.bold(String(p.id).padStart(2))}. ${c.cyan(p.name)}`);
        console.log(`      ${c.dim(p.seal)}`);
      }
      return;
    }
    const code = getCode(args);
    if (!code) { console.error(c.boldRed('Error:') + ` --file required or pipe code via stdin. Usage: ${c.cyan('cat code.js | oracle covenant')}`); process.exit(1); }
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const result = covenantCheck(code, { description: args.description || '', tags, language: args.language });
    if (jsonOut) { console.log(JSON.stringify(result)); return; }
    if (result.sealed) {
      console.log(`${c.boldGreen('SEALED')} — Covenant upheld (${result.principlesPassed}/${result.totalPrinciples} principles)`);
    } else {
      console.log(`${c.boldRed('BROKEN')} — Covenant violated:\n`);
      for (const v of result.violations) {
        console.log(`  ${c.red('[' + v.principle + ']')} ${c.bold(v.name)}: ${v.reason}`);
        console.log(`      ${c.dim('Seal: "' + v.seal + '"')}`);
      }
      process.exit(1);
    }
    return;
  }

  if (cmd === 'hooks') {
    const { installHooks, uninstallHooks, runPreCommitCheck } = require('./ci/hooks');
    const subCmd = process.argv[3];
    if (subCmd === 'install') {
      const result = installHooks(process.cwd());
      if (result.installed) {
        console.log(`${c.boldGreen('Hooks installed:')} ${result.hooks.join(', ')}`);
        console.log(`  ${c.dim('Location:')} ${result.hooksDir}`);
        console.log(`  ${c.cyan('pre-commit')}  — Covenant check on staged files`);
        console.log(`  ${c.cyan('post-commit')} — Auto-seed patterns from committed files`);
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
    return;
  }

  if (cmd === 'harvest') {
    const source = process.argv[3];
    if (!source) { console.error(c.boldRed('Error:') + ` provide a source. Usage: ${c.cyan('oracle harvest <git-url-or-path> [--language js] [--dry-run] [--split function]')}`); process.exit(1); }
    try {
      const { harvest } = require('./ci/harvest');
      const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
      const result = harvest(oracle, source, {
        language: args.language,
        dryRun,
        splitMode: args.split || 'file',
        branch: args.branch,
        maxFiles: parseInt(args['max-files']) || 200,
      });
      console.log(c.boldCyan(`Harvest: ${source}\n`));
      console.log(`  Discovered: ${c.bold(String(result.harvested))}`);
      if (!dryRun) {
        console.log(`  Registered: ${c.boldGreen(String(result.registered))}`);
        console.log(`  Skipped:    ${c.yellow(String(result.skipped))}`);
        console.log(`  Failed:     ${result.failed > 0 ? c.boldRed(String(result.failed)) : c.dim('0')}`);
      }
      if (result.patterns.length > 0) {
        console.log(`\n${c.bold('Patterns:')}`);
        for (const p of result.patterns.slice(0, 50)) {
          const icon = p.status === 'registered' ? c.green('+') : p.hasTests ? c.cyan('T') : c.dim('-');
          const testBadge = p.hasTests ? c.cyan(' [tested]') : '';
          console.log(`  ${icon} ${c.bold(p.name)} (${c.blue(p.language)})${testBadge}${p.reason ? c.dim(' — ' + p.reason) : ''}`);
        }
        if (result.patterns.length > 50) {
          console.log(c.dim(`  ... and ${result.patterns.length - 50} more`));
        }
      }
    } catch (err) {
      console.error(c.red('Harvest error: ' + err.message));
      process.exit(1);
    }
    return;
  }

  // ─── Debug Oracle Commands ───

  if (cmd === 'debug') {
    const sub = process.argv[3];

    if (!sub || sub === 'help') {
      console.log(`
${c.boldCyan('Debug Oracle')} — exponential debugging intelligence

${c.bold('Subcommands:')}
  ${c.cyan('debug capture')}    Capture an error→fix pair as a debug pattern
  ${c.cyan('debug search')}     Search for fixes matching an error message
  ${c.cyan('debug feedback')}   Report whether a fix worked (grows confidence)
  ${c.cyan('debug grow')}       Generate variants from high-confidence patterns
  ${c.cyan('debug patterns')}   List stored debug patterns
  ${c.cyan('debug stats')}      Show debug pattern statistics
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
      if (jsonOut) { console.log(JSON.stringify(result)); return; }
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
      if (jsonOut) { console.log(JSON.stringify(results)); return; }
      if (results.length === 0) {
        console.log(c.yellow('No matching debug patterns found.'));
      } else {
        console.log(`Found ${c.bold(String(results.length))} fix(es) for ${c.red('"' + errorMessage.slice(0, 60) + '"')}:\n`);
        for (const r of results) {
          const sourceLabel = r.source ? colorSource(r.source) : c.dim('local');
          console.log(`  [${sourceLabel}] ${c.bold(r.errorClass)}:${c.cyan(r.errorCategory)} — match: ${colorScore(r.matchScore)} confidence: ${colorScore(r.confidence)}`);
          console.log(`    ${c.blue(r.language)} | ${r.matchType} match | applied ${r.timesApplied}x → resolved ${r.timesResolved}x`);
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
      console.log(c.boldCyan('Debug Growth Engine') + ' — exponential variant generation\n');
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

    if (sub === 'patterns') {
      const filters = {};
      if (args.language) filters.language = args.language;
      if (args.category) filters.category = args.category;
      if (args['min-confidence']) filters.minConfidence = parseFloat(args['min-confidence']);
      filters.limit = parseInt(args.limit) || 20;

      const patterns = oracle.debugPatterns(filters);
      if (jsonOut) { console.log(JSON.stringify(patterns)); return; }

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
      if (jsonOut) { console.log(JSON.stringify(stats)); return; }
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
      if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));
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
      if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));
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
      if (jsonOut) { console.log(JSON.stringify(stats)); return; }
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

    console.error(`${c.boldRed('Unknown debug subcommand:')} ${sub}. Run ${c.cyan('oracle debug help')} for usage.`);
    process.exit(1);
  }

  if (cmd === 'cloud') {
    const { CloudSyncServer } = require('./cloud/server');
    const sub = process.argv[3];
    if (sub === 'start') {
      const port = parseInt(args.port) || 3579;
      const server = new CloudSyncServer({ oracle, port, secret: args.secret });
      server.start().then((p) => {
        console.log(`${c.boldGreen('Cloud Sync Server')} running on ${c.cyan('http://localhost:' + p)}`);
        console.log(`${c.dim('Endpoints: /api/auth, /api/patterns, /api/search, /api/sync, /api/debug, /ws')}`);
      });
      return;
    }
    console.log(`Usage: ${c.cyan('oracle cloud start')} [--port 3579] [--secret <key>]`);
    return;
  }

  if (cmd === 'llm') {
    const sub = process.argv[3];

    if (!sub || sub === 'help') {
      console.log(`${c.bold('Claude LLM Engine')}\n`);
      console.log(`  ${c.cyan('llm status')}                   Check if Claude is available`);
      console.log(`  ${c.cyan('llm transpile')} --id <id> --to <lang>  Transpile a pattern`);
      console.log(`  ${c.cyan('llm tests')} --id <id>          Generate tests for a pattern`);
      console.log(`  ${c.cyan('llm refine')} --id <id>         Refine a pattern's weak dimensions`);
      console.log(`  ${c.cyan('llm alternative')} --id <id>    Generate an alternative algorithm`);
      console.log(`  ${c.cyan('llm docs')} --id <id>           Generate documentation`);
      console.log(`  ${c.cyan('llm analyze')} --file <path>    Analyze code quality`);
      console.log(`  ${c.cyan('llm explain')} --id <id>        Explain a pattern in plain language`);
      console.log(`  ${c.cyan('llm generate')} [--max <n>]     LLM-enhanced candidate generation`);
      return;
    }

    if (sub === 'status') {
      const available = oracle.isLLMAvailable();
      if (available) {
        console.log(`${c.boldGreen('✓ Claude is available')} — native LLM engine active`);
        console.log(`  All llm commands will use Claude for generation.`);
      } else {
        console.log(`${c.yellow('⚠ Claude CLI not detected')}`);
        console.log(`  LLM commands will fall back to AST/SERF/regex methods.`);
        console.log(`  Install Claude Code: ${c.cyan('npm install -g @anthropic-ai/claude-code')}`);
      }
      return;
    }

    if (sub === 'transpile') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      if (!args.to) { console.error(c.boldRed('Error:') + ' --to <language> required'); process.exit(1); }
      const result = oracle.llmTranspile(args.id, args.to);
      if (result.success) {
        console.log(`${c.boldGreen('✓ Transpiled')} via ${c.cyan(result.method)}`);
        console.log(`  ${c.dim('Name:')} ${result.result.name}`);
        console.log(`  ${c.dim('Language:')} ${result.result.language}`);
        console.log(`\n${result.result.code}`);
      } else {
        console.error(`${c.boldRed('✗ Transpilation failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'tests') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmGenerateTests(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('✓ Tests generated')} via ${c.cyan(result.method)}`);
        console.log(`\n${result.testCode}`);
      } else {
        console.error(`${c.boldRed('✗ Test generation failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'refine') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmRefine(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('✓ Refined')} via ${c.cyan(result.method)}`);
        console.log(`\n${result.refinedCode}`);
      } else {
        console.error(`${c.boldRed('✗ Refinement failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'alternative') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmAlternative(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('✓ Alternative generated')} via ${c.cyan(result.method)}`);
        console.log(`  ${c.dim('Name:')} ${result.alternative.name}`);
        console.log(`\n${result.alternative.code}`);
      } else {
        console.error(`${c.boldRed('✗ Alternative failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'docs') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmDocs(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('✓ Docs generated')} via ${c.cyan(result.method)}`);
        console.log(`\n${result.docs}`);
      } else {
        console.error(`${c.boldRed('✗ Docs failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'analyze') {
      const code = args.file ? fs.readFileSync(args.file, 'utf8') : null;
      if (!code) { console.error(c.boldRed('Error:') + ' --file required'); process.exit(1); }
      const lang = args.language || path.extname(args.file).slice(1) || 'javascript';
      const result = oracle.llmAnalyze(code, lang);
      if (result.success) {
        console.log(`${c.boldGreen('✓ Analysis')} via ${c.cyan(result.method)}`);
        console.log(`  ${c.dim('Quality:')} ${colorScore(result.analysis.quality || 0)}`);
        console.log(`  ${c.dim('Complexity:')} ${result.analysis.complexity}`);
        if (result.analysis.issues?.length) {
          console.log(`\n  ${c.bold('Issues:')}`);
          result.analysis.issues.forEach(i => console.log(`    ${i.severity === 'high' ? c.red('●') : c.yellow('●')} ${i.description}`));
        }
        if (result.analysis.suggestions?.length) {
          console.log(`\n  ${c.bold('Suggestions:')}`);
          result.analysis.suggestions.forEach(s => console.log(`    ${c.cyan('→')} ${s}`));
        }
      } else {
        console.error(`${c.boldRed('✗ Analysis failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'explain') {
      if (!args.id) { console.error(c.boldRed('Error:') + ' --id required'); process.exit(1); }
      const result = oracle.llmExplain(args.id);
      if (result.success) {
        console.log(`${c.boldGreen('✓ Explanation')} via ${c.cyan(result.method)}`);
        console.log(`\n${result.explanation}`);
      } else {
        console.error(`${c.boldRed('✗ Explanation failed:')} ${result.error}`);
      }
      return;
    }

    if (sub === 'generate') {
      const max = parseInt(args.max) || 10;
      console.log(`${c.dim('Generating LLM-enhanced candidates...')}`);
      const result = oracle.llmGenerate({ maxPatterns: max });
      console.log(`${c.boldGreen('✓ Generation complete')} via ${c.cyan(result.method)}`);
      console.log(`  ${c.dim('Generated:')} ${result.generated}  ${c.dim('Stored:')} ${result.stored}`);
      if (result.details?.length > 0 && result.details[0]?.name) {
        result.details.forEach(d => console.log(`  ${c.cyan('→')} ${d.name} (${d.method})`));
      }
      return;
    }

    console.error(`${c.boldRed('Unknown llm subcommand:')} ${sub}. Run ${c.cyan('oracle llm help')} for usage.`);
    process.exit(1);
  }

  console.error(`${c.boldRed('Unknown command:')} ${cmd}. Run ${c.cyan("'remembrance-oracle help'")} for usage.`);
  process.exit(1);
}

main();
