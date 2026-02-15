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
const { generateHelp } = require('./cli/registry');

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

  const handler = handlers[cmd];
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
