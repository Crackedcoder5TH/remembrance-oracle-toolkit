'use strict';

const crypto = require('crypto');
const { loadSwarmConfig, resolveProviders } = require('./swarm-config');
const { createAgentPool } = require('./agent-pool');
const { assignDimensions, buildSpecialistPrompt, parseAgentResponse } = require('./dimension-router');
const { scoreWithCoherency, crossScore, computePeerScores } = require('./cross-scoring');
const { buildConsensus, quickConsensus, mergeTopOutputs } = require('./consensus');
const { synthesizeWhisper, formatWhisper } = require('./whisper-synthesis');

/**
 * Main swarm orchestration — 7-step pipeline.
 *
 * Step 1: CONFIGURE   — Load config, resolve available providers
 * Step 2: ASSEMBLE    — Create agent pool, assign dimensions
 * Step 3: DISPATCH    — Send task to all agents in parallel
 * Step 4: COLLECT     — Gather responses, handle timeouts/failures
 * Step 5: CROSS-SCORE — Agents evaluate each other (optional)
 * Step 6: CONSENSUS   — Weighted vote → winner
 * Step 7: INTEGRATE   — Feed winner to Oracle + Reflector
 *
 * @param {string} task - The task description
 * @param {object} [options] - Override options
 * @param {string} [options.rootDir] - Project root
 * @param {string} [options.language] - Target language
 * @param {string} [options.existingCode] - Code to improve/review
 * @param {boolean} [options.crossScoring] - Enable peer scoring (default: config)
 * @param {boolean} [options.autoFeedToReflector] - Auto-integrate winner (default: config)
 * @param {function} [options.coherencyFn] - Override coherency function
 * @param {object} [options.oracle] - Oracle instance for integration
 * @returns {object} SwarmResult
 */
