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

/**
 * Speak text via system TTS (espeak on Linux, say on macOS).
 * Non-blocking — fire-and-forget.
 */
function speakCLI(text) {
  try {
    const safeText = text.replace(/["`$\\]/g, '');
    const { platform } = require('os');
    const cmd = platform() === 'darwin'
      ? `say -r 180 "${safeText}" &`
      : `espeak -s 150 "${safeText}" 2>/dev/null &`;
    require('child_process').exec(cmd);
  } catch { /* TTS not available — silent fallback */ }
}

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
  if (args.file) {
    const filePath = path.resolve(args.file);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found: ${args.file}`);
      process.exit(1);
    }
    return fs.readFileSync(filePath, 'utf-8');
  }
  const stdin = readStdin();
  if (stdin.trim()) return stdin;
  return null;
}

function readFile(filePath, label) {
  const resolved = path.resolve(filePath);
  if (!fs.existsSync(resolved)) {
    console.error(`Error: ${label || 'File'} not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, 'utf-8');
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._command;
  const jsonOut = args.json === true;

  if (!cmd || cmd === 'help') {
    console.log(`
${c.boldCyan('Remembrance Oracle Toolkit')}

${c.bold('Core:')}
  ${c.cyan('submit')}        Submit code for validation and storage
  ${c.cyan('query')}         Query for relevant, proven code
  ${c.cyan('search')}        Fuzzy search across patterns and history
  ${c.cyan('smart-search')}  Intent-aware search with typo correction + ranking
  ${c.cyan('resolve')}       Smart retrieval — pull, evolve, or generate decision
  ${c.cyan('validate')}      Validate code without storing
  ${c.cyan('register')}      Register code as a named pattern in the library
  ${c.cyan('feedback')}      Report if pulled code worked
  ${c.cyan('inspect')}       Inspect a stored entry

${c.bold('Library:')}
  ${c.cyan('patterns')}      Show pattern library statistics
  ${c.cyan('stats')}         Show store statistics
  ${c.cyan('seed')}          Seed the library with built-in + native patterns
  ${c.cyan('analytics')}     Show pattern analytics and library health report
  ${c.cyan('candidates')}    List candidate patterns (coherent but unproven)
  ${c.cyan('generate')}      Generate candidates from proven patterns
  ${c.cyan('promote')}       Promote a candidate to proven with test proof
  ${c.cyan('synthesize')}    Synthesize tests for candidates and auto-promote

${c.bold('Quality:')}
  ${c.cyan('covenant')}      Check code against the Covenant seal
  ${c.cyan('reflect')}       SERF reflection loop — heal and refine code
  ${c.cyan('harvest')}       Bulk harvest patterns from a repo or directory
  ${c.cyan('compose')}       Create a composed pattern from existing components
  ${c.cyan('deps')}          Show dependency tree for a pattern
  ${c.cyan('recycle')}       Recycle failures and generate variants

${c.bold('Open Source Registry:')}
  ${c.cyan('registry list')}      List curated open source repos (--language, --topic)
  ${c.cyan('registry search')}    Search curated repos by topic or keyword
  ${c.cyan('registry import')}    Import patterns from a curated repo by name
  ${c.cyan('registry batch')}     Batch import from multiple repos at once
  ${c.cyan('registry discover')}  Search GitHub for repos by topic/stars/language
  ${c.cyan('registry license')}   Check license compatibility for a repo
  ${c.cyan('registry provenance')} Show provenance (source/license) for imported patterns
  ${c.cyan('registry duplicates')} Find duplicate patterns across sources

${c.bold('Federation:')}
  ${c.cyan('cloud')}         Start cloud server for remote federation
  ${c.cyan('remote')}        Manage remote oracle connections
  ${c.cyan('cross-search')}  Search across all remotes
  ${c.cyan('sync')}          Sync patterns with personal store
  ${c.cyan('share')}         Share patterns to community store
  ${c.cyan('community')}     Browse/pull community patterns
  ${c.cyan('global')}        Show combined global store statistics

${c.bold('Voting & Identity:')}
  ${c.cyan('vote')}          Vote on a pattern (--id <id> --score 1-5)
  ${c.cyan('top-voted')}     Show top-voted patterns
  ${c.cyan('reputation')}    View/manage contributor reputation
  ${c.cyan('github')}        Link GitHub identity for verified voting

${c.bold('Transpiler & AI:')}
  ${c.cyan('transpile')}     Transpile pattern to another language
  ${c.cyan('context')}       Export AI context for a pattern
  ${c.cyan('llm')}           Claude LLM engine — transpile/test/refine/analyze/explain

${c.bold('Debug:')}
  ${c.cyan('debug')}         Debug oracle — capture/search/grow error→fix patterns
  ${c.cyan('reliability')}   Pattern reliability statistics

${c.bold('Integration:')}
  ${c.cyan('mcp')}           Start MCP server (67 tools, JSON-RPC over stdio)
  ${c.cyan('mcp-install')}   Auto-register MCP in AI editors (Claude, Cursor, VS Code)
  ${c.cyan('setup')}         Initialize oracle in current project (alias: init)
  ${c.cyan('dashboard')}     Start web dashboard (default port 3333)
  ${c.cyan('deploy')}        Start production-ready server (configurable via env vars)
  ${c.cyan('hooks')}         Install/uninstall git hooks
  ${c.cyan('plugin')}        Manage plugins (load, list, unload)

${c.bold('Admin:')}
  ${c.cyan('users')}         Manage users (list, add, delete)
  ${c.cyan('audit')}         View append-only audit log
  ${c.cyan('prune')}         Remove low-coherency entries
  ${c.cyan('deep-clean')}    Remove duplicates, stubs, and trivial patterns
  ${c.cyan('rollback')}      Rollback a pattern to a previous version
  ${c.cyan('import')}        Import patterns from exported JSON
  ${c.cyan('export')}        Export top patterns as JSON or markdown
  ${c.cyan('diff')}          Compare two entries side by side
  ${c.cyan('sdiff')}         Semantic diff between two patterns
  ${c.cyan('versions')}      Show version history for a pattern
  ${c.cyan('nearest')}       Find nearest semantic vocabulary terms
  ${c.cyan('auto-seed')}     Auto-discover and seed patterns from test suite
  ${c.cyan('ci-feedback')}   Report CI test results
  ${c.cyan('ci-stats')}      Show CI feedback tracking statistics

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

  if (cmd === 'setup' || cmd === 'init') {
    console.log(`\n${c.boldCyan('Remembrance Oracle — Setup')}\n`);

    // 1. Seed the oracle
    console.log(`${c.bold('1.')} Seeding pattern library...`);
    const { seedLibrary: initSeedLibrary, seedNativeLibrary: initSeedNative } = require('./patterns/seeds');
    const { seedExtendedLibrary: initSeedExtended } = require('./patterns/seeds-extended');
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
      const ctx = oracle.generateContext({ format: 'markdown', limit: 10 });
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
      // Show actionable feedback
      if (result.validation.feedback) {
        const { formatFeedback } = require('./core/feedback');
        console.log(`\n${c.boldCyan('What to fix:')}`);
        console.log(formatFeedback(result.validation.feedback));
      }
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
        console.log(`  ${c.red('\u2022')} ${err}`);
      }
      // Show actionable feedback
      if (result.feedback) {
        const { formatFeedback } = require('./core/feedback');
        console.log(`\n${c.boldCyan('What to fix:')}`);
        console.log(formatFeedback(result.feedback));
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

  if (cmd === 'bug-report' || cmd === 'report-bug') {
    const id = args.id || process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle bug-report')} <pattern-id> [--description "..."]`); process.exit(1); }
    const result = oracle.patterns.reportBug(id, args.description || '');
    if (result.success) {
      console.log(`${c.boldRed('Bug reported:')} ${c.bold(result.patternName)} — now has ${result.bugReports} report(s)`);
    } else {
      console.log(`${c.red(result.reason)}`);
    }
    return;
  }

  if (cmd === 'reliability') {
    const id = args.id || process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle reliability')} <pattern-id>`); process.exit(1); }
    const r = oracle.patterns.getReliability(id);
    if (!r) { console.log(c.red('Pattern not found')); return; }
    console.log(c.boldCyan(`Reliability: ${c.bold(r.patternName)}\n`));
    console.log(`  Usage:     ${r.successCount}/${r.usageCount} (${colorScore(r.usageReliability.toFixed(3))})`);
    console.log(`  Bugs:      ${r.bugReports > 0 ? c.red(String(r.bugReports)) : c.dim('0')} (penalty: ${colorScore(r.bugPenalty.toFixed(3))})`);
    console.log(`  Healing:   ${colorScore(r.healingRate.toFixed(3))}`);
    console.log(`  Combined:  ${colorScore(r.combined.toFixed(3))}`);
    return;
  }

  if (cmd === 'vote') {
    const id = args.id || process.argv[3];
    const direction = args.direction || process.argv[4] || 'up';
    const voter = args.voter || process.env.USER || 'anonymous';
    if (!id) { console.error(`Usage: ${c.cyan('oracle vote')} <pattern-id> [up|down] [--voter <name>]`); process.exit(1); }
    const vote = direction === 'down' || direction === 'downvote' || direction === '-1' ? -1 : 1;
    const result = oracle.vote(id, voter, vote);
    if (result.success) {
      console.log(`${vote > 0 ? c.boldGreen('Upvoted') : c.boldRed('Downvoted')} pattern ${c.bold(id)}`);
      console.log(`  Votes: ${c.green('+' + result.upvotes)} / ${c.red('-' + result.downvotes)} (score: ${result.voteScore})`);
      console.log(`  Vote weight: ${c.cyan(String(result.weight))} (reputation: ${c.cyan(String(result.voterReputation))})`);
    } else {
      console.log(c.red(result.error));
    }
    return;
  }

  if (cmd === 'top-voted' || cmd === 'topvoted') {
    const limit = parseInt(args.limit) || 20;
    const patterns = oracle.topVoted(limit);
    if (patterns.length === 0) {
      console.log(c.dim('No voted patterns yet.'));
      return;
    }
    console.log(c.boldCyan(`Top ${patterns.length} patterns by community votes:\n`));
    for (const p of patterns) {
      const score = (p.upvotes || 0) - (p.downvotes || 0);
      const icon = score > 0 ? c.green(`+${score}`) : score < 0 ? c.red(String(score)) : c.dim('0');
      console.log(`  [${icon}] ${c.bold(p.name)} (${p.language}) — coherency: ${colorScore((p.coherencyScore?.total ?? 0).toFixed(3))}`);
    }
    return;
  }

  if (cmd === 'reputation' || cmd === 'rep') {
    const sub = process.argv[3];
    if (sub === 'check' || !sub) {
      const voter = args.voter || process.argv[4] || process.env.USER || 'anonymous';
      const rep = oracle.getVoterReputation(voter);
      if (!rep) { console.log(c.dim('No reputation data.')); return; }
      console.log(c.boldCyan(`Voter Reputation: ${c.bold(rep.id)}\n`));
      console.log(`  Reputation: ${colorScore(String(rep.reputation))}`);
      console.log(`  Vote weight: ${c.cyan(String(rep.weight))}`);
      console.log(`  Total votes: ${rep.total_votes} | Accurate: ${rep.accurate_votes}`);
      console.log(`  Contributions: ${rep.contributions}`);
      if (rep.recentVotes.length > 0) {
        console.log(`\n  Recent votes:`);
        for (const v of rep.recentVotes) {
          const dir = v.vote > 0 ? c.green('+1') : c.red('-1');
          console.log(`    ${dir} ${c.bold(v.pattern_name || v.pattern_id)} (${v.language || '?'}) — weight: ${v.weight || 1.0}`);
        }
      }
    } else if (sub === 'top' || sub === 'leaderboard') {
      const limit = parseInt(args.limit) || 20;
      const voters = oracle.topVoters(limit);
      if (voters.length === 0) { console.log(c.dim('No voters yet.')); return; }
      console.log(c.boldCyan(`Top ${voters.length} contributors by reputation:\n`));
      for (const v of voters) {
        const repStr = colorScore(String(v.reputation));
        console.log(`  ${repStr} ${c.bold(v.id)} — votes: ${v.total_votes} | accurate: ${v.accurate_votes}`);
      }
    }
    return;
  }

  if (cmd === 'github' || cmd === 'gh-auth') {
    const { GitHubIdentity } = require('./auth/github-oauth');
    const sub = process.argv[3];
    const sqliteStore = oracle.store.getSQLiteStore();
    const ghIdentity = new GitHubIdentity({ store: sqliteStore });

    if (sub === 'verify') {
      const token = args.token || process.env.GITHUB_TOKEN;
      if (!token) {
        console.log(`${c.boldRed('Error:')} Provide --token <PAT> or set GITHUB_TOKEN env var`);
        process.exit(1);
      }
      ghIdentity.verifyToken(token).then((result) => {
        if (result.success) {
          console.log(`${c.boldGreen('✓')} Verified GitHub identity: ${c.bold(result.username)}`);
          console.log(`  Voter ID: ${c.cyan(result.voterId)}`);
          console.log(`  GitHub ID: ${result.githubId}`);
          console.log(`\n  ${c.dim('Your votes will now be linked to your GitHub identity.')}`);
        } else {
          console.log(`${c.boldRed('✗')} Verification failed: ${result.error}`);
        }
      });
      return;
    }

    if (sub === 'login') {
      ghIdentity.startDeviceFlow().then((result) => {
        if (result.error) {
          console.log(`${c.boldRed('Error:')} ${result.error}`);
          return;
        }
        console.log(`\n${c.boldCyan('GitHub Login')}\n`);
        console.log(`  1. Go to: ${c.bold(result.verificationUrl)}`);
        console.log(`  2. Enter code: ${c.boldGreen(result.userCode)}\n`);
        console.log(`  ${c.dim('Waiting for authorization...')}`);

        const poll = setInterval(async () => {
          const pollResult = await ghIdentity.pollDeviceFlow(result.deviceCode);
          if (pollResult.pending) return;
          clearInterval(poll);
          if (pollResult.success) {
            console.log(`\n${c.boldGreen('✓')} Logged in as ${c.bold(pollResult.username)}`);
            console.log(`  Voter ID: ${c.cyan(pollResult.voterId)}`);
          } else {
            console.log(`\n${c.boldRed('✗')} Login failed: ${pollResult.error}`);
          }
        }, (result.interval || 5) * 1000);

        // Timeout after expiry
        setTimeout(() => {
          clearInterval(poll);
          console.log(`\n${c.yellow('Login expired. Try again with:')} ${c.cyan('oracle github login')}`);
        }, (result.expiresIn || 900) * 1000);
      });
      return;
    }

    if (sub === 'status' || sub === 'identities') {
      const identities = ghIdentity.listIdentities(parseInt(args.limit) || 20);
      if (identities.length === 0) {
        console.log(c.dim('No verified GitHub identities.'));
        console.log(`${c.dim('Link your GitHub:')} ${c.cyan('oracle github verify --token <PAT>')}`);
        return;
      }
      console.log(`\n${c.boldCyan('Verified GitHub Identities')}\n`);
      for (const id of identities) {
        console.log(`  ${c.boldGreen('✓')} ${c.bold(id.github_username)} (${c.dim(id.voter_id)}) — ${id.contributions || 0} contributions`);
      }
      return;
    }

    if (sub === 'whoami') {
      const voter = args.voter || `github:${process.env.GITHUB_USER || process.env.USER || 'unknown'}`;
      const identity = ghIdentity.getIdentity(voter);
      if (identity) {
        console.log(`${c.boldGreen('✓')} ${c.bold(identity.github_username)}`);
        console.log(`  Voter ID: ${c.cyan(identity.voter_id)}`);
        console.log(`  Verified: ${c.dim(identity.verified_at)}`);
        console.log(`  Contributions: ${identity.contributions || 0}`);
      } else {
        console.log(c.dim('No linked GitHub identity found.'));
        console.log(`${c.dim('Verify with:')} ${c.cyan('oracle github verify --token <PAT>')}`);
      }
      return;
    }

    console.log(`${c.bold('GitHub Identity')}\n`);
    console.log(`  ${c.cyan('oracle github verify')} --token <PAT>   Verify GitHub PAT and link identity`);
    console.log(`  ${c.cyan('oracle github login')}                  OAuth device flow (browser-based)`);
    console.log(`  ${c.cyan('oracle github status')}                 List verified identities`);
    console.log(`  ${c.cyan('oracle github whoami')}                 Show your linked identity`);
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

  if (cmd === 'compose') {
    const { PatternComposer } = require('./patterns/composer');
    const composer = new PatternComposer(oracle);

    if (args.templates || args.template === 'list') {
      const templates = composer.templates();
      console.log(`${c.bold('Composition Templates:')}\n`);
      templates.forEach(t => {
        console.log(`  ${c.cyan(t.name)}: ${t.description}`);
        console.log(`    ${c.dim('Patterns:')} ${t.patterns.join(', ')}`);
      });
      return;
    }

    let result;
    const lang = args.language || 'javascript';
    const glue = args.glue || 'module';

    if (args.template) {
      const tmpl = composer.templates().find(t => t.name === args.template);
      if (!tmpl) { console.error(c.boldRed('Unknown template:') + ' ' + args.template); process.exit(1); }
      result = composer.compose({ patterns: tmpl.patterns, language: lang, glue });
    } else if (args.describe) {
      result = composer.composeFromDescription(args.describe, lang);
    } else if (args.patterns) {
      const patternNames = args.patterns.split(',').map(p => p.trim());
      result = composer.compose({ patterns: patternNames, language: lang, glue });
    } else {
      console.error(c.boldRed('Usage:') + ' oracle compose --patterns p1,p2 | --template name | --describe "..." [--language js] [--glue module|class|function]');
      process.exit(1);
    }

    console.log(`${c.boldGreen('Composed')} ${result.patterns.length} pattern(s):`);
    result.patterns.forEach(p => console.log(`  ${c.cyan('→')} ${p.name} (${p.language})`));
    console.log(`\n${result.code}`);
    return;
  }

  if (cmd === 'resolve') {
    const tags = args.tags ? args.tags.split(',').map(t => t.trim()) : [];
    const noHeal = args['no-heal'] || args.raw;
    const result = oracle.resolve({
      description: args.description || '',
      tags,
      language: args.language,
      minCoherency: parseFloat(args['min-coherency']) || undefined,
      heal: !noHeal,
    });
    console.log(`Decision: ${colorDecision(result.decision)}`);
    console.log(`Confidence: ${colorScore(result.confidence)}`);
    console.log(`Reasoning: ${c.dim(result.reasoning)}`);
    if (result.pattern) {
      console.log(`\nPattern: ${c.bold(result.pattern.name)} [${c.cyan(result.pattern.id)}]`);
      console.log(`Language: ${c.blue(result.pattern.language)} | Type: ${c.magenta(result.pattern.patternType)} | Coherency: ${colorScore(result.pattern.coherencyScore)}`);
      console.log(`Tags: ${(result.pattern.tags || []).map(t => c.magenta(t)).join(', ')}`);
      if (result.healing) {
        console.log(`\n${c.dim('── Healing ──')}`);
        console.log(`SERF: ${colorScore(result.healing.originalCoherence?.toFixed(3))} → ${colorScore(result.healing.finalCoherence?.toFixed(3))} (${result.healing.improvement >= 0 ? '+' : ''}${(result.healing.improvement || 0).toFixed(3)}) in ${result.healing.loops} loop(s)`);
        if (result.healing.healingPath?.length > 0) {
          console.log(`Path: ${c.dim(result.healing.healingPath.join(' → '))}`);
        }
      }
      console.log(`\n${c.dim('── Healed Code ──')}`);
      console.log(result.healedCode || result.pattern.code);
    }
    if (result.whisper) {
      console.log(`\n${c.dim('── Whisper from the Healed Future ──')}`);
      console.log(c.italic ? c.italic(result.whisper) : c.dim(result.whisper));
    }
    if (result.candidateNotes) {
      console.log(`\n${c.dim('── Why This One ──')}`);
      console.log(c.dim(result.candidateNotes));
    }
    if (result.alternatives?.length > 0) {
      console.log(`\n${c.dim('Alternatives:')} ${result.alternatives.map(a => `${c.cyan(a.name)}(${colorScore(a.composite?.toFixed(3))})`).join(', ')}`);
    }
    // Voice mode: speak the whisper via system TTS
    if (args.voice && result.whisper) {
      speakCLI(result.whisper);
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

  if (cmd === 'retag') {
    const sub = process.argv[3];
    const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;

    if (sub === 'all') {
      // Batch retag all patterns
      console.log(c.boldCyan('Auto-Tag All Patterns') + (dryRun ? c.yellow(' (dry run)') : '') + '\n');
      const report = oracle.retagAll({ dryRun });
      if (jsonOut) { console.log(JSON.stringify(report)); return; }
      console.log(`  Total patterns: ${c.bold(String(report.total))}`);
      console.log(`  Enriched:       ${c.boldGreen(String(report.enriched))}`);
      console.log(`  Tags added:     ${c.cyan(String(report.totalTagsAdded))}`);
      if (report.patterns.length > 0) {
        console.log(`\n  ${c.dim('Top enriched patterns:')}`);
        for (const p of report.patterns.slice(0, 20)) {
          console.log(`    ${c.bold(p.name)} ${c.dim('+')}${c.green(String(p.added.length))}: ${p.added.map(t => c.magenta(t)).join(', ')}`);
        }
      }
      if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));
      return;
    }

    // Single pattern retag
    if (!sub) { console.error(`Usage: ${c.cyan('oracle retag')} <pattern-id> | ${c.cyan('oracle retag all')}`); process.exit(1); }
    const result = oracle.retag(sub, { dryRun });
    if (jsonOut) { console.log(JSON.stringify(result)); return; }
    if (result.error) { console.error(c.boldRed(result.error)); process.exit(1); }
    console.log(`${c.boldCyan('Auto-Tag:')} ${c.bold(result.name)} [${c.cyan(result.id)}]`);
    console.log(`  Old tags: ${result.oldTags.map(t => c.dim(t)).join(', ') || c.dim('(none)')}`);
    console.log(`  New tags: ${result.newTags.map(t => c.magenta(t)).join(', ')}`);
    console.log(`  Added:    ${result.added.length > 0 ? result.added.map(t => c.green('+' + t)).join(', ') : c.dim('(no new tags)')}`);
    if (dryRun) console.log(c.yellow('\n(dry run — no changes made)'));
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
    const { seedLibrary, seedNativeLibrary } = require('./patterns/seeds');
    const results = seedLibrary(oracle);
    console.log(`Core seeds: ${c.boldGreen(String(results.registered))} registered (${c.dim(results.skipped + ' skipped')}, ${results.failed > 0 ? c.boldRed(String(results.failed)) : c.dim(String(results.failed))} failed)`);

    const { seedExtendedLibrary } = require('./patterns/seeds-extended');
    const ext = seedExtendedLibrary(oracle, { verbose: !!args.verbose });
    console.log(`Extended seeds: ${c.boldGreen(String(ext.registered))} registered (${c.dim(ext.skipped + ' skipped')}, ${ext.failed > 0 ? c.boldRed(String(ext.failed)) : c.dim(String(ext.failed))} failed)`);

    const native = seedNativeLibrary(oracle, { verbose: !!args.verbose });
    console.log(`Native seeds (Python/Go/Rust): ${c.boldGreen(String(native.registered))} registered (${c.dim(native.skipped + ' skipped')}, ${native.failed > 0 ? c.boldRed(String(native.failed)) : c.dim(String(native.failed))} failed)`);

    const { seedProductionLibrary3 } = require('./patterns/seeds-production-3');
    const prod3 = seedProductionLibrary3(oracle, { verbose: !!args.verbose });
    console.log(`Production seeds 3 (pagination/command/cron/proxy/pool/stream): ${c.boldGreen(String(prod3.registered))} registered (${c.dim(prod3.skipped + ' skipped')}, ${prod3.failed > 0 ? c.boldRed(String(prod3.failed)) : c.dim(String(prod3.failed))} failed)`);

    const { seedProductionLibrary4 } = require('./patterns/seeds-production-4');
    const prod4 = seedProductionLibrary4(oracle, { verbose: !!args.verbose });
    console.log(`Production seeds 4 (coherence/solana/whisper/lsh/remembrance/reflection/covenant/healing/intent/axiom): ${c.boldGreen(String(prod4.registered))} registered (${c.dim(prod4.skipped + ' skipped')}, ${prod4.failed > 0 ? c.boldRed(String(prod4.failed)) : c.dim(String(prod4.failed))} failed)`);

    const total = results.registered + ext.registered + native.registered + prod3.registered + prod4.registered;
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

    // Smart auto-promote: coherency + covenant + sandbox + confidence gates
    if (id === 'smart') {
      const minCoherency = parseFloat(args['min-coherency']) || 0.9;
      const minConfidence = parseFloat(args['min-confidence']) || 0.8;
      const dryRun = args['dry-run'] === 'true' || args['dry-run'] === true;
      const override = args['override'] === 'true' || args['override'] === true;
      const result = oracle.smartAutoPromote({ minCoherency, minConfidence, dryRun, manualOverride: override });
      console.log(c.boldCyan('Smart Auto-Promote Results:\n'));
      console.log(`  Total candidates: ${c.bold(String(result.total))}`);
      console.log(`  Promoted:         ${c.boldGreen(String(result.promoted))}`);
      console.log(`  Skipped:          ${c.dim(String(result.skipped))}`);
      console.log(`  Vetoed:           ${result.vetoed > 0 ? c.boldRed(String(result.vetoed)) : c.dim('0')}`);
      if (dryRun) console.log(`  ${c.yellow('(dry run — no changes made)')}`);
      for (const d of result.details) {
        const icon = d.status === 'promoted' || d.status === 'would-promote' ? c.green('+') : d.status === 'vetoed' ? c.red('x') : c.dim('-');
        console.log(`  ${icon} ${c.bold(d.name)} — ${d.status}${d.reason ? ' (' + d.reason.slice(0, 80) + ')' : ''}${d.coherency ? ' [' + colorScore(d.coherency) + ']' : ''}`);
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

  if (cmd === 'repos') {
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
    // Default: list registered repos
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
    return;
  }

  if (cmd === 'cross-search' || cmd === 'xsearch') {
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

  if (cmd === 'mcp-install' || cmd === 'install-mcp') {
    const { installAll, uninstallAll, checkInstallation, installTo, uninstallFrom, getConfigPaths } = require('./ide/mcp-install');
    const sub = process.argv[3];

    if (sub === 'status' || sub === 'check') {
      const status = checkInstallation();
      console.log(`\n${c.boldCyan('MCP Installation Status')}\n`);
      for (const [editor, info] of Object.entries(status)) {
        const icon = info.installed ? c.boldGreen('✓') : c.dim('○');
        console.log(`  ${icon} ${c.bold(editor.padEnd(16))} ${info.installed ? 'installed' : 'not installed'}`);
        console.log(`    ${c.dim(info.path)}`);
      }
      return;
    }

    if (sub === 'remove' || sub === 'uninstall') {
      const target = process.argv[4];
      if (target) {
        const result = uninstallFrom(target);
        console.log(result.success ? `${c.green('✓')} Removed from ${c.bold(target)}` : `${c.red('✗')} ${result.error}`);
      } else {
        const results = uninstallAll();
        console.log(`\n${c.boldCyan('MCP Uninstall Results')}\n`);
        for (const [editor, result] of Object.entries(results)) {
          if (result.skipped) continue;
          const icon = result.success ? c.green('✓') : c.red('✗');
          console.log(`  ${icon} ${c.bold(editor)}: ${result.success ? 'removed' : result.error}`);
        }
      }
      return;
    }

    // Default: install to all
    const target = sub && sub !== 'all' ? sub : null;
    const useNpx = args.npx || false;
    const opts = useNpx ? { command: 'npx' } : {};

    if (target) {
      const result = installTo(target, opts);
      if (result.success) {
        console.log(`${c.green('✓')} Registered MCP server in ${c.bold(target)}`);
        console.log(`  ${c.dim(result.path)}`);
      } else {
        console.log(`${c.red('✗')} Failed: ${result.error}`);
      }
    } else {
      const results = installAll(opts);
      console.log(`\n${c.boldCyan('MCP Auto-Registration Results')}\n`);
      let installed = 0;
      for (const [editor, result] of Object.entries(results)) {
        const icon = result.success ? c.green('✓') : c.red('✗');
        console.log(`  ${icon} ${c.bold(editor.padEnd(16))} ${result.success ? c.dim(result.path) : result.error}`);
        if (result.success) installed++;
      }
      console.log(`\n  ${c.boldGreen(installed + ' editors configured.')}`);
      console.log(`  ${c.dim('Restart your editor to activate the oracle MCP server.')}`);
    }
    return;
  }

  if (cmd === 'plugin') {
    const { PluginManager } = require('./plugins/manager');
    const pm = new PluginManager(oracle, { pluginDir: path.join(process.cwd(), '.remembrance', 'plugins') });
    const sub = process.argv[3];

    if (sub === 'load') {
      const pluginPath = process.argv[4];
      if (!pluginPath) { console.error(c.boldRed('Error:') + ' provide a plugin path'); process.exit(1); }
      try {
        const manifest = pm.load(pluginPath);
        console.log(`${c.green('\u2713')} Loaded plugin ${c.bold(manifest.name)} v${manifest.version}`);
        if (manifest.description) console.log(`  ${c.dim(manifest.description)}`);
      } catch (e) {
        console.error(`${c.red('\u2717')} ${e.message}`);
      }
    } else if (sub === 'list') {
      const list = pm.list();
      if (list.length === 0) {
        console.log(c.dim('No plugins loaded'));
      } else {
        console.log(`\n${c.boldCyan('Loaded Plugins')}\n`);
        for (const p of list) {
          const status = p.enabled ? c.green('enabled') : c.dim('disabled');
          console.log(`  ${c.bold(p.name)} v${p.version} [${status}]`);
          if (p.description) console.log(`    ${c.dim(p.description)}`);
        }
      }
    } else if (sub === 'unload') {
      const name = process.argv[4];
      if (!name) { console.error(c.boldRed('Error:') + ' provide plugin name'); process.exit(1); }
      try {
        pm.unload(name);
        console.log(`${c.green('\u2713')} Unloaded plugin ${c.bold(name)}`);
      } catch (e) {
        console.error(`${c.red('\u2717')} ${e.message}`);
      }
    } else {
      console.log(`\n${c.boldCyan('Plugin Commands')}\n`);
      console.log(`  ${c.cyan('oracle plugin load <path>')}   — Load a plugin`);
      console.log(`  ${c.cyan('oracle plugin list')}          — List loaded plugins`);
      console.log(`  ${c.cyan('oracle plugin unload <name>')} — Unload a plugin`);
    }
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

  if (cmd === 'rollback') {
    const id = args.id || process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle rollback')} <pattern-id> [--version <n>]`); process.exit(1); }
    const version = parseInt(args.version) || undefined;
    const result = oracle.rollback(id, version);
    if (result.success) {
      console.log(`${c.boldGreen('Rolled back:')} ${c.bold(result.patternName)} → v${result.restoredVersion}`);
      console.log(`  Previous version: v${result.previousVersion}`);
      console.log(`  Code restored (${result.restoredCode.split('\n').length} lines)`);
    } else {
      console.log(`${c.boldRed('Rollback failed:')} ${result.reason}`);
    }
    return;
  }

  if (cmd === 'verify') {
    const id = args.id || process.argv[3];
    if (!id) { console.error(`Usage: ${c.cyan('oracle verify')} <pattern-id>`); process.exit(1); }
    const result = oracle.verifyOrRollback(id);
    if (result.passed) {
      console.log(`${c.boldGreen('Verified:')} ${c.bold(result.patternName || id)} — tests pass`);
    } else {
      console.log(`${c.boldRed('Failed:')} ${c.bold(result.patternName || id)} — tests broke`);
      if (result.rolledBack) {
        console.log(`  ${c.yellow('Auto-rolled back')} to v${result.restoredVersion}`);
      }
    }
    return;
  }

  if (cmd === 'healing-stats') {
    const stats = oracle.healingStats();
    console.log(c.boldCyan('Healing Success Rates:\n'));
    console.log(`  Tracked patterns: ${c.bold(String(stats.patterns))}`);
    console.log(`  Total attempts:   ${c.bold(String(stats.totalAttempts))}`);
    console.log(`  Total successes:  ${c.boldGreen(String(stats.totalSuccesses))}`);
    console.log(`  Overall rate:     ${colorScore(stats.overallRate)}`);
    if (stats.details.length > 0) {
      console.log('');
      for (const d of stats.details) {
        const icon = parseFloat(d.rate) >= 0.8 ? c.green('●') : parseFloat(d.rate) >= 0.5 ? c.yellow('●') : c.red('●');
        console.log(`  ${icon} ${c.bold(d.name)} — ${d.successes}/${d.attempts} (${colorScore(d.rate)})`);
      }
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

  if (cmd === 'security-scan' || cmd === 'scan') {
    const id = args.id || process.argv[3];
    if (!id && !args.file) { console.error(`Usage: ${c.cyan('oracle security-scan')} <pattern-id> or --file <code.js>`); process.exit(1); }
    let target = id;
    if (args.file) target = fs.readFileSync(path.resolve(args.file), 'utf-8');
    const external = args.external === 'true' || args.external === true;
    const result = oracle.securityScan(target, { language: args.language, runExternalTools: external });
    if (result.passed) {
      console.log(`${c.boldGreen('PASSED')}${result.patternName ? ` — ${c.bold(result.patternName)}` : ''}`);
    } else {
      console.log(`${c.boldRed('VETOED')}${result.patternName ? ` — ${c.bold(result.patternName)}` : ''}`);
    }
    console.log(`  Covenant: ${result.covenant.sealed ? c.green('sealed') : c.red('broken')} (${result.covenant.principlesPassed}/15)`);
    if (result.deepFindings.length > 0) {
      console.log(`  Deep findings: ${c.yellow(String(result.deepFindings.length))}`);
      for (const f of result.deepFindings) {
        const sev = f.severity === 'high' ? c.red(f.severity) : f.severity === 'medium' ? c.yellow(f.severity) : c.dim(f.severity);
        console.log(`    [${sev}] ${f.reason}`);
      }
    }
    if (result.externalTools.length > 0) {
      console.log(`  External tools: ${c.yellow(String(result.externalTools.length))}`);
      for (const f of result.externalTools) console.log(`    [${f.tool}] ${f.reason}`);
    }
    console.log(`\n${c.dim('Whisper:')} ${result.whisper}`);
    return;
  }

  if (cmd === 'transpile') {
    const { transpile: astTranspile } = require('./core/ast-transpiler');
    const targetLang = process.argv[3];
    const filePath = args.file || process.argv[4];
    if (!targetLang || !filePath) {
      console.log(`Usage: oracle transpile <language> --file <code.js>`);
      console.log(`  Languages: python, typescript, go, rust`);
      return;
    }
    const fs = require('fs');
    const code = fs.readFileSync(filePath, 'utf-8');
    const result = astTranspile(code, targetLang);
    if (result.success) {
      console.log(c.boldGreen(`Transpiled to ${targetLang} (AST-based):\n`));
      console.log(result.code);
      if (result.imports && result.imports.length > 0) {
        console.log(c.dim(`\nImports detected: ${result.imports.join(', ')}`));
      }
    } else {
      console.error(c.red(`Transpile failed: ${result.error}`));
    }
    return;
  }

  if (cmd === 'verify-transpile' || cmd === 'vtranspile') {
    const { transpile: astTranspile, generateGoTest, generateRustTest, verifyTranspilation } = require('./core/ast-transpiler');
    const targetLang = process.argv[3];
    const filePath = args.file || process.argv[4];
    if (!targetLang || !filePath) {
      console.log(`Usage: oracle verify-transpile <language> --file <code.js> [--test <test.js>]`);
      console.log(`  Languages: go, rust`);
      return;
    }
    const fs = require('fs');
    const code = fs.readFileSync(filePath, 'utf-8');
    const jsTestCode = args.test ? fs.readFileSync(args.test, 'utf-8') : null;
    const result = astTranspile(code, targetLang);
    if (!result.success) { console.error(c.red(`Transpile failed: ${result.error}`)); return; }

    console.log(c.boldGreen(`Transpiled to ${targetLang}:\n`));
    console.log(result.code);

    // Generate test code
    const funcMatch = code.match(/function\s+(\w+)/);
    const funcName = funcMatch ? funcMatch[1] : 'unknown';
    let testCode = null;
    if (jsTestCode) {
      testCode = targetLang === 'go' ? generateGoTest(result.code, jsTestCode, funcName) : generateRustTest(result.code, jsTestCode, funcName);
    }
    if (testCode) {
      console.log(c.boldCyan(`\nGenerated ${targetLang} test:\n`));
      console.log(testCode);
    }

    // Verify compilation
    if (testCode) {
      console.log(c.dim('\nVerifying compilation...'));
      const check = verifyTranspilation(result.code, testCode, targetLang);
      if (check.compiled) {
        console.log(c.boldGreen('Compilation verified! Tests passed.'));
      } else {
        console.log(c.boldRed('Compilation failed:'));
        console.log(c.dim(check.output.slice(0, 500)));
      }
    }
    return;
  }

  if (cmd === 'context' || cmd === 'export-context') {
    const format = args.format || process.argv[3] || 'markdown';
    const maxPatterns = parseInt(args.limit) || 50;
    const includeCode = args.code === 'true' || args.code === true;
    const output = args.output || args.file;

    const ctx = oracle.generateContext({ format, maxPatterns, includeCode });
    if (output) {
      const fs = require('fs');
      fs.writeFileSync(output, ctx.prompt, 'utf-8');
      console.log(c.boldGreen(`Context exported to ${c.bold(output)}`));
      console.log(`  Format: ${format} | Patterns: ${ctx.stats.totalPatterns} | Languages: ${Object.keys(ctx.stats.byLanguage).join(', ')}`);
    } else {
      console.log(ctx.prompt);
    }
    return;
  }

  if (cmd === 'security-audit') {
    const external = args.external === 'true' || args.external === true;
    const result = oracle.securityAudit({ runExternalTools: external });
    console.log(c.boldCyan('Security Audit Report:\n'));
    console.log(`  Scanned:  ${c.bold(String(result.scanned))}`);
    console.log(`  Clean:    ${c.boldGreen(String(result.clean))}`);
    console.log(`  Advisory: ${result.advisory > 0 ? c.yellow(String(result.advisory)) : c.dim('0')}`);
    console.log(`  Vetoed:   ${result.vetoed > 0 ? c.boldRed(String(result.vetoed)) : c.dim('0')}`);
    if (result.details.length > 0) {
      console.log('');
      for (const d of result.details) {
        const icon = d.status === 'vetoed' ? c.red('x') : c.yellow('!');
        console.log(`  ${icon} ${c.bold(d.name)} — ${d.status} (${d.findings} finding${d.findings !== 1 ? 's' : ''})${d.whisper ? '\n    ' + c.dim(d.whisper) : ''}`);
      }
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

  // ─── Open Source Registry Commands ───

  if (cmd === 'registry') {
    const sub = process.argv[3];
    const {
      listRegistry, searchRegistry, getRegistryEntry, batchImport,
      discoverReposSync, checkLicense, getProvenance, findDuplicates,
    } = require('./ci/open-source-registry');

    if (!sub || sub === 'help') {
      console.log(`
${c.boldCyan('Open Source Registry')} — import proven patterns from curated repositories

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
      if (jsonOut) { console.log(JSON.stringify(repos)); return; }
      console.log(`\n${c.boldCyan('Curated Open Source Repos')} (${repos.length} repos)\n`);
      for (const r of repos) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue(r.language.padEnd(12));
        const lic = c.dim(r.license.padEnd(14));
        console.log(`  ${stars} ${c.green('★')}  ${lang} ${c.bold(r.name.padEnd(25))} ${lic} ${c.dim(r.description.slice(0, 60))}`);
      }
      console.log(`\n${c.dim('Filter: --language <lang> --topic <topic>')}`);
      return;
    }

    if (sub === 'search') {
      const query = process.argv[4];
      if (!query) { console.error(c.boldRed('Error:') + ' provide a search query'); process.exit(1); }
      const results = searchRegistry(query, { language: args.language, limit: parseInt(args.limit) || 10 });
      if (jsonOut) { console.log(JSON.stringify(results)); return; }
      if (results.length === 0) {
        console.log(c.yellow('\nNo repos found matching: ') + c.bold(query));
        return;
      }
      console.log(`\n${c.boldCyan('Registry Search:')} ${c.bold(query)} (${results.length} results)\n`);
      for (const r of results) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue(r.language.padEnd(12));
        const scoreBar = c.green('█'.repeat(Math.min(r.score, 10)));
        console.log(`  ${stars} ${c.green('★')}  ${lang} ${c.bold(r.name.padEnd(25))} ${scoreBar} ${c.dim(r.description.slice(0, 50))}`);
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
        console.error(c.boldRed('License blocked:') + ` ${entry.license} — ${licCheck.reason}`);
        console.error(c.dim('Use --allow-copyleft to override'));
        process.exit(1);
      }

      console.log(`\n${c.boldCyan('Registry Import:')} ${c.bold(entry.name)}`);
      console.log(`  ${c.dim('URL:')}     ${entry.url}`);
      console.log(`  ${c.dim('License:')} ${licCheck.allowed ? c.green(entry.license) : c.yellow(entry.license)} (${licCheck.category})`);
      console.log(`  ${c.dim('Lang:')}    ${c.blue(entry.language)}`);
      if (dryRun) console.log(`  ${c.dim('(dry run — no changes)')}`);
      console.log('');

      try {
        const result = batchImport(oracle, [name], {
          language: args.language,
          dryRun,
          splitMode: args.split || 'file',
          maxFiles: parseInt(args['max-files']) || 200,
          skipLicenseCheck: true, // already checked above
        });
        const r = result.results[0];
        if (r.status === 'success') {
          console.log(`  ${c.boldGreen('✓')} Harvested: ${c.bold(String(r.harvested))}  Registered: ${c.boldGreen(String(r.registered))}  Skipped: ${c.yellow(String(r.skipped))}`);
        } else {
          console.log(`  ${c.boldRed('✗')} ${r.reason}`);
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

      console.log(`\n${c.boldCyan('Batch Import')} — ${repos.length} repos${language ? ' (' + c.blue(language) + ')' : ''}`);
      if (dryRun) console.log(c.dim('(dry run — no changes)\n'));
      else console.log('');

      const names = repos.map(r => r.name);
      const result = batchImport(oracle, names, {
        language: args.language,
        dryRun,
        splitMode: args.split || 'file',
        maxFiles: parseInt(args['max-files']) || 100,
      });

      for (const r of result.results) {
        const icon = r.status === 'success' ? c.green('✓') : r.status === 'skipped' ? c.yellow('○') : c.red('✗');
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

      if (jsonOut) { console.log(JSON.stringify(repos)); return; }
      if (repos.length === 0) {
        console.log(c.yellow('No repos found on GitHub for: ') + c.bold(query));
        return;
      }

      console.log(`\n${c.boldCyan('GitHub Discovery:')} ${c.bold(query)} (${repos.length} results)\n`);
      for (const r of repos) {
        const stars = c.yellow(String(r.stars).padStart(7));
        const lang = c.blue((r.language || 'unknown').padEnd(12));
        const lic = r.license !== 'unknown' ? c.dim(r.license) : c.red('no license');
        console.log(`  ${stars} ${c.green('★')}  ${lang} ${c.bold(r.name.padEnd(25))} ${lic}`);
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
      if (jsonOut) { console.log(JSON.stringify(result)); return; }
      const icon = result.allowed ? c.boldGreen('✓ ALLOWED') : c.boldRed('✗ BLOCKED');
      console.log(`\n  ${icon}  ${c.bold(spdx)}`);
      console.log(`  Category: ${c.cyan(result.category)}`);
      console.log(`  ${c.dim(result.reason)}\n`);
      return;
    }

    if (sub === 'provenance') {
      const patterns = getProvenance(oracle, { source: args.source, license: args.license });
      if (jsonOut) { console.log(JSON.stringify(patterns)); return; }
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
        console.log(`  ${c.bold(source)} (${c.dim(lic)}) — ${pats.length} patterns`);
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
      if (jsonOut) { console.log(JSON.stringify(dupes)); return; }
      if (dupes.length === 0) {
        console.log(c.boldGreen('\n  ✓ No duplicates found\n'));
        return;
      }
      console.log(`\n${c.boldCyan('Duplicate Patterns')} (${dupes.length} pairs)\n`);
      for (const d of dupes.slice(0, 30)) {
        const simColor = d.similarity >= 0.95 ? c.red : c.yellow;
        const typeIcon = d.type === 'exact' ? c.red('EXACT') : c.yellow('NEAR');
        console.log(`  ${typeIcon}  ${simColor((d.similarity * 100).toFixed(0) + '%')}  ${c.bold(d.pattern1.name)} ${c.dim('↔')} ${c.bold(d.pattern2.name)}`);
      }
      if (dupes.length > 30) console.log(c.dim(`  ... and ${dupes.length - 30} more`));
      console.log(`\n${c.dim('Tip: use oracle deep-clean to remove duplicates')}`);
      return;
    }

    console.error(`${c.boldRed('Unknown registry subcommand:')} ${sub}. Run ${c.cyan('oracle registry help')} for usage.`);
    process.exit(1);
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

  if (cmd === 'remote') {
    const sub = process.argv[3];
    if (sub === 'add') {
      const url = process.argv[4] || args.url;
      if (!url) { console.error(`Usage: ${c.cyan('oracle remote add')} <url> [--name <name>] [--token <jwt>]`); process.exit(1); }
      const { registerRemote } = require('./cloud/client');
      const result = registerRemote(url, { name: args.name, token: args.token });
      console.log(`${c.boldGreen('Remote registered:')} ${c.bold(result.name)} — ${c.cyan(result.url)}`);
      console.log(`  Total remotes: ${result.totalRemotes}`);
      return;
    }
    if (sub === 'remove') {
      const target = process.argv[4] || args.url || args.name;
      if (!target) { console.error(`Usage: ${c.cyan('oracle remote remove')} <url-or-name>`); process.exit(1); }
      const { removeRemote } = require('./cloud/client');
      const result = removeRemote(target);
      if (result.removed) console.log(c.boldGreen('Remote removed.'));
      else console.log(c.red(result.error));
      return;
    }
    if (sub === 'health') {
      const { checkRemoteHealth } = require('./cloud/client');
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
    // Default: list remotes
    const { listRemotes } = require('./cloud/client');
    const remotes = listRemotes();
    if (remotes.length === 0) {
      console.log(c.dim('No remotes configured. Use ') + c.cyan('oracle remote add <url>'));
      return;
    }
    console.log(c.boldCyan(`Remote Oracle Servers (${remotes.length}):\n`));
    for (const r of remotes) {
      console.log(`  ${c.bold(r.name)} — ${c.cyan(r.url)} ${r.token ? c.dim('(authenticated)') : c.dim('(no token)')}`);
    }
    return;
  }

  if (cmd === 'cloud') {
    const { CloudSyncServer } = require('./cloud/server');
    const sub = process.argv[3];
    if (sub === 'start' || sub === 'serve') {
      const port = parseInt(args.port) || 3579;
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
        console.log(`    ${c.cyan('POST /api/reflect')}      — SERF reflection loop`);
        console.log(`    ${c.cyan('POST /api/covenant')}     — Covenant check`);
        console.log(`    ${c.cyan('GET  /api/analytics')}    — Analytics report`);
        console.log(`    ${c.cyan('WS   /ws')}               — Real-time sync channel`);
        console.log(`\n  ${c.dim('Other clients can connect with:')} ${c.cyan('oracle remote add http://<ip>:' + p)}`);
      });
      return;
    }
    if (sub === 'status') {
      const { checkRemoteHealth } = require('./cloud/client');
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
      console.log(`  ${c.dim('Generated:')} ${result.generated}  ${c.dim('Stored:')} ${result.stored}  ${c.dim('Promoted:')} ${result.promoted || 0}`);
      if (result.details?.length > 0 && result.details[0]?.name) {
        result.details.forEach(d => {
          const badge = d.promoted ? c.boldGreen('proven') : c.yellow('candidate');
          console.log(`  ${c.cyan('→')} ${d.name} (${d.method}) [${badge}]`);
        });
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
