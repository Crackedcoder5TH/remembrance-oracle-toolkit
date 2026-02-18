/**
 * Swarm orchestrator CLI commands: swarm, swarm review, swarm heal, swarm config, swarm providers, swarm status
 */

const { c, colorScore } = require('../colors');

function registerSwarmCommands(handlers, { oracle, getCode, jsonOut }) {

  handlers['swarm'] = async (args) => {
    const sub = args._sub;

    // ─── swarm config ───
    if (sub === 'config') {
      const { loadSwarmConfig, saveSwarmConfig } = require('../../swarm/swarm-config');
      const config = loadSwarmConfig(process.cwd());

      if (args.set) {
        // Set a config value: --set key=value
        const [key, ...rest] = args.set.split('=');
        const value = rest.join('=');
        if (key && value !== undefined) {
          const parsed = value === 'true' ? true : value === 'false' ? false : isNaN(value) ? value : Number(value);
          config[key] = parsed;
          saveSwarmConfig(process.cwd(), config);
          console.log(`${c.boldGreen('Set')} ${c.bold(key)} = ${c.cyan(String(parsed))}`);
        }
        return;
      }

      console.log(c.boldCyan('Swarm Configuration\n'));
      console.log(`  Min agents:          ${c.cyan(String(config.minAgents))}`);
      console.log(`  Max agents:          ${c.cyan(String(config.maxAgents))}`);
      console.log(`  Consensus threshold: ${c.cyan(String(config.consensusThreshold))}`);
      console.log(`  Timeout:             ${c.cyan(config.timeoutMs + 'ms')}`);
      console.log(`  Cross-scoring:       ${config.crossScoring ? c.green('enabled') : c.dim('disabled')}`);
      console.log(`  Auto-feed reflector: ${config.autoFeedToReflector ? c.green('enabled') : c.dim('disabled')}`);
      console.log(`  Dimensions:          ${c.dim(config.dimensions.join(', '))}`);
      console.log(`  Weights:             coherency=${config.weights.coherency} self=${config.weights.selfConfidence} peer=${config.weights.peerScore}`);

      if (Object.keys(config.providers).length > 0) {
        console.log(`\n${c.bold('Configured providers:')}`);
        for (const [name, conf] of Object.entries(config.providers)) {
          const model = conf.model || c.dim('(default)');
          const hasKey = conf.apiKey ? c.green('key set') : c.dim('env fallback');
          console.log(`  ${c.cyan(name)}: model=${model} ${hasKey}`);
        }
      }
      return;
    }

    // ─── swarm providers ───
    if (sub === 'providers') {
      const { resolveProviders, getProviderModel, loadSwarmConfig } = require('../../swarm/swarm-config');
      const config = loadSwarmConfig(process.cwd());
      const available = resolveProviders(config);

      console.log(c.boldCyan('Swarm Providers\n'));
      const allProviders = ['claude', 'openai', 'gemini', 'grok', 'deepseek', 'ollama'];
      for (const p of allProviders) {
        const active = available.includes(p);
        const icon = active ? c.boldGreen('+') : c.dim('-');
        const model = active ? c.dim(`(${getProviderModel(p, config)})`) : c.dim('(no key)');
        console.log(`  [${icon}] ${active ? c.bold(p) : c.dim(p)} ${model}`);
      }
      console.log(`\n  ${c.bold(String(available.length))} provider(s) available`);

      if (available.length === 0) {
        console.log(`\n  ${c.yellow('Set API keys to enable providers:')}`);
        console.log(`    ANTHROPIC_API_KEY, OPENAI_API_KEY, GOOGLE_API_KEY,`);
        console.log(`    GROK_API_KEY, DEEPSEEK_API_KEY, or install Ollama`);
      }
      return;
    }

    // ─── swarm status ───
    if (sub === 'status') {
      const { resolveProviders, loadSwarmConfig, DIMENSIONS } = require('../../swarm/swarm-config');
      const config = loadSwarmConfig(process.cwd());
      const available = resolveProviders(config);

      console.log(c.boldCyan('Swarm Status\n'));
      console.log(`  Providers ready: ${c.bold(String(available.length))} / 6`);
      console.log(`  Dimensions:      ${c.bold(String(DIMENSIONS.length))}`);
      console.log(`  Cross-scoring:   ${config.crossScoring ? c.green('on') : c.dim('off')}`);
      console.log(`  Ready:           ${available.length >= config.minAgents ? c.boldGreen('YES') : c.boldRed('NO (need ' + config.minAgents + ' providers)')}`);
      return;
    }

    // ─── swarm review ───
    if (sub === 'review') {
      const code = await getCode(args);
      if (!code) { console.error(c.boldRed('Error:') + ' Provide code via --file or stdin'); process.exit(1); }
      const { swarmReview, formatSwarmResult } = require('../../swarm');
      console.log(c.dim('Dispatching to swarm for review...'));
      const result = await swarmReview(code, {
        rootDir: process.cwd(),
        language: args.language,
        oracle,
      });
      if (jsonOut(args, result)) return;
      console.log(formatSwarmResult(result));
      return;
    }

    // ─── swarm heal ───
    if (sub === 'heal') {
      const code = await getCode(args);
      if (!code) { console.error(c.boldRed('Error:') + ' Provide code via --file or stdin'); process.exit(1); }
      const { swarmHeal, formatSwarmResult } = require('../../swarm');
      console.log(c.dim('Dispatching to swarm for healing...'));
      const result = await swarmHeal(code, {
        rootDir: process.cwd(),
        language: args.language,
        oracle,
      });
      if (jsonOut(args, result)) return;
      console.log(formatSwarmResult(result));
      return;
    }

    // ─── swarm <task> (default: code generation) ───
    const task = sub
      ? [sub, ...(args._positional || []).slice(1)].join(' ')
      : args._positional?.[0] || args.task || args.description;

    if (!task) {
      console.log(`${c.boldCyan('Swarm Orchestrator')}\n`);
      console.log(`  ${c.cyan('oracle swarm')} "<task>"                  Generate code via swarm consensus`);
      console.log(`  ${c.cyan('oracle swarm review')} --file <path>      Review code via swarm`);
      console.log(`  ${c.cyan('oracle swarm heal')} --file <path>        Heal code via swarm`);
      console.log(`  ${c.cyan('oracle swarm config')}                    Show/edit swarm config`);
      console.log(`  ${c.cyan('oracle swarm providers')}                 List available providers`);
      console.log(`  ${c.cyan('oracle swarm status')}                    Swarm readiness check`);
      console.log(`\n  ${c.dim('Options: --language <lang>, --json, --no-cross-scoring')}`);
      return;
    }

    const { swarmCode, formatSwarmResult } = require('../../swarm');
    console.log(c.dim(`Dispatching to swarm: "${task.slice(0, 80)}${task.length > 80 ? '...' : ''}"...`));
    const result = await swarmCode(task, args.language || 'javascript', {
      rootDir: process.cwd(),
      crossScoring: args['no-cross-scoring'] ? false : undefined,
      oracle,
    });
    if (jsonOut(args, result)) return;
    console.log(formatSwarmResult(result));
  };
}

module.exports = { registerSwarmCommands };
