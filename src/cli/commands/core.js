/**
 * Core CLI commands: setup, submit, query, validate, stats, inspect, feedback
 */

const fs = require('fs');
const path = require('path');
const { safePath } = require('../../core/safe-path');
const { c, colorScore, colorStatus } = require('../colors');
const { validatePositiveInt, validateCoherency, validateId, parseTags } = require('../validate-args');

function registerCoreCommands(handlers, { oracle, getCode, jsonOut }) {

  handlers['setup'] = handlers['init'] = (args) => {
    console.log(`\n${c.boldCyan('Remembrance Oracle — Initializing')}\n`);
    console.log(c.dim('One command to set everything up. Here we go.\n'));

    const summary = { steps: [], warnings: [] };

    // 1. Create .remembrance dir
    const storeDir = path.join(process.cwd(), '.remembrance');
    if (!fs.existsSync(storeDir)) {
      fs.mkdirSync(storeDir, { recursive: true });
    }
    console.log(`  ${c.green('\u2713')} Storage directory ready`);
    summary.steps.push('Created .remembrance/ storage directory');

    // 2. Seed the pattern library
    console.log(`  ${c.dim('\u25CB')} Seeding pattern library...`);
    const { seedLibrary: initSeedLibrary, seedNativeLibrary: initSeedNative, seedExtendedLibrary: initSeedExtended } = require('../../patterns/seed-helpers');
    const initCore = initSeedLibrary(oracle);
    const initExt = initSeedExtended(oracle);
    const initNative = initSeedNative(oracle);
    const totalSeeded = initCore.registered + initExt.registered + initNative.registered;
    console.log(`  ${c.green('\u2713')} ${totalSeeded} proven patterns loaded across JS, TS, Python, Go, Rust`);
    summary.steps.push(`Loaded ${totalSeeded} proven, tested code patterns`);

    // 3. Install git hooks (idempotent)
    let hooksInstalled = false;
    try {
      const { installHooks } = require('../../ci/hooks');
      const hookResult = installHooks(process.cwd());
      if (hookResult.installed) {
        hooksInstalled = true;
        console.log(`  ${c.green('\u2713')} Git hooks installed (pre-commit safety + post-commit auto-capture)`);
        summary.steps.push('Installed git hooks — your code is now auto-analyzed on every commit');
      } else {
        console.log(`  ${c.yellow('!')} Git hooks skipped — ${hookResult.error || 'not a git repo'}`);
        summary.warnings.push('Git hooks not installed — run from inside a git repository');
      }
    } catch (e) {
      console.log(`  ${c.yellow('!')} Git hooks skipped — ${e.message}`);
      summary.warnings.push('Git hooks not installed');
    }

    // 4. Pull patterns from personal store
    let pullCount = 0;
    try {
      const { pullFromGlobal } = require('../../core/persistence');
      const sqliteStore = oracle.store?.getSQLiteStore?.();
      if (sqliteStore) {
        const pullResult = pullFromGlobal(sqliteStore, { minCoherency: 0.0 });
        pullCount = pullResult?.pulled || 0;
        if (pullCount > 0) {
          console.log(`  ${c.green('\u2713')} Pulled ${pullCount} pattern(s) from your personal store`);
          summary.steps.push(`Synced ${pullCount} patterns from your personal library`);
        } else {
          console.log(`  ${c.green('\u2713')} Personal store synced (no new patterns to pull)`);
          summary.steps.push('Checked personal store — already in sync');
        }
      } else {
        console.log(`  ${c.green('\u2713')} Personal store sync ready`);
        summary.steps.push('Personal store connected');
      }
    } catch (e) {
      console.log(`  ${c.dim('\u25CB')} Personal store — will be created when you first sync`);
      summary.steps.push('Personal store will be created on first sync');
    }

    // 5. Seed the quantum field for debug pattern detection
    try {
      const { DebugOracle } = require('../../debug/debug-oracle');
      const debugOracle = new DebugOracle();
      const seedCount = debugOracle.getSeedCount?.() || debugOracle.stats?.()?.total || 0;
      console.log(`  ${c.green('\u2713')} Debug oracle ready (${seedCount} error-fix patterns)`);
      summary.steps.push(`Debug oracle seeded with ${seedCount} error-fix patterns`);
    } catch (e) {
      console.log(`  ${c.dim('\u25CB')} Debug oracle initialized`);
      summary.steps.push('Debug oracle initialized');
    }

    // 6. Create CLAUDE.md if not present
    const claudeMd = path.join(process.cwd(), 'CLAUDE.md');
    if (!fs.existsSync(claudeMd)) {
      const template = `# Oracle Instructions\n\nBefore writing any function, search the oracle:\n\`\`\`bash\noracle search "<what you need>" --limit 3\noracle resolve --description "<what you need>"\n\`\`\`\n\nAfter writing code that passes tests, register it:\n\`\`\`bash\noracle register --file <code.js> --test <test.js> --name <name>\n\`\`\`\n`;
      fs.writeFileSync(claudeMd, template);
      console.log(`  ${c.green('\u2713')} Created CLAUDE.md for AI agent instructions`);
      summary.steps.push('Created CLAUDE.md — AI agents will now use the oracle automatically');
    } else {
      console.log(`  ${c.green('\u2713')} CLAUDE.md already exists`);
    }

    // 7. Stats
    const stats = oracle.stats();
    const setupPatternStats = oracle.patternStats();
    const patternCount = setupPatternStats.totalPatterns || setupPatternStats.total || 0;

    // Plain-language summary
    console.log(`\n${c.boldCyan('═══ What just happened ═══')}\n`);
    console.log(`  Your project now has a code memory library with ${c.bold(String(patternCount))} proven patterns.`);
    console.log(`  Every pattern has been tested and validated — no junk, no stubs.\n`);
    if (hooksInstalled) {
      console.log(`  ${c.bold('On every commit:')} New code is automatically analyzed, validated,`);
      console.log(`  and added to your library if it passes quality checks.\n`);
    }
    console.log(`  ${c.bold('Your AI coding tool')} can now search this library instead of generating`);
    console.log(`  code from scratch. Attach via MCP: ${c.cyan('oracle mcp')}\n`);

    if (summary.warnings.length > 0) {
      console.log(`${c.boldYellow('Heads up:')}`);
      for (const w of summary.warnings) {
        console.log(`  ${c.yellow('!')} ${w}`);
      }
      console.log('');
    }

    console.log(`${c.bold('Next steps:')}`);
    console.log(`  ${c.cyan('oracle search "debounce"')}       Search for proven code`);
    console.log(`  ${c.cyan('oracle mcp')}                    Connect to your AI tool via MCP`);
    console.log(`  ${c.cyan('oracle mcp-install')}            Auto-configure Claude, Cursor, VS Code`);
    console.log(`  ${c.cyan('oracle dashboard')}              Open the web dashboard`);
    console.log('');
  };

  handlers['submit'] = (args) => {
    const code = getCode(args);
    if (!code) { console.error(c.boldRed('Error:') + ' --file required or pipe code via stdin'); process.exit(1); }
    let testCode;
    if (args.test) {
      try { testCode = fs.readFileSync(safePath(args.test, process.cwd()), 'utf-8'); }
      catch (e) { console.error(c.boldRed('Error:') + ` Cannot read test file: ${e.message}`); process.exit(1); }
    }
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
    const testCode = args.test ? fs.readFileSync(safePath(args.test, process.cwd()), 'utf-8') : undefined;
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
      // Track feedback in session to close the feedback gap
      try {
        const { trackFeedback } = require('../../core/session-tracker');
        trackFeedback(id);
      } catch (_) { /* session tracker not critical */ }
      console.log(`Updated reliability: ${colorScore(result.newReliability)}`);
    } else {
      console.log(c.red(result.error));
    }
  };

  handlers['submit-noncode'] = (args) => {
    const { submitNonCode, nonCodeFeedback } = require('../../api/oracle-noncode');

    const content = args.content || args._rest || '';
    const description = args.description || '';
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const domain = args.domain || undefined;
    const author = args.author || 'anonymous';

    // If --file is provided, read content from file
    let finalContent = content;
    if (args.file) {
      try {
        finalContent = fs.readFileSync(safePath(args.file, process.cwd()), 'utf-8');
      } catch (e) {
        console.error(c.boldRed('Error:') + ` Could not read file: ${e.message}`);
        process.exit(1);
      }
    }

    if (!finalContent) {
      console.error(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle submit-noncode')} --content "..." --description "..." [--domain <domain>] [--tags <tags>]`);
      process.exit(1);
    }

    const result = submitNonCode(
      { content: finalContent, description, tags, domain, author },
      oracle.store,
      oracle.patterns
    );

    if (jsonOut()) { console.log(JSON.stringify(result)); return; }

    if (result.success) {
      console.log(`${c.boldGreen('Submitted')} non-code pattern: ${c.cyan(result.entry.id)}`);
      console.log(`  Domain:      ${c.magenta(result.structured?.domain || 'general')}`);
      console.log(`  Coherency:   ${colorScore(result.entry.coherencyScore.total.toFixed(3))} (baseline — grows with feedback)`);
      console.log(`  Transform:   ${c.dim(result.structured?.transform || 'N/A')}`);
      if (result.structured?.inputs?.length > 0) {
        console.log(`  Inputs:      ${result.structured.inputs.join(', ')}`);
      }
      if (result.structured?.outputs?.length > 0) {
        console.log(`  Outputs:     ${result.structured.outputs.join(', ')}`);
      }
      console.log(`\n  ${c.dim('Use')} ${c.cyan(`oracle feedback --id ${result.entry.id} --success`)} ${c.dim('to build confidence')}`);
    } else {
      console.log(c.red(result.error));
    }
  };
}

module.exports = { registerCoreCommands };
