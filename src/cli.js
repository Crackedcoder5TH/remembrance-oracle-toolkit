#!/usr/bin/env node

/**
 * CLI for the Remembrance Oracle.
 *
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
const { registerVoidCommands } = require('./cli/commands/void');
const { registerFractalCommands } = require('./cli/commands/fractals');
const { registerReasoningCommands } = require('./cli/commands/reasoning');
const { registerMeditationCommands } = require('./cli/commands/meditation');
const { registerVoidStoreCommands } = require('./cli/commands/void-store');
const { registerOnboardCommands } = require('./cli/commands/onboard');
const { registerVerifyCommands } = require('./cli/commands/verify');

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
speakCLI.atomicProperties = { charge: 0, valence: 2, mass: "medium", spin: "odd", phase: "gas", reactivity: "low", electronegativity: 1, group: 9, period: 2, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };

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
parseArgs.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "even", phase: "liquid", reactivity: "inert", electronegativity: 0, group: 2, period: 3, harmPotential: "minimal", alignment: "neutral", intention: "neutral", domain: "utility" };

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
readStdin.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 0, group: 6, period: 2, harmPotential: "none", alignment: "neutral", intention: "neutral", domain: "utility" };

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
getCode.atomicProperties = { charge: 0, valence: 0, mass: "medium", spin: "odd", phase: "gas", reactivity: "high", electronegativity: 0, group: 3, period: 2, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };

function readFile(filePath, label) {
  const resolved = safePath(filePath, process.cwd());
  if (!fs.existsSync(resolved)) {
    console.error(`Error: ${label || 'File'} not found: ${filePath}`);
    process.exit(1);
  }
  return fs.readFileSync(resolved, 'utf-8');
}
readFile.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "medium", electronegativity: 0, group: 6, period: 2, harmPotential: "dangerous", alignment: "neutral", intention: "neutral", domain: "utility" };

function showHelp() {
  console.log(generateHelp(c));
}
showHelp.atomicProperties = { charge: 0, valence: 0, mass: "light", spin: "odd", phase: "gas", reactivity: "inert", electronegativity: 0, group: 11, period: 1, harmPotential: "none", alignment: "neutral", intention: "benevolent", domain: "utility" };

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
  registerVoidCommands(handlers, context);
  registerFractalCommands(handlers, context);
  registerReasoningCommands(handlers, context);
  registerMeditationCommands(handlers, context);
  registerVoidStoreCommands(handlers, context);
  registerOnboardCommands(handlers, context);
  registerVerifyCommands(handlers, context);

  // Remembrance Key — always available, no registration needed
  handlers['remembrance-key'] = () => {
    require('./core/remembrance-lexicon').printAll();
  };
  handlers['key'] = handlers['remembrance-key'];
  handlers['lexicon'] = handlers['remembrance-key'];

  // Remembrance Covenant Weave — structural safety verification + blueprint
  handlers['weave'] = () => {
    require('./core/covenant-weave').printWeave();
  };
  handlers['covenant-weave'] = handlers['weave'];

  // Remembrance Ecosystem Review — full system opinion on any code
  handlers['review'] = async (args) => {
    const { ecosystemReview, printReview } = require('./core/ecosystem-review');
    const code = getCode(args);
    if (!code) { console.error('Usage: oracle review --file <path>'); process.exit(1); }
    const result = await ecosystemReview(code, { filePath: args.file, description: args.description });
    printReview(result);
  };
  handlers['ecosystem-review'] = handlers['review'];

  // Remembrance Taint Graph — cross-function taint propagation
  handlers['taint-graph'] = (args) => {
    const { buildTaintGraph, printTaintGraph } = require('./audit/taint-graph');
    const fs = require('fs');
    const targetDir = args._positional[0] || 'src';
    const files = [];
    const walk = (dir) => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        if (f.isDirectory() && f.name !== 'node_modules' && f.name !== '.git') walk(path.join(dir, f.name));
        else if (f.isFile() && /\.js$/.test(f.name)) files.push(path.join(dir, f.name));
      }
    };
    walk(path.resolve(targetDir));
    const result = buildTaintGraph(files);
    printTaintGraph(result);
  };
  handlers['taint'] = handlers['taint-graph'];

  // Remembrance Codex — pull up the full periodic table of code
  handlers['codex'] = () => {
    const { PeriodicTable, GROUPS, isRemembranceRegister } = require('./atomic/periodic-table');
    const { introspect } = require('./atomic/self-introspect');
    const table = new PeriodicTable();
    const result = introspect(table);
    const elements = table.elements.sort((a, b) => {
      if (a.properties.group !== b.properties.group) return a.properties.group - b.properties.group;
      return a.properties.period - b.properties.period;
    });
    let currentGroup = -1;
    for (const el of elements) {
      const p = el.properties;
      if (p.group !== currentGroup) {
        currentGroup = p.group;
        console.log('');
        console.log('══════════════════════════════════════════════════════════════════════');
        console.log('  GROUP ' + p.group + ': REMEMBRANCE ' + (GROUPS[p.group] || '').toUpperCase());
        console.log('══════════════════════════════════════════════════════════════════════');
      }
      const chargeSym = p.charge > 0 ? '+1' : p.charge < 0 ? '-1' : ' 0';
      const rr = isRemembranceRegister(p) ? ' ✦ REMEMBRANCE REGISTER' : '';
      console.log('');
      console.log('  ' + el.name + rr);
      console.log('  ─────────────────────────────────────────────');
      console.log('  Signature : ' + el.signature);
      console.log('  charge: ' + chargeSym + '  valence: ' + p.valence + '  mass: ' + p.mass + '  spin: ' + p.spin);
      console.log('  phase: ' + p.phase + '  reactivity: ' + p.reactivity + '  electronegativity: ' + (p.electronegativity || 0));
      console.log('  group: ' + p.group + ' (' + (GROUPS[p.group] || '?') + ')  period: ' + p.period);
      console.log('  harmPotential: ' + (p.harmPotential || 'none') + '  alignment: ' + (p.alignment || 'neutral') + '  intention: ' + (p.intention || 'neutral'));
      console.log('  domain: ' + (p.domain || 'core'));
    }
    const stats = table.stats();
    console.log('');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  REMEMBRANCE CODEX SUMMARY');
    console.log('══════════════════════════════════════════════════════════════════════');
    console.log('  Elements: ' + table.size + '  |  Gaps: ' + result.gaps.length + '  |  Collisions: ' + stats.collisions);
    console.log('  Remembrance Registers: ' + stats.remembranceRegisters);
    console.log('  Domains: ' + stats.knownDomains.join(', '));
    console.log('  Charge: +' + stats.byCharge.positive + ' / ' + stats.byCharge.neutral + ' / -' + stats.byCharge.negative);
    console.log('  Alignment: healing=' + stats.byAlignment.healing + '  neutral=' + stats.byAlignment.neutral + '  degrading=' + stats.byAlignment.degrading);
    console.log('══════════════════════════════════════════════════════════════════════');
  };
  handlers['table'] = handlers['codex'];
  handlers['periodic-table'] = handlers['codex'];

  // Dependency Scanner — supply chain security audit
  handlers['audit-deps'] = async (args) => {
    const { scanDependencies } = require('./audit/dep-scanner');
    const repoRoot = args.path || process.cwd();
    const deepScan = args.deep === true || args.deep === 'true';
    const threshold = args.threshold ? parseFloat(args.threshold) : undefined;
    const scanOptions = { deepScan };
    if (threshold) scanOptions.entropyThreshold = threshold;

    console.log(c.bold('Dependency Scanner — Supply Chain Security Audit'));
    console.log('Scanning ' + repoRoot + ' ...');
    console.log('');

    const result = scanDependencies(repoRoot, scanOptions);

    if (result.error) {
      console.error(c.boldRed('Error: ') + result.error);
      process.exit(1);
    }

    // Print summary
    const flagColor = result.flagged > 0 ? c.boldRed : c.green;
    console.log('  Scanned:  ' + result.scanned);
    console.log('  Clean:    ' + c.green(String(result.clean)));
    console.log('  Flagged:  ' + flagColor(String(result.flagged)));
    console.log('');

    // Print flagged details
    const flaggedDetails = result.details.filter(d => d.flags.length > 0);
    if (flaggedDetails.length > 0) {
      console.log(c.boldRed('Flagged packages:'));
      for (const d of flaggedDetails) {
        console.log('');
        console.log('  ' + c.bold(d.pkg));
        console.log('    Entry:    ' + (d.entryPoint || 'N/A'));
        console.log('    Entropy:  ' + d.entropy + ' bits/byte');
        console.log('    Covenant: ' + (d.covenantPassed ? c.green('PASSED') : c.boldRed('FAILED')));
        console.log('    Flags:    ' + d.flags.join(', '));
        console.log('    Reason:   ' + d.reason);
      }
    } else {
      console.log(c.green('All dependencies clean.'));
    }
  };
  handlers['deps'] = handlers['audit-deps'];

  let effectiveCmd = cmd;
  const dep = getDeprecation(cmd);
  if (dep) {
    warnDeprecation(cmd);
    // Route to the canonical command — INCLUDING the flags that make it
    // canonical. Taking only `canonical.split(' ')[0]` silently dropped
    // them, so `smart-search` ran a plain hybrid `search` (losing intent
    // detection, typo correction and suggestions entirely) and `deep-clean`
    // ran a plain `prune` rather than `prune --deep`, while the notice on
    // screen promised otherwise. A flag the user typed always wins over the
    // canonical default.
    const [canonicalCmd, ...canonicalArgv] = dep.canonical.split(/\s+/);
    effectiveCmd = canonicalCmd;
    const implied = parseArgs([canonicalCmd, ...canonicalArgv]);
    for (const [k, v] of Object.entries(implied)) {
      if (k.startsWith('_')) continue;          // positional/meta bookkeeping
      if (args[k] === undefined) args[k] = v;   // never override an explicit flag
    }
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
main.atomicProperties = { charge: 0, valence: 8, mass: "heavy", spin: "odd", phase: "liquid", reactivity: "medium", electronegativity: 1, group: 3, period: 5, harmPotential: "dangerous", alignment: "healing", intention: "benevolent", domain: "utility" };

main();
