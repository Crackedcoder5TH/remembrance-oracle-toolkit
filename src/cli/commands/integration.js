/**
 * Integration CLI commands: mcp, mcp-install, plugin, dashboard, deploy, analytics
 */

const path = require('path');
const { c, colorScore } = require('../colors');
const { validatePort } = require('../validate-args');

function registerIntegrationCommands(handlers, { oracle, jsonOut }) {

  handlers['mcp'] = () => {
    const { startMCPServer } = require('../../mcp/server');
    startMCPServer(oracle);
  };

  handlers['mcp-install'] = (args) => {
    const { installAll, uninstallAll, checkInstallation, installTo, uninstallFrom } = require('../../ide/mcp-install');
    const sub = args._sub;

    if (sub === 'status' || sub === 'check') {
      const status = checkInstallation();
      console.log(`\n${c.boldCyan('MCP Installation Status')}\n`);
      for (const [editor, info] of Object.entries(status)) {
        const icon = info.installed ? c.boldGreen('\u2713') : c.dim('\u25CB');
        console.log(`  ${icon} ${c.bold(editor.padEnd(16))} ${info.installed ? 'installed' : 'not installed'}`);
        console.log(`    ${c.dim(info.path)}`);
      }
      return;
    }

    if (sub === 'remove' || sub === 'uninstall') {
      const target = args._positional[1];
      if (target) {
        const result = uninstallFrom(target);
        console.log(result.success ? `${c.green('\u2713')} Removed from ${c.bold(target)}` : `${c.red('\u2717')} ${result.error}`);
      } else {
        const results = uninstallAll();
        console.log(`\n${c.boldCyan('MCP Uninstall Results')}\n`);
        for (const [editor, result] of Object.entries(results)) {
          if (result.skipped) continue;
          const icon = result.success ? c.green('\u2713') : c.red('\u2717');
          console.log(`  ${icon} ${c.bold(editor)}: ${result.success ? 'removed' : result.error}`);
        }
      }
      return;
    }

    const target = sub && sub !== 'all' ? sub : null;
    const useNpx = args.npx || false;
    const opts = useNpx ? { command: 'npx' } : {};

    if (target) {
      const result = installTo(target, opts);
      if (result.success) {
        console.log(`${c.green('\u2713')} Registered MCP server in ${c.bold(target)}`);
        console.log(`  ${c.dim(result.path)}`);
      } else {
        console.log(`${c.red('\u2717')} Failed: ${result.error}`);
      }
    } else {
      const results = installAll(opts);
      console.log(`\n${c.boldCyan('MCP Auto-Registration Results')}\n`);
      let installed = 0;
      for (const [editor, result] of Object.entries(results)) {
        const icon = result.success ? c.green('\u2713') : c.red('\u2717');
        console.log(`  ${icon} ${c.bold(editor.padEnd(16))} ${result.success ? c.dim(result.path) : result.error}`);
        if (result.success) installed++;
      }
      console.log(`\n  ${c.boldGreen(installed + ' editors configured.')}`);
      console.log(`  ${c.dim('Restart your editor to activate the oracle MCP server.')}`);
    }
  };

  handlers['plugin'] = (args) => {
    const { PluginManager } = require('../../plugins/manager');
    const pm = new PluginManager(oracle, { pluginDir: path.join(process.cwd(), '.remembrance', 'plugins') });
    const sub = args._sub;

    if (sub === 'load') {
      const pluginPath = args._positional[1];
      if (!pluginPath) { console.error(c.boldRed('Error:') + ' provide a plugin path'); process.exit(1); }
      try {
        const manifest = pm.load(pluginPath);
        console.log(`${c.green('\u2713')} Loaded plugin ${c.bold(manifest.name)} v${manifest.version}`);
        if (manifest.description) console.log(`  ${c.dim(manifest.description)}`);
      } catch (e) {
        console.error(c.boldRed('Error:') + ' ' + e.message);
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
      const name = args._positional[1];
      if (!name) { console.error(c.boldRed('Error:') + ' provide plugin name'); process.exit(1); }
      try {
        pm.unload(name);
        console.log(`${c.green('\u2713')} Unloaded plugin ${c.bold(name)}`);
      } catch (e) {
        console.error(c.boldRed('Error:') + ' ' + e.message);
      }
    } else {
      console.log(`\n${c.boldCyan('Plugin Commands')}\n`);
      console.log(`  ${c.cyan('oracle plugin load <path>')}   \u2014 Load a plugin`);
      console.log(`  ${c.cyan('oracle plugin list')}          \u2014 List loaded plugins`);
      console.log(`  ${c.cyan('oracle plugin unload <name>')} \u2014 Unload a plugin`);
    }
  };

  handlers['dashboard'] = (args) => {
    const { startDashboard } = require('../../dashboard/server');
    const port = validatePort(args.port, 3333);
    startDashboard(oracle, { port });
  };

  handlers['deploy'] = () => {
    const { start } = require('../../deploy');
    start();
  };

  handlers['analytics'] = (args) => {
    const { generateAnalytics, computeTagCloud } = require('../../analytics/analytics');
    const analytics = generateAnalytics(oracle);
    analytics.tagCloud = computeTagCloud(oracle.patterns.getAll());
    if (jsonOut()) { console.log(JSON.stringify(analytics)); return; }
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
        console.log(`    ${c.red('!')} ${c.bold(p.name)} \u2014 coherency: ${colorScore(p.coherency)}`);
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
  };
}

module.exports = { registerIntegrationCommands };
