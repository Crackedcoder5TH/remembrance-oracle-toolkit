'use strict';
const fs = require('fs');
const { c } = require('../../colors');
const { out, outErr, outWarn, _quiet, swallowedFailures } = require('./out');

// Extracted from the admin monolith (decomposition #5, 2026-08-09).
// Handler bodies are verbatim except: console.* routed through the
// ./out seam, and every best-effort catch now names its failure via
// _quiet — silence became a measurement.
function registerStatusCommands(handlers, { oracle, jsonOut }) {
  handlers['users'] = (args) => {
    try {
      const { AuthManager } = require('../../../auth/auth');
      const sqliteStore = oracle.store.getSQLiteStore();
      const auth = new AuthManager(sqliteStore);
      const subCmd = args._sub;

      if (subCmd === 'add') {
        const username = args.username || args.name;
        const password = args.password;
        const role = args.role || 'contributor';
        if (!username || !password) { outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle users add')} --username <name> --password <pass> [--role admin|contributor|viewer]`); process.exit(1); }
        const user = auth.createUser(username, password, role);
        out(`${c.boldGreen('User created:')} ${c.bold(user.username)} (${user.role})`);
        out(`  API Key: ${c.cyan(user.apiKey)}`);
      } else if (subCmd === 'delete') {
        const id = args.id;
        if (!id) { outErr(c.boldRed('Error:') + ` Usage: ${c.cyan('oracle users delete')} --id <user-id>`); process.exit(1); }
        const deleted = auth.deleteUser(id);
        out(deleted ? c.boldGreen('User deleted.') : c.yellow('User not found.'));
      } else {
        const users = auth.listUsers();
        out(c.boldCyan(`Users (${users.length}):\n`));
        for (const u of users) {
          out(`  ${c.bold(u.username)} [${c.cyan(u.id.slice(0, 8))}] role: ${c.magenta(u.role)} key: ${c.dim(u.apiKey.slice(0, 12) + '...')}`);
        }
      }
    } catch (err) {
      outErr(c.boldRed('Error:') + ' Auth error: ' + err.message);
    }
  };
  handlers['covenant-status'] = (args) => {
    const { LivingCovenant } = require('../../../core/living-covenant');
    const living = new LivingCovenant();
    // Get current global coherency from orchestrator
    let globalCoherency = 0.762; // fallback
    try {
      const { CoherencyDirector } = require('../../../orchestrator/coherency-director');
      const d = new CoherencyDirector();
      const fs = require('fs');
      const path = require('path');
      const scanDir = 'src';
      if (fs.existsSync(scanDir)) {
        // Canonical walker (ECOSYSTEM §7) — pre-order preserved for the slice(0, 50) sample.
        const { walkFiles } = require('../../../core/walk-files');
        const files = walkFiles(scanDir, { skipDirs: new Set(['node_modules']), extensions: ['.js'] })
          .map((p) => { try { return { id: p, code: fs.readFileSync(p, 'utf-8'), filePath: p, language: 'javascript' }; } catch { return null; } })
          .filter(Boolean);
        d.scan(files.slice(0, 50)); // sample for speed
        d.measureWithOracle();
        globalCoherency = d.field.globalCoherency;
      }
    } catch { _quiet('admin:status');}

    // Evolve (activates any new principles we're eligible for)
    const evolution = living.evolve(globalCoherency);
    const status = living.status(globalCoherency);

    if (jsonOut()) { out(JSON.stringify({ status, evolution, globalCoherency })); return; }

    out('');
    out(c.boldCyan('Living Covenant'));
    out(`  founding principles : ${c.bold('15')} (permanent, unbypassable)`);
    out(`  evolved principles  : ${c.bold(String(status.activePrinciples))}`);
    out(`  total principles    : ${c.bold(String(status.totalPrinciples))}`);
    out(`  global coherency    : ${c.bold(globalCoherency.toFixed(3))}`);
    out('');
    if (living.activePrinciples.length > 0) {
      out(c.bold('  Active evolved principles:'));
      for (const p of living.activePrinciples) {
        out(`    ${c.green('\u2713')} ${c.bold(p.name)} (activated at C=${p.activatedAtCoherency.toFixed(3)})`);
        out(`      ${c.dim(p.description)}`);
      }
      out('');
    }
    // Under ORACLE_DEBUG, surface any best-effort failures the admin
    // organs swallowed during this run \u2014 the readable side of the _quiet
    // counter, so silence is inspectable rather than absolute.
    if (process.env.ORACLE_DEBUG) {
      const quiet = swallowedFailures();
      const sites = Object.keys(quiet);
      if (sites.length) {
        out('');
        out(c.dim('  Swallowed (best-effort) failures this run:'));
        for (const s of sites) out(`    ${c.dim(s)}: ${quiet[s]}`);
      }
    }
    if (status.pendingQueue > 0 && status.nextActivation) {
      out(c.bold('  Next activation:'));
      out(`    ${c.yellow('\u25cb')} ${c.bold(status.nextActivation.name)} at C=${status.nextActivation.threshold}`);
      out(`      gap: ${c.dim('+' + status.nextActivation.gap + ' coherency needed')}`);
      out('');
    }
    if (evolution.activated.length > 0) {
      out(c.boldGreen(`  \u2728 ${evolution.activated.length} NEW principle(s) activated this cycle!`));
      for (const a of evolution.activated) {
        out(`    ${c.green('\u2713')} ${c.bold(a.name)}: ${a.description}`);
      }
      out('');
    }
    out(c.dim('  The covenant expands with coherency. It can never contract.'));
    out('');
  };
  handlers['recalibrate'] = (args) => {
    const { recalibrateCoherency } = require('../../../unified/coherency-recalibrate');
    const dryRun = args['dry-run'] === true || args['dry-run'] === 'true';
    const threshold = parseFloat(args.threshold || '0.05');

    out('');
    out(c.boldCyan('Coherency Recalibration' + (dryRun ? ' (dry-run)' : '')));
    out(c.dim('  Re-scoring all stored patterns with the current scorer...'));
    out('');

    let lastReport = 0;
    const result = recalibrateCoherency(oracle.store, {
      driftThreshold: threshold,
      dryRun,
      onProgress: (done, total) => {
        const pct = Math.floor((done / total) * 10);
        if (pct !== lastReport) {
          lastReport = pct;
          process.stdout.write(`\r  progress: ${done}/${total}  `);
        }
      },
    });
    process.stdout.write('\r' + ' '.repeat(40) + '\r');

    if (jsonOut()) { out(JSON.stringify(result)); return; }

    out(`  total patterns   : ${c.bold(String(result.totalPatterns))}`);
    out(`  changed (|Δ| ≥ ${threshold}) : ${c.bold(String(result.changed))}`);
    out(`    raised  : ${c.green(String(result.raised))}`);
    out(`    lowered : ${c.red(String(result.lowered))}`);
    out(`  unchanged        : ${result.unchanged}`);
    out(`  skipped          : ${result.skipped}`);
    out(`  avg |drift|      : ${result.avgDriftAbs}`);
    out(`  max |drift|      : ${result.maxDrift}${result.maxDriftPattern ? ' (' + result.maxDriftPattern.name + ')' : ''}`);
    out('');
    if (result.examples.length > 0) {
      out(c.bold('  Examples (top drift):'));
      for (const ex of result.examples.slice(0, 10)) {
        const arrow = ex.drift > 0 ? c.green('↑') : c.red('↓');
        out(`    ${arrow} ${c.bold(ex.name.padEnd(40))} ${ex.oldScore} → ${ex.newScore}  (Δ${ex.drift > 0 ? '+' : ''}${ex.drift})`);
      }
    }
    out('');
    if (dryRun) {
      out(c.dim('  (dry run — no changes written. Re-run without --dry-run to apply.)'));
    } else if (result.changed > 0) {
      out(c.boldGreen(`  ✓ Updated ${result.changed} pattern(s) in the store.`));
    } else {
      out(c.dim('  No patterns drifted past threshold. Library is calibrated.'));
    }
    out('');
  };
  handlers['ecosystem'] = async (args) => {
    const eco = require('../../../core/ecosystem');
    const repoRoot = process.cwd();
    const sub = args._sub || 'status';

    if (sub === 'status' || sub === 'discover') {
      const result = await eco.discoverEcosystem({ repoRoot, checkHealth: true, emit: false });
      if (args.json === true) { out(JSON.stringify(result, null, 2)); return; }
      out(c.boldCyan('Ecosystem discovery'));
      out(`  Found: ${c.bold(String(result.modules.length))} module(s)`);
      out(`  Alive: ${result.alive.length > 0 ? c.boldGreen(String(result.alive.length)) : c.dim('0')}`);
      out(`  Stale: ${result.stale.length > 0 ? c.yellow(String(result.stale.length)) : c.dim('0')}`);
      out('');
      for (const m of result.modules) {
        const status = m.health?.alive ? c.boldGreen('UP  ')
          : m.health?.error ? c.red('DOWN')
          : c.dim('???? ');
        const lang = c.dim(`[${m.language || '?'}]`);
        out(`  ${status}  ${c.cyan(m.name.padEnd(32))} ${c.dim('v' + (m.version || '?'))} ${lang}`);
        out(`        ${c.dim(m.repoRoot)}`);
        if (m.role) out(`        role: ${c.magenta(m.role)}`);
        if (m.health?.error) out(`        ${c.red('error: ' + m.health.error)}`);
        if (m.live?.port) out(`        live: ${m.live.host}:${m.live.port} pid=${m.live.pid}`);
        if (Array.isArray(m.capabilities) && m.capabilities.length > 0) {
          const caps = m.capabilities.slice(0, 5).join(', ');
          out(`        capabilities: ${c.dim(caps)}${m.capabilities.length > 5 ? c.dim(' …') : ''}`);
        }
        out('');
      }
      return;
    }

    if (sub === 'connect' || sub === 'wire') {
      const result = await eco.autoWireAll({ repoRoot });
      if (args.json === true) { out(JSON.stringify(result, null, 2)); return; }
      out(c.boldCyan('Ecosystem auto-wire'));
      if (result.wired.length === 0) {
        out(c.yellow('  No peers were wired. Check `oracle ecosystem status` for reachability.'));
        return;
      }
      for (const w of result.wired) {
        out(`  ${c.boldGreen('✓')} ${c.cyan(w.peer.padEnd(32))} → ${c.dim(w.role)}`);
      }
      out('');
      out(c.dim(`  ${result.wired.length} binding(s) active. Subsystems that depend on these peers have switched from fallback mode to the live service.`));
      return;
    }

    if (sub === 'announce') {
      // Write this module's runtime record to the registry.
      const record = eco.announceModule(repoRoot, {
        port: args.port ? Number(args.port) : undefined,
        host: args.host,
      });
      if (!record) {
        out(c.yellow('No remembrance.json found in ' + repoRoot));
        return;
      }
      out(c.boldGreen('Announced:'));
      out(`  name:  ${c.cyan(record.name)}`);
      out(`  pid:   ${record.pid}`);
      out(`  host:  ${record.host}`);
      if (record.port) out(`  port:  ${record.port}`);
      out(`  role:  ${c.magenta(record.role || '?')}`);
      return;
    }

    if (sub === 'help' || !sub) {
      out(`
${c.boldCyan('Oracle ecosystem — discovery + auto-wire')}

${c.bold('Subcommands:')}
  ${c.cyan('ecosystem status')}     Show all discovered modules + health
  ${c.cyan('ecosystem connect')}    Auto-wire live peers into the running toolkit
  ${c.cyan('ecosystem announce')}   Register this module in the runtime registry

${c.bold('Discovery layers:')}
  1. remembrance.json manifests in sibling repos and $HOME
  2. runtime registry at ~/.remembrance/modules/
  3. event bus: ecosystem.peer.found / ecosystem.peer.lost

${c.bold('Environment:')}
  ${c.yellow('ORACLE_ECOSYSTEM_ROOTS')}  Colon-separated list of additional root dirs to scan
  ${c.yellow('VOID_API_KEY')}              API key for the Void Compressor's cascade endpoint
`);
      return;
    }

    outErr(c.boldRed('Error:') + ` Unknown ecosystem subcommand: ${sub}`);
  };
}
registerStatusCommands.atomicProperties = {
  charge: 0, valence: 2, mass: 'medium', spin: 'even', phase: 'solid',
  reactivity: 'stable', electronegativity: 0.5, group: 14, period: 4,
  harmPotential: 'none', alignment: 'neutral', intention: 'benevolent',
  domain: 'orchestration',
};

module.exports = { registerStatusCommands };
