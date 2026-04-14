#!/usr/bin/env node

/**
 * CLI for the Remembrance Oracle.
 *
 * @oracle-infrastructure
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

// Suppress the `node:sqlite` ExperimentalWarning that prints on every
// CLI invocation. We opt in to the experimental feature knowingly; the
// banner just clutters script output. `ORACLE_SHOW_WARNINGS=1` keeps
// the default Node behavior for anyone debugging Node itself.
if (!process.env.ORACLE_SHOW_WARNINGS) {
  const _origEmit = process.emit;
  process.emit = function (name, data, ...rest) {
    if (
      name === 'warning'
      && data
      && data.name === 'ExperimentalWarning'
      && typeof data.message === 'string'
      && data.message.includes('SQLite')
    ) {
      return false;
    }
    return _origEmit.call(this, name, data, ...rest);
  };
}

const fs = require('fs');
const path = require('path');
const { safePath } = require('./core/safe-path');
const { RemembranceOracle } = require('./api/oracle');
const { c } = require('./cli/colors');
const { generateHelp } = require('./cli/registry');
const { warnDeprecation, getDeprecation } = require('./cli/deprecations');
const { runPreflight, printPreflightWarnings, shouldBypass } = require('./core/preflight');

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
const { registerSwarmCommands } = require('./cli/commands/swarm');
const { registerReflectorCommands } = require('./cli/commands/reflector');
const { registerChromaDBCommands } = require('./cli/commands/chromadb');
const { registerFractalCommands } = require('./cli/commands/fractals');

const oracle = new RemembranceOracle({ autoSync: true });

/**
 * Speak text via system TTS (espeak on Linux, say on macOS).
 * Non-blocking — fire-and-forget.
 */
function speakCLI(text) {
  try {
    const { platform } = require('os');
    const { execFile } = require('child_process');
    const safeText = String(text).slice(0, 200);
    if (platform() === 'darwin') {
      execFile('say', ['-r', '180', safeText], { timeout: 10000 }, () => {});
    } else {
      execFile('espeak', ['-s', '150', safeText], { timeout: 10000 }, () => {});
    }
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[cli:speakCLI] TTS not available — silent fallback:', e?.message || e);
  }
}

function parseArgs(args) {
  const parsed = { _command: args[0], _positional: [], _all: args };
  for (let i = 1; i < args.length; i++) {
    if (args[i].startsWith('--')) {
      const key = args[i].slice(2);
      const val = args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : true;
      parsed[key] = val;
      if (val !== true) i++;
    } else {
      parsed._positional.push(args[i]);
    }
  }
  // Convenience: first positional arg is the sub-command for multi-level commands
  parsed._sub = parsed._positional[0] || null;
  parsed._rest = parsed._positional.join(' ');
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
  } catch (e) {
    if (process.env.ORACLE_DEBUG) console.warn('[cli:readStdin] returning empty string on error:', e?.message || e);
    return '';
  }
}

/**
 * Get code from --file flag or stdin pipe.
 * Pipe takes precedence when no --file is given.
 */
function getCode(args) {
  if (args.file) {
    const filePath = safePath(args.file, process.cwd());
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
  const resolved = safePath(filePath, process.cwd());
  if (!fs.existsSync(resolved)) {
    console.error(`Error: ${label || 'File'} not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, 'utf-8');
}

function showHelp() {
  console.log(generateHelp(c));
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const cmd = args._command;
  const jsonOutFn = () => args.json === true;

  if (!cmd || cmd === 'help') {
    showHelp();
    return;
  }

  // Preflight check — warn if hooks not installed or sync is stale
  if (!shouldBypass(cmd)) {
    const preflight = runPreflight(process.cwd());
    if (!preflight.ok) {
      printPreflightWarnings(preflight.warnings, c);
    }
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
  registerSwarmCommands(handlers, context);
  registerReflectorCommands(handlers, context);
  registerChromaDBCommands(handlers, context);
  registerFractalCommands(handlers, context);

  // Check for deprecated commands and warn
  let effectiveCmd = cmd;
  const dep = getDeprecation(cmd);
  if (dep) {
    warnDeprecation(cmd);
    // Use canonical command's base name for handler lookup
    effectiveCmd = dep.canonical.split(' ')[0];
  }

  const handler = handlers[effectiveCmd] || handlers[cmd];
  if (handler) {
    try {
      await handler(args);
    } catch (err) {
      console.error(`${c.boldRed('Error:')} ${err.message || err}`);
      if (process.env.ORACLE_DEBUG) console.error(err.stack);
      process.exit(1);
    }
  } else {
    console.error(`${c.boldRed('Unknown command:')} ${cmd}`);
    console.error(`Run ${c.cyan('oracle help')} for available commands.`);
    process.exit(1);
  }
}

main();
