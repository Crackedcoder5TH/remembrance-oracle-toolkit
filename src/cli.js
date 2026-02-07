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
  ${c.cyan('diff')}       Compare two entries or patterns side by side
  ${c.cyan('export')}     Export top patterns as standalone JSON or markdown
  ${c.cyan('search')}     Fuzzy search across patterns and history
  ${c.cyan('register')}   Register code as a named pattern in the library
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
  ${c.cyan('sync')}       Sync patterns with global store (~/.remembrance/)
  ${c.cyan('global')}     Show global store statistics
  ${c.cyan('hooks')}       Install/uninstall git hooks (pre-commit covenant, post-commit seed)

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
    const { GLOBAL_DIR } = require('./core/persistence');

    console.log(c.boldCyan('Cross-Project Sync') + c.dim(` — global store: ${GLOBAL_DIR}\n`));

    if (direction === 'push' || direction === 'to') {
      const report = oracle.syncToGlobal({ verbose, dryRun });
      console.log(`Pushed to global:  ${c.boldGreen(String(report.synced))} patterns`);
      console.log(`  Duplicates:      ${c.dim(String(report.duplicates))}`);
      console.log(`  Skipped:         ${c.dim(String(report.skipped))}`);
    } else if (direction === 'pull' || direction === 'from') {
      const lang = args.language;
      const maxPull = parseInt(args['max-pull']) || Infinity;
      const report = oracle.syncFromGlobal({ verbose, dryRun, language: lang, maxPull });
      console.log(`Pulled from global: ${c.boldGreen(String(report.pulled))} patterns`);
      console.log(`  Duplicates:       ${c.dim(String(report.duplicates))}`);
      console.log(`  Skipped:          ${c.dim(String(report.skipped))}`);
    } else {
      const report = oracle.sync({ verbose, dryRun });
      console.log(`${c.bold('Push')} (local → global): ${c.boldGreen(String(report.push.synced))} synced, ${c.dim(String(report.push.duplicates))} duplicates`);
      console.log(`${c.bold('Pull')} (global → local): ${c.boldGreen(String(report.pull.pulled))} pulled, ${c.dim(String(report.pull.duplicates))} duplicates`);
    }

    if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));

    // Show totals
    const gStats = oracle.globalStats();
    const pStats = oracle.patternStats();
    console.log(`\nLocal:  ${c.bold(String(pStats.totalPatterns))} patterns`);
    console.log(`Global: ${c.bold(String(gStats.totalPatterns || 0))} patterns`);
    return;
  }

  if (cmd === 'global') {
    const stats = oracle.globalStats();

    if (jsonOut) { console.log(JSON.stringify(stats)); return; }

    if (!stats.available) {
      console.log(c.yellow('No global store found. Run ') + c.cyan('oracle sync push') + c.yellow(' to create it.'));
      return;
    }

    console.log(c.boldCyan('Global Store') + c.dim(` — ${stats.path}\n`));
    console.log(`  Total patterns: ${c.bold(String(stats.totalPatterns))}`);
    console.log(`  Avg coherency:  ${colorScore(stats.avgCoherency)}`);
    if (Object.keys(stats.byLanguage).length > 0) {
      console.log(`  By language:    ${Object.entries(stats.byLanguage).map(([k, v]) => `${c.blue(k)}(${v})`).join(', ')}`);
    }
    if (Object.keys(stats.byType).length > 0) {
      console.log(`  By type:        ${Object.entries(stats.byType).map(([k, v]) => `${c.magenta(k)}(${v})`).join(', ')}`);
    }

    // Show federated view
    const federated = oracle.federatedSearch();
    if (federated.globalOnly > 0) {
      console.log(`\n  ${c.green(String(federated.globalOnly))} patterns available from global (not in local)`);
      console.log(`  Run ${c.cyan('oracle sync pull')} to import them`);
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

  console.error(`${c.boldRed('Unknown command:')} ${cmd}. Run ${c.cyan("'remembrance-oracle help'")} for usage.`);
  process.exit(1);
}

main();