async function swarm(task, options = {}) {
  const startTime = Date.now();
  const id = crypto.randomUUID();
  const steps = [];
  let config, pool, assignments, agentOutputs, coherencyScores, peerScores, consensus, whisper;

  // ─── Step 1: CONFIGURE ───
  const stepStart1 = Date.now();
  try {
    config = loadSwarmConfig(options.rootDir);
    // Apply option overrides
    if (options.crossScoring !== undefined) config.crossScoring = options.crossScoring;
    if (options.autoFeedToReflector !== undefined) config.autoFeedToReflector = options.autoFeedToReflector;

    const providers = resolveProviders(config);
    if (providers.length === 0) {
      throw new Error('No providers available. Set API keys (ANTHROPIC_API_KEY, OPENAI_API_KEY, etc.) or configure providers in .remembrance/swarm-config.json');
    }

    steps.push({ name: 'configure', status: 'ok', durationMs: Date.now() - stepStart1, providers });
  } catch (err) {
    steps.push({ name: 'configure', status: 'error', durationMs: Date.now() - stepStart1, error: err.message });
    return buildResult(id, task, steps, null, null, Date.now() - startTime);
  }

  // ─── Step 2: ASSEMBLE ───
  const stepStart2 = Date.now();
  try {
    const providers = steps[0].providers;
    pool = createAgentPool(config, providers);

    if (pool.size === 0) {
      throw new Error('No agents could be initialized from available providers');
    }

    assignments = assignDimensions(pool.agents, config.dimensions);

    steps.push({
      name: 'assemble',
      status: 'ok',
      durationMs: Date.now() - stepStart2,
      agentCount: pool.size,
      assignments: Object.fromEntries(assignments),
    });
  } catch (err) {
    steps.push({ name: 'assemble', status: 'error', durationMs: Date.now() - stepStart2, error: err.message });
    return buildResult(id, task, steps, null, null, Date.now() - startTime);
  }

  // ─── Step 3: DISPATCH ───
  const stepStart3 = Date.now();
  try {
    const dispatchPromises = pool.agents.map(async (agent) => {
      const dims = assignments.get(agent.name) || ['generalist'];
      const { system, user } = buildSpecialistPrompt(task, dims, {
        language: options.language,
        existingCode: options.existingCode,
      });

      const start = Date.now();
      try {
        const { response, meta } = await agent.send(user, { system });
        return {
          agent: agent.name,
          dimensions: dims,
          raw: response,
          durationMs: Date.now() - start,
          meta,
        };
      } catch (err) {
        return {
          agent: agent.name,
          dimensions: dims,
          raw: '',
          error: err.message,
          durationMs: Date.now() - start,
        };
      }
    });

    const rawOutputs = await Promise.all(dispatchPromises);

    steps.push({
      name: 'dispatch',
      status: 'ok',
      durationMs: Date.now() - stepStart3,
      dispatched: rawOutputs.length,
      succeeded: rawOutputs.filter(o => !o.error).length,
      failed: rawOutputs.filter(o => o.error).length,
    });

    // ─── Step 4: COLLECT ───
    const stepStart4 = Date.now();
    agentOutputs = rawOutputs
      .filter(o => !o.error)
      .map(o => {
        const parsed = parseAgentResponse(o.raw);
        return {
          agent: o.agent,
          dimensions: o.dimensions,
          code: parsed.code,
          explanation: parsed.explanation,
          confidence: parsed.confidence,
          durationMs: o.durationMs,
          meta: o.meta,
        };
      });

    steps.push({
      name: 'collect',
      status: 'ok',
      durationMs: Date.now() - stepStart4,
      collected: agentOutputs.length,
      withCode: agentOutputs.filter(o => o.code).length,
    });
  } catch (err) {
    steps.push({ name: 'dispatch', status: 'error', durationMs: Date.now() - stepStart3, error: err.message });
    return buildResult(id, task, steps, null, null, Date.now() - startTime);
  }

  // ─── Step 5: CROSS-SCORE ───
  const stepStart5 = Date.now();
  try {
    // Always compute coherency scores locally (fast, no API calls)
    const coherencyFn = options.coherencyFn || getDefaultCoherencyFn();
    coherencyScores = scoreWithCoherency(agentOutputs, coherencyFn);

    if (config.crossScoring && pool.size > 1) {
      // Full cross-scoring via API calls
      const matrix = await crossScore(agentOutputs, pool, config.dimensions);
      const agentNames = agentOutputs.map(o => o.agent);
      peerScores = computePeerScores(matrix, agentNames);
      steps.push({ name: 'cross-score', status: 'ok', durationMs: Date.now() - stepStart5, mode: 'full' });
    } else {
      // Quick mode — no peer scoring
      peerScores = new Map(agentOutputs.map(o => [o.agent, 0.5]));
      steps.push({ name: 'cross-score', status: 'ok', durationMs: Date.now() - stepStart5, mode: 'quick' });
    }
  } catch (err) {
    // Fallback to quick consensus on cross-scoring failure
    peerScores = new Map(agentOutputs.map(o => [o.agent, 0.5]));
    steps.push({ name: 'cross-score', status: 'error', durationMs: Date.now() - stepStart5, error: err.message });
  }

  // ─── Step 6: CONSENSUS ───
  const stepStart6 = Date.now();
  try {
    if (config.crossScoring && steps.find(s => s.name === 'cross-score')?.mode === 'full') {
      consensus = buildConsensus(agentOutputs, coherencyScores, peerScores, config);
    } else {
      consensus = quickConsensus(agentOutputs, coherencyScores, config);
    }

    whisper = synthesizeWhisper(consensus, agentOutputs, task);

    steps.push({
      name: 'consensus',
      status: 'ok',
      durationMs: Date.now() - stepStart6,
      winner: consensus.winner?.agent || null,
      winnerScore: consensus.winner?.score || 0,
      agreement: consensus.agreement,
      agentsRanked: consensus.rankings.length,
    });
  } catch (err) {
    steps.push({ name: 'consensus', status: 'error', durationMs: Date.now() - stepStart6, error: err.message });
    return buildResult(id, task, steps, null, null, Date.now() - startTime);
  }

  // ─── Step 7: INTEGRATE ───
  const stepStart7 = Date.now();
  try {
    let integration = { status: 'skipped' };

    if (config.autoFeedToReflector && consensus.winner?.code && options.oracle) {
      // Submit winning code to the oracle
      const result = options.oracle.submit(consensus.winner.code, {
        language: options.language || 'javascript',
        description: `Swarm consensus winner for: ${task.slice(0, 200)}`,
        tags: ['swarm', 'consensus', ...(consensus.winner.dimensions || [])],
      });
      integration = { status: 'submitted', stored: result.stored || false, coherency: result.coherency?.total };
    }

    steps.push({ name: 'integrate', status: 'ok', durationMs: Date.now() - stepStart7, ...integration });
  } catch (err) {
    steps.push({ name: 'integrate', status: 'error', durationMs: Date.now() - stepStart7, error: err.message });
  }

  const totalDurationMs = Date.now() - startTime;
  pool.shutdown();

  return buildResult(id, task, steps, consensus, whisper, totalDurationMs);
}

