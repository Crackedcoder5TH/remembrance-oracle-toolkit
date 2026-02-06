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
Remembrance Oracle Toolkit

Commands:
  submit     Submit code for validation and storage
  query      Query for relevant, proven code
  validate   Validate code without storing
  stats      Show store statistics
  inspect    Inspect a stored entry
  feedback   Report if pulled code worked
  prune      Remove low-coherency entries

Options:
  --file <path>          Code file to submit/validate
  --test <path>          Test file for validation
  --description <text>   Description for query/submit
  --tags <comma,list>    Tags for query/submit
  --language <lang>      Language filter
  --id <id>              Entry ID for inspect/feedback
  --success              Mark feedback as successful
  --failure              Mark feedback as failed
  --min-coherency <n>    Minimum coherency threshold
  --limit <n>            Max results for query
    `);
    return;
  }

  if (cmd === 'submit') {
    if (!args.file) { console.error('Error: --file required'); process.exit(1); }
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
      console.log(`Accepted! ID: ${result.entry.id}`);
      console.log(`Coherency: ${result.entry.coherencyScore.total}`);
      console.log(`Breakdown:`, JSON.stringify(result.entry.coherencyScore.breakdown, null, 2));
    } else {
      console.log(`Rejected: ${result.reason}`);
      console.log(`Score: ${result.validation.coherencyScore?.total}`);
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
      console.log('No matching entries found.');
    } else {
      console.log(`Found ${results.length} result(s):\n`);
      for (const r of results) {
        console.log(`--- [${r.id}] (coherency: ${r.coherencyScore}, relevance: ${r.relevanceScore}) ---`);
        console.log(`Language: ${r.language} | Tags: ${r.tags.join(', ') || 'none'}`);
        console.log(`Description: ${r.description || 'none'}`);
        console.log(r.code);
        console.log('');
      }
    }
    return;
  }

  if (cmd === 'validate') {
    if (!args.file) { console.error('Error: --file required'); process.exit(1); }
    const code = fs.readFileSync(path.resolve(args.file), 'utf-8');
    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const { validateCode } = require('./core/validator');
    const result = validateCode(code, { language: args.language, testCode });
    console.log(`Valid: ${result.valid}`);
    console.log(`Coherency: ${result.coherencyScore.total}`);
    console.log(`Breakdown:`, JSON.stringify(result.coherencyScore.breakdown, null, 2));
    if (result.errors.length > 0) {
      console.log(`Errors:`, result.errors);
    }
    return;
  }

  if (cmd === 'stats') {
    const stats = oracle.stats();
    console.log('Remembrance Oracle Stats:');
    console.log(`  Total entries: ${stats.totalEntries}`);
    console.log(`  Languages: ${stats.languages.join(', ') || 'none'}`);
    console.log(`  Avg coherency: ${stats.avgCoherency}`);
    if (stats.topTags.length > 0) {
      console.log(`  Top tags: ${stats.topTags.map(t => `${t.tag}(${t.count})`).join(', ')}`);
    }
    return;
  }

  if (cmd === 'inspect') {
    if (!args.id) { console.error('Error: --id required'); process.exit(1); }
    const entry = oracle.inspect(args.id);
    if (!entry) { console.log('Entry not found.'); return; }
    console.log(JSON.stringify(entry, null, 2));
    return;
  }

  if (cmd === 'feedback') {
    if (!args.id) { console.error('Error: --id required'); process.exit(1); }
    const succeeded = args.success === true || args.success === 'true';
    const result = oracle.feedback(args.id, succeeded);
    console.log(result.success ? `Updated reliability: ${result.newReliability}` : result.error);
    return;
  }

  if (cmd === 'prune') {
    const min = parseFloat(args['min-coherency']) || 0.4;
    const result = oracle.prune(min);
    console.log(`Pruned ${result.removed} entries. ${result.remaining} remaining.`);
    return;
  }

  console.error(`Unknown command: ${cmd}. Run 'remembrance-oracle help' for usage.`);
  process.exit(1);
}

main();
