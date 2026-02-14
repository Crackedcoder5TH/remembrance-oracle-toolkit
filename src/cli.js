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
const { c } = require('./cli/colors');

// Command module registrations
const { registerCoreCommands } = require('./cli/commands/core');
const { registerLibraryCommands } = require('./cli/commands/library');
const { registerQualityCommands } = require('./cli/commands/quality');
const { registerVotingCommands } = require('./cli/commands/voting');
const { registerFederationCommands } = require('./cli/commands/federation');
const { registerVersioningCommands } = require('./cli/commands/versioning');
const { registerDebugCommands } = require('./cli/commands/debug');
const { registerTranspileCommands } = require('./cli/commands/transpile');
const { registerIntegrationCommands } = require('./cli/commands/integration');
const { registerAdminCommands } = require('./cli/commands/admin');
const { registerSelfManageCommands } = require('./cli/commands/self-manage');
const { registerPlatformCommands } = require('./cli/commands/platform');

const oracle = new RemembranceOracle({ autoSync: true });

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

function showHelp() {
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
  ${c.cyan('reflect')}       reflection loop — heal and refine code
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

${c.bold('Self-Management:')}
  ${c.cyan('maintain')}      Full maintenance cycle: heal, promote, optimize, evolve
  ${c.cyan('lifecycle')}     Always-on lifecycle engine (start, stop, status, run)

${c.bold('Debug:')}
  ${c.cyan('debug')}         Debug oracle — capture/search/grow error→fix patterns
  ${c.cyan('reliability')}   Pattern reliability statistics

${c.bold('Integration:')}
  ${c.cyan('mcp')}           Start MCP server (20 tools, JSON-RPC over stdio)
  ${c.cyan('mcp-install')}   Auto-register MCP in AI editors (Claude, Cursor, VS Code)
  ${c.cyan('setup')}         Initialize oracle in current project (alias: init)
  ${c.cyan('dashboard')}     Start web dashboard (default port 3333)
  ${c.cyan('deploy')}        Start production-ready server (configurable via env vars)
  ${c.cyan('hooks')}         Install/uninstall git hooks
  ${c.cyan('plugin')}        Manage plugins (load, list, unload)

${c.bold('Platform:')}
  ${c.cyan('billing')}       Stripe billing — plans, subscriptions, webhook server
  ${c.cyan('landing')}       Marketing landing page server
  ${c.cyan('github-app')}    GitHub App — webhook server, PR analysis, covenant checks

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
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._command;
  const jsonOutFn = () => args.json === true;

  if (!cmd || cmd === 'help') {
    showHelp();
    return;
  }

  // Build the command registry
  const handlers = {};
  const context = { oracle, getCode, readFile, speakCLI, jsonOut: jsonOutFn };

  registerCoreCommands(handlers, context);
  registerLibraryCommands(handlers, context);
  registerQualityCommands(handlers, context);
  registerVotingCommands(handlers, context);
  registerFederationCommands(handlers, context);
  registerVersioningCommands(handlers, context);
  registerDebugCommands(handlers, context);
  registerTranspileCommands(handlers, context);
  registerIntegrationCommands(handlers, context);
  registerAdminCommands(handlers, context);
  registerSelfManageCommands(handlers, context);
  registerPlatformCommands(handlers, context);

  const handler = handlers[cmd];
  if (handler) {
    handler(args);
  } else {
    console.error(`${c.boldRed('Unknown command:')} ${cmd}`);
    console.error(`Run ${c.cyan('oracle help')} for available commands.`);
    process.exit(1);
  }
}

main();
