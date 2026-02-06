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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._command;

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
  ${c.yellow('--no-color')}             Disable colored output
    `);
    return;
  }

  if (cmd === 'submit') {
    if (!args.file) { console.error(c.boldRed('Error:') + ' --file required'); process.exit(1); }
    const code = fs.readFileSync(path.resolve(args.file), 'utf-8');
    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const result = oracle.submit(code, {
      description: args.description || '',
      tags,
      language: args.language,
      testCode,
      author: args.author || process.env.USER || 'cli-user',
    });
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
    if (!args.file) { console.error(c.boldRed('Error:') + ' --file required'); process.exit(1); }
    const code = fs.readFileSync(path.resolve(args.file), 'utf-8');
    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const { validateCode } = require('./core/validator');
    const result = validateCode(code, { language: args.language, testCode });
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
    const results = oracle.search(term, {
      limit: parseInt(args.limit) || 10,
      language: args.language,
    });
    if (results.length === 0) {
      console.log(c.yellow('No matches found.'));
    } else {
      console.log(`Found ${c.bold(String(results.length))} match(es) for ${c.cyan('"' + term + '"')}:\n`);
      for (const r of results) {
        const label = r.name || r.description || 'untitled';
        console.log(`  [${colorSource(r.source)}] ${c.bold(label)}  (coherency: ${colorScore(r.coherency)}, match: ${colorScore(r.matchScore)})`);
        console.log(`         ${c.blue(r.language)} | ${r.tags.map(t => c.magenta(t)).join(', ') || c.dim('no tags')} | ${c.dim(r.id)}`);
      }
    }
    return;
  }

  if (cmd === 'seed') {
    const { seedLibrary } = require('./patterns/seeds');
    const results = seedLibrary(oracle);
    console.log(`Seeded ${c.boldGreen(String(results.registered))} patterns (${c.dim(results.skipped + ' skipped')}, ${results.failed > 0 ? c.boldRed(String(results.failed)) : c.dim(String(results.failed))} failed)`);
    console.log(`Library now has ${c.bold(String(oracle.patternStats().totalPatterns))} patterns`);
    return;
  }

  console.error(`${c.boldRed('Unknown command:')} ${cmd}. Run ${c.cyan("'remembrance-oracle help'")} for usage.`);
  process.exit(1);
}

main();
