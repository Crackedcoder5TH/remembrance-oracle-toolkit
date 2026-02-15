/**
 * Core CLI commands: setup, submit, query, validate, stats, inspect, feedback
 */

const fs = require('fs');
const path = require('path');
const { c, colorScore, colorStatus } = require('../colors');
const { validatePositiveInt, validateCoherency, validateId, parseTags } = require('../validate-args');

function registerCoreCommands(handlers, { oracle, getCode, jsonOut }) {

  handlers['setup'] = handlers['init'] = (args) => {
    console.log(`\n${c.boldCyan('Remembrance Oracle — Setup')}\n`);

    // 1. Seed the oracle
    console.log(`${c.bold('1.')} Seeding pattern library...`);
    const { seedLibrary: initSeedLibrary, seedNativeLibrary: initSeedNative, seedExtendedLibrary: initSeedExtended } = require('../../patterns/seed-helpers');
    const initCore = initSeedLibrary(oracle);
    const initExt = initSeedExtended(oracle);
    const initNative = initSeedNative(oracle);
    const totalSeeded = initCore.registered + initExt.registered + initNative.registered;
    console.log(`   ${c.green('\u2713')} ${totalSeeded} patterns seeded\n`);

    // 2. Create .remembrance dir
    const storeDir = path.join(process.cwd(), '.remembrance');
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
      console.log(`${c.bold('2.')} Created ${c.cyan('.remembrance/')} directory`);
    } else {
      console.log(`${c.bold('2.')} ${c.cyan('.remembrance/')} directory exists`);
    }

    // 3. Create CLAUDE.md if not present
    const claudeMd = path.join(process.cwd(), 'CLAUDE.md');
    if (!fs.existsSync(claudeMd)) {
      const template = `# Oracle Instructions\n\nBefore writing any function, search the oracle:\n\`\`\`bash\noracle search "<what you need>" --limit 3\noracle resolve --description "<what you need>"\n\`\`\`\n\nAfter writing code that passes tests, register it:\n\`\`\`bash\noracle register --file <code.js> --test <test.js> --name <name>\n\`\`\`\n`;
      fs.writeFileSync(claudeMd, template);
      console.log(`${c.bold('3.')} Created ${c.cyan('CLAUDE.md')} with oracle instructions`);
    } else {
      console.log(`${c.bold('3.')} ${c.cyan('CLAUDE.md')} already exists`);
    }

    // 4. Stats
    const stats = oracle.stats();
    const setupPatternStats = oracle.patternStats();
    console.log(`\n${c.boldGreen('Setup complete!')}`);
    console.log(`  Patterns: ${setupPatternStats.totalPatterns || setupPatternStats.total || 0}`);
    console.log(`  Entries:  ${stats.totalEntries}`);
    console.log(`\n${c.dim('Quick start:')}`);
    console.log(`  ${c.cyan('oracle search "debounce"')}     — Find a pattern`);
    console.log(`  ${c.cyan('oracle resolve --description "..."')} — Smart pull/evolve/generate`);
    console.log(`  ${c.cyan('oracle mcp')}                  — Start MCP server for AI clients`);
    console.log(`  ${c.cyan('oracle cloud start')}          — Start cloud server for federation`);
    console.log(`  ${c.cyan('oracle dashboard')}            — Web dashboard`);
  };

  handlers['submit'] = (args) => {
    const code = getCode(args);
    if (!code) { console.error(c.boldRed('Error:') + ' --file required or pipe code via stdin'); process.exit(1); }
    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const tags = parseTags(args);
    const result = oracle.submit(code, {
      description: args.description || '',
      tags,
      language: args.language,
      testCode,
      author: args.author || process.env.USER || 'cli-user',
    });
    if (jsonOut()) { console.log(JSON.stringify(result)); return; }
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
      // Show actionable feedback
      if (result.validation.feedback) {
        const { formatFeedback } = require('../../core/feedback');
        console.log(`\n${c.boldCyan('What to fix:')}`);
        console.log(formatFeedback(result.validation.feedback));
      }
    }
  };

  handlers['query'] = (args) => {
    const tags = parseTags(args);
    const results = oracle.query({
      description: args.description || '',
      tags,
      language: args.language,
      limit: validatePositiveInt(args.limit, 'limit', 5),
      minCoherency: validateCoherency(args['min-coherency'], 'min-coherency', 0.5),
    });
    if (jsonOut()) { console.log(JSON.stringify(results)); return; }
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
  };

  handlers['validate'] = (args) => {
    const code = getCode(args);
    if (!code) { console.error(c.boldRed('Error:') + ' --file required or pipe code via stdin'); process.exit(1); }
    const testCode = args.test ? fs.readFileSync(path.resolve(args.test), 'utf-8') : undefined;
    const { validateCode } = require('../../core/validator');
    const result = validateCode(code, { language: args.language, testCode });
    if (jsonOut()) { console.log(JSON.stringify(result)); return; }
    console.log(`Valid: ${result.valid ? c.boldGreen('true') : c.boldRed('false')}`);
    console.log(`Coherency: ${colorScore(result.coherencyScore.total)}`);
    console.log(`Breakdown:`);
    for (const [key, val] of Object.entries(result.coherencyScore.breakdown)) {
      console.log(`  ${c.dim(key + ':')} ${colorScore(val)}`);
    }
    if (result.errors.length > 0) {
      console.log(`${c.boldRed('Errors:')}`);
      for (const err of result.errors) {
        console.log(`  ${c.red('\u2022')} ${err}`);
      }
      // Show actionable feedback
      if (result.feedback) {
        const { formatFeedback } = require('../../core/feedback');
        console.log(`\n${c.boldCyan('What to fix:')}`);
        console.log(formatFeedback(result.feedback));
      }
    }
  };

  handlers['stats'] = (args) => {
    const stats = oracle.stats();
    console.log(c.boldCyan('Remembrance Oracle Stats:'));
    console.log(`  Total entries: ${c.bold(String(stats.totalEntries))}`);
    console.log(`  Languages: ${stats.languages.map(l => c.blue(l)).join(', ') || c.dim('none')}`);
    console.log(`  Avg coherency: ${colorScore(stats.avgCoherency)}`);
    if (stats.topTags.length > 0) {
      console.log(`  Top tags: ${stats.topTags.map(t => `${c.magenta(t.tag)}(${t.count})`).join(', ')}`);
    }
  };

  handlers['inspect'] = (args) => {
    const id = validateId(args.id);
    const entry = oracle.inspect(id);
    if (!entry) { console.log(c.yellow('Entry not found.')); return; }
    console.log(JSON.stringify(entry, null, 2));
  };

  handlers['feedback'] = (args) => {
    const id = validateId(args.id);
    const succeeded = args.success === true || args.success === 'true';
    const result = oracle.feedback(id, succeeded);
    if (result.success) {
      console.log(`Updated reliability: ${colorScore(result.newReliability)}`);
    } else {
      console.log(c.red(result.error));
    }
  };
}

module.exports = { registerCoreCommands };
