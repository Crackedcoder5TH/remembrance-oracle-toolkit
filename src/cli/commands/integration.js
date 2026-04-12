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

    // Non-MCP editor configs (vim, emacs, jetbrains)
    const nonMcpEditors = ['vim', 'neovim', 'nvim', 'emacs', 'jetbrains', 'intellij', 'webstorm', 'pycharm'];
    if (sub && nonMcpEditors.includes(sub.toLowerCase())) {
      const { installEditorConfig } = require('../../ide/mcp-install');
      const result = installEditorConfig(sub.toLowerCase());
      if (result.success) {
        console.log(`\n${c.boldCyan('Editor Config Installed')}\n`);
        for (const f of result.files) {
          console.log(`  ${c.green('\u2713')} ${c.dim(f)}`);
        }
        console.log(`\n  ${result.instructions}`);
      } else {
        console.log(`${c.red('\u2717')} ${result.error}`);
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
      console.log(`\n  ${c.boldGreen(installed + ' MCP editors configured.')}`);
      console.log(`  ${c.dim('Also available: oracle mcp-install vim|emacs|jetbrains')}`);
    }
  };

  handlers['plugin'] = (args) => {
    const { PluginManager } = require('../../plugins/manager');
    const { listBuiltins, loadBuiltinPlugin, loadAllBuiltins } = require('../../plugins/builtins');
    const pm = new PluginManager(oracle, { pluginDir: path.join(process.cwd(), '.remembrance', 'plugins') });
    const sub = args._sub;

    if (sub === 'load') {
      const pluginPath = args._positional[1];
      if (!pluginPath) { console.error(c.boldRed('Error:') + ' provide a plugin path or builtin name (dashboard, cloud, auth, ide, ci)'); process.exit(1); }

      try {
        // Check if it's a builtin name
        const builtins = listBuiltins();
        let manifest;
        if (builtins.includes(pluginPath)) {
          manifest = loadBuiltinPlugin(pm, pluginPath);
        } else {
          manifest = pm.load(pluginPath);
        }
        console.log(`${c.green('\u2713')} Loaded plugin ${c.bold(manifest.name)} v${manifest.version}`);
        if (manifest.description) console.log(`  ${c.dim(manifest.description)}`);
      } catch (e) {
        console.error(c.boldRed('Error:') + ' ' + e.message);
      }
    } else if (sub === 'load-all') {
      try {
        const manifests = loadAllBuiltins(pm);
        console.log(`${c.green('\u2713')} Loaded ${manifests.length} built-in plugins:\n`);
        for (const m of manifests) {
          console.log(`  ${c.bold(m.name)} v${m.version}`);
          if (m.description) console.log(`    ${c.dim(m.description)}`);
        }
      } catch (e) {
        console.error(c.boldRed('Error:') + ' ' + e.message);
      }
    } else if (sub === 'builtins') {
      const builtins = listBuiltins();
      console.log(`\n${c.boldCyan('Available Built-in Plugins')}\n`);
      for (const name of builtins) {
        try {
          const plugin = require(`../../plugins/builtins/${name}-plugin`);
          console.log(`  ${c.bold(name)} v${plugin.version}`);
          if (plugin.description) console.log(`    ${c.dim(plugin.description)}`);
        } catch {
          console.log(`  ${c.bold(name)}`);
        }
      }
      console.log(`\n  Load with: ${c.cyan('oracle plugin load <name>')}`);
      console.log(`  Load all:  ${c.cyan('oracle plugin load-all')}`);
    } else if (sub === 'list') {
      const list = pm.list();
      if (list.length === 0) {
        const builtins = listBuiltins();
        console.log(c.dim('No plugins loaded'));
        console.log(`\n  ${builtins.length} built-in plugins available: ${builtins.join(', ')}`);
        console.log(`  Load with: ${c.cyan('oracle plugin load <name>')} or ${c.cyan('oracle plugin load-all')}`);
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
      console.log(`  ${c.cyan('oracle plugin load <path|name>')} \u2014 Load a plugin (path or builtin name)`);
      console.log(`  ${c.cyan('oracle plugin load-all')}          \u2014 Load all built-in plugins`);
      console.log(`  ${c.cyan('oracle plugin builtins')}          \u2014 List available built-in plugins`);
      console.log(`  ${c.cyan('oracle plugin list')}              \u2014 List loaded plugins`);
      console.log(`  ${c.cyan('oracle plugin unload <name>')}     \u2014 Unload a plugin`);
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

  handlers['config'] = (args) => {
    const { loadConfig, saveConfig, toggleOracle, togglePromptTag, setPromptTag, isOracleEnabled, getPromptTag, toggleProvenance, getAutoPublish } = require('../../core/oracle-config');
    const sub = args._sub;

    if (sub === 'on') {
      toggleOracle(true);
      console.log(`${c.green('\u2713')} Oracle ${c.boldGreen('enabled')} — automatic pattern usage is ON`);
      return;
    }
    if (sub === 'off') {
      toggleOracle(false);
      console.log(`${c.yellow('\u25CB')} Oracle ${c.dim('disabled')} — automatic pattern usage is OFF`);
      return;
    }
    if (sub === 'toggle') {
      const newState = toggleOracle();
      console.log(newState
        ? `${c.green('\u2713')} Oracle ${c.boldGreen('enabled')}`
        : `${c.yellow('\u25CB')} Oracle ${c.dim('disabled')}`);
      return;
    }
    if (sub === 'prompt-tag') {
      const customTag = args._positional.slice(1).join(' ') || args.tag;
      if (customTag) {
        setPromptTag(customTag);
        console.log(`${c.green('\u2713')} Prompt tag set: ${c.cyan(customTag)}`);
      } else {
        const tag = getPromptTag();
        console.log(tag
          ? `${c.bold('Prompt tag:')} ${c.cyan(tag)}`
          : c.dim('Prompt tag is disabled'));
      }
      return;
    }
    if (sub === 'prompt-tag-on') {
      togglePromptTag(true);
      console.log(`${c.green('\u2713')} Prompt tag ${c.boldGreen('enabled')}`);
      return;
    }
    if (sub === 'prompt-tag-off') {
      togglePromptTag(false);
      console.log(`${c.yellow('\u25CB')} Prompt tag ${c.dim('disabled')}`);
      return;
    }
    if (sub === 'provenance-on') {
      toggleProvenance(true);
      console.log(`${c.green('\u2713')} Provenance tracking ${c.boldGreen('enabled')} — pattern pulls are watermarked`);
      return;
    }
    if (sub === 'provenance-off') {
      toggleProvenance(false);
      console.log(`${c.yellow('\u25CB')} Provenance tracking ${c.dim('disabled')}`);
      return;
    }
    if (sub === 'auto-publish-on') {
      const config = loadConfig();
      config.autoPublish = true;
      saveConfig(config);
      console.log(`${c.green('\u2713')} Auto-publish ${c.boldGreen('enabled')} — high-coherency patterns publish to blockchain on commit`);
      return;
    }
    if (sub === 'auto-publish-off') {
      const config = loadConfig();
      config.autoPublish = false;
      saveConfig(config);
      console.log(`${c.yellow('\u25CB')} Auto-publish ${c.dim('disabled')}`);
      return;
    }
    // Search enforcement level
    if (sub === 'search-enforcement') {
      const level = args._?.[2] || args._?.[1];
      if (['block', 'warn', 'off'].includes(level)) {
        const config = loadConfig();
        config.searchEnforcement = level;
        saveConfig(config);
        const icon = level === 'block' ? c.boldRed('BLOCK') : level === 'warn' ? c.boldYellow('WARN') : c.dim('OFF');
        console.log(`${c.green('\u2713')} Search enforcement set to ${icon}`);
      } else {
        const current = loadConfig().searchEnforcement || 'block';
        console.log(`  Search enforcement: ${current}`);
        console.log(`  Usage: ${c.cyan('oracle config search-enforcement <block|warn|off>')}`);
      }
      return;
    }
    // Feedback enforcement level
    if (sub === 'feedback-enforcement') {
      const level = args._?.[2] || args._?.[1];
      if (['block', 'warn', 'off'].includes(level)) {
        const config = loadConfig();
        config.feedbackEnforcement = level;
        saveConfig(config);
        const icon = level === 'block' ? c.boldRed('BLOCK') : level === 'warn' ? c.boldYellow('WARN') : c.dim('OFF');
        console.log(`${c.green('\u2713')} Feedback enforcement set to ${icon}`);
      } else {
        const current = loadConfig().feedbackEnforcement || 'warn';
        console.log(`  Feedback enforcement: ${current}`);
        console.log(`  Usage: ${c.cyan('oracle config feedback-enforcement <block|warn|off>')}`);
      }
      return;
    }

    // Default: show status
    const config = loadConfig();
    if (jsonOut()) { console.log(JSON.stringify(config)); return; }
    console.log(`\n${c.boldCyan('Oracle Configuration')}\n`);
    console.log(`  Oracle:     ${config.enabled ? c.boldGreen('ON') : c.dim('OFF')}`);
    console.log(`  Prompt Tag: ${config.promptTagEnabled ? c.boldGreen('ON') : c.dim('OFF')}`);
    console.log(`  Tag Text:   ${c.cyan(config.promptTag || '(none)')}`);
    console.log(`  Provenance: ${config.provenanceTracking !== false ? c.boldGreen('ON') : c.dim('OFF')} — pattern pull watermarking`);
    const searchEnf = config.searchEnforcement || 'block';
    const feedbackEnf = config.feedbackEnforcement || 'warn';
    const searchColor = searchEnf === 'block' ? c.boldRed('BLOCK') : searchEnf === 'warn' ? c.boldYellow('WARN') : c.dim('OFF');
    const feedbackColor = feedbackEnf === 'block' ? c.boldRed('BLOCK') : feedbackEnf === 'warn' ? c.boldYellow('WARN') : c.dim('OFF');
    console.log(`  Search:     ${searchColor} — commits ${searchEnf === 'block' ? 'blocked' : searchEnf === 'warn' ? 'warned' : 'unchecked'} without oracle search`);
    console.log(`  Feedback:   ${feedbackColor} — commits ${feedbackEnf === 'block' ? 'blocked' : feedbackEnf === 'warn' ? 'warned' : 'unchecked'} with pending feedback`);
    const autoPublish = config.autoPublish || false;
    console.log(`  AutoPublish:${autoPublish ? c.boldGreen(' ON') : c.dim(' OFF')} — blockchain publish on commit`);
    console.log(`\n${c.dim('Commands:')}`);
    console.log(`  ${c.cyan('oracle config on|off')}                        — Toggle oracle on/off`);
    console.log(`  ${c.cyan('oracle config search-enforcement <level>')}    — Set search gate: block/warn/off`);
    console.log(`  ${c.cyan('oracle config feedback-enforcement <level>')}  — Set feedback gate: block/warn/off`);
    console.log(`  ${c.cyan('oracle config prompt-tag')}                    — View current prompt tag`);
    console.log(`  ${c.cyan('oracle config prompt-tag <text>')}             — Set custom prompt tag`);
    console.log(`  ${c.cyan('oracle config prompt-tag-on|off')}             — Enable/disable prompt tag`);
    console.log(`  ${c.cyan('oracle config provenance-on|off')}             — Enable/disable provenance watermarking`);
    console.log(`  ${c.cyan('oracle config auto-publish-on|off')}           — Enable/disable blockchain auto-publish on commit`);
  };

  handlers['preflight'] = (args) => {
    const { runPreflight } = require('../../core/preflight');
    const result = runPreflight(process.cwd());

    if (jsonOut()) { console.log(JSON.stringify(result)); return; }

    if (result.ok) {
      console.log(`${c.boldGreen('\u2713')} All preflight checks passed`);
    } else {
      console.log(`${c.boldYellow('Preflight issues:')}\n`);
      for (const w of result.warnings) {
        console.log(`  ${c.yellow('!')} ${w.message}`);
        console.log(`    Fix: ${c.cyan(w.fix)}`);
      }
    }
  };

  handlers['pending-feedback'] = (args) => {
    const { getPendingFeedback } = require('../../core/session-tracker');
    const pending = getPendingFeedback();

    if (jsonOut()) { console.log(JSON.stringify(pending)); return; }

    if (pending.length === 0) {
      console.log(`${c.boldGreen('\u2713')} No pending feedback — all resolved patterns have been reported.`);
    } else {
      console.log(`\n${c.boldYellow('Pending Feedback')} — ${pending.length} pattern(s) pulled but never given feedback:\n`);
      for (const p of pending) {
        console.log(`  ${c.yellow('\u25CB')} ${c.bold(p.patternName || 'unnamed')} [${c.dim(p.patternId || 'no-id')}]`);
        console.log(`    Pulled at: ${c.dim(p.timestamp)}  Decision: ${c.cyan(p.decision)}`);
        console.log(`    Fix: ${c.cyan(`oracle feedback --id ${p.patternId} --success`)}`);
      }
      console.log('');
    }
  };

  handlers['session-summary'] = (args) => {
    const { buildSummary, saveSession, hasInteractions, getPendingFeedback, hasUnsubmittedWork } = require('../../core/session-tracker');

    if (!hasInteractions()) {
      console.log(c.dim('No oracle interactions recorded in this session.'));
      console.log(c.dim('Use ') + c.cyan('oracle resolve') + c.dim(' or ') + c.cyan('oracle search') + c.dim(' first.'));
      return;
    }

    const summary = buildSummary();

    if (jsonOut()) { console.log(JSON.stringify(summary)); return; }

    console.log(`\n${c.boldCyan('═══ Oracle Session Summary ═══')}\n`);
    console.log(`  Duration: ${c.bold(summary.duration)}`);
    console.log(`  Resolves: ${c.bold(String(summary.stats.totalResolves))}  |  Searches: ${c.bold(String(summary.stats.totalSearches))}`);
    console.log(`  Decisions: ${c.boldGreen(String(summary.stats.pulls) + ' PULL')}  ${c.boldYellow(String(summary.stats.evolves) + ' EVOLVE')}  ${c.boldMagenta(String(summary.stats.generates) + ' GENERATE')}`);
    if (summary.stats.healingLoops > 0) {
      console.log(`  Healing loops: ${c.bold(String(summary.stats.healingLoops))}`);
    }
    console.log(`  Unique patterns used: ${c.bold(String(summary.stats.uniquePatternsUsed))}`);

    // What the oracle said
    if (summary.said.length > 0) {
      console.log(`\n${c.boldCyan('── What the Oracle Said ──')}\n`);
      for (const s of summary.said) {
        const icon = s.decision === 'pull' ? c.green('▸')
          : s.decision === 'evolve' ? c.yellow('▸')
          : c.magenta('▸');
        const desc = s.description ? c.dim(` "${s.description}"`) : '';
        console.log(`  ${icon} ${s.text}${desc}`);
      }
    }

    // What the oracle whispered
    if (summary.whispered.length > 0) {
      console.log(`\n${c.boldMagenta('── What the Oracle Whispered ──')}\n`);
      for (const w of summary.whispered) {
        if (w.type === 'resolve') {
          const label = w.patternName ? c.dim(`[${w.patternName}] `) : '';
          console.log(`  ${c.magenta('~')} ${label}${c.italic(w.message)}`);
        } else if (w.type === 'candidate-notes') {
          console.log(`  ${c.cyan('~')} ${c.dim(w.message)}`);
        }
        console.log('');
      }
    }

    // Prompt tags
    if (summary.promptTags && summary.promptTags.length > 0) {
      console.log(`${c.boldCyan('── Oracle Invocations ──')}\n`);
      for (const tag of summary.promptTags) {
        console.log(`  ${c.bold(tag)}`);
      }
      console.log('');
    }

    // Feedback gap warning
    const pending = getPendingFeedback();
    if (pending.length > 0) {
      console.log(`${c.boldYellow('── Pending Feedback ──')}\n`);
      console.log(`  ${c.yellow(String(pending.length))} pattern(s) pulled but never given feedback:\n`);
      for (const p of pending.slice(0, 10)) {
        console.log(`  ${c.yellow('\u25CB')} ${c.bold(p.patternName || 'unnamed')} [${c.dim(p.patternId || 'no-id')}]`);
        console.log(`    Fix: ${c.cyan(`oracle feedback --id ${p.patternId} --success`)}`);
      }
      if (pending.length > 10) console.log(c.dim(`  ... and ${pending.length - 10} more`));
      console.log('');
    }

    // End sweep warning
    if (hasUnsubmittedWork()) {
      console.log(`${c.boldYellow('── End Sweep Reminder ──')}\n`);
      console.log(`  ${c.yellow('!')} Session has unsubmitted work. Run before ending:`);
      console.log(`    ${c.cyan('oracle auto-submit')}`);
      console.log('');
    }

    // Save the session
    const savePath = saveSession();
    if (savePath && !args.quiet) {
      console.log(c.dim(`Session saved to ${savePath}`));
    }

    console.log(`${c.boldCyan('═'.repeat(30))}\n`);
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