/**
 * Convenience: swarm for code generation tasks.
 */
async function swarmCode(description, language, options = {}) {
  return swarm(description, { ...options, language });
}

/**
 * Convenience: swarm for code review tasks.
 */
async function swarmReview(code, options = {}) {
  const task = `Review the following code for quality, security, correctness, and suggest improvements:\n\n${code}`;
  return swarm(task, { ...options, existingCode: code });
}

/**
 * Convenience: swarm for healing tasks.
 */
async function swarmHeal(code, options = {}) {
  const task = `Improve the following code. Fix any bugs, improve readability, and optimize performance while maintaining the same interface:\n\n${code}`;
  return swarm(task, { ...options, existingCode: code });
}

/**
 * Build the final SwarmResult object.
 */
function buildResult(id, task, steps, consensus, whisper, totalDurationMs) {
  return {
    id,
    timestamp: new Date().toISOString(),
    task,
    steps,
    winner: consensus?.winner || null,
    rankings: consensus?.rankings || [],
    agreement: consensus?.agreement || 0,
    whisper: whisper || null,
    agentCount: steps.find(s => s.name === 'assemble')?.agentCount || 0,
    totalDurationMs,
  };
}

/**
 * Get the default coherency function from the oracle core.
 */
function getDefaultCoherencyFn() {
  try {
    const { computeCoherencyScore } = require('../core/coherency');
    return computeCoherencyScore;
  } catch {
    // Fallback: simple heuristic scorer
    return (code) => ({
      total: code && code.length > 10 ? 0.6 : 0.2,
      breakdown: {},
    });
  }
}

/**
 * Format a SwarmResult for terminal display.
 *
 * @param {object} result - SwarmResult from swarm()
 * @returns {string} Formatted text
 */
function formatSwarmResult(result) {
  const lines = [];
  lines.push('Swarm Orchestration');
  lines.push(`ID: ${result.id}`);
  lines.push(`Task: ${result.task.slice(0, 100)}${result.task.length > 100 ? '...' : ''}`);
  lines.push(`Agents: ${result.agentCount} | Duration: ${(result.totalDurationMs / 1000).toFixed(1)}s`);
  lines.push('');

  // Steps
  lines.push('Pipeline:');
  for (const step of result.steps) {
    const icon = step.status === 'ok' ? '+' : step.status === 'error' ? '!' : '-';
    const extra = step.error ? ` (${step.error.slice(0, 60)})` : '';
    lines.push(`  [${icon}] ${step.name} (${step.durationMs}ms)${extra}`);
  }

  // Winner
  if (result.winner) {
    lines.push('');
    lines.push(`Winner: ${result.winner.agent} (score: ${result.winner.score.toFixed(3)})`);
    lines.push(`Agreement: ${(result.agreement * 100).toFixed(0)}%`);

    if (result.winner.code) {
      lines.push('');
      lines.push('Winning code:');
      lines.push('```');
      lines.push(result.winner.code);
      lines.push('```');
    }
  } else {
    lines.push('');
    lines.push('No winner — swarm could not reach consensus.');
  }

  // Whisper
  if (result.whisper) {
    lines.push('');
    lines.push(formatWhisper(result.whisper));
  }

  return lines.join('\n');
}

module.exports = {
  swarm,
  swarmCode,
  swarmReview,
  swarmHeal,
  formatSwarmResult,
};
