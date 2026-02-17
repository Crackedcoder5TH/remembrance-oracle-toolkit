'use strict';

/**
 * Escalation Module
 *
 * Auto-retries the swarm when collective coherence falls below threshold.
 * Escalation modes:
 *   - retry:  Re-run with same config (transient failures)
 *   - expand: Re-run with more agents
 *   - deep:   Re-run with extended timeout + chain-of-thought prompts
 *
 * Pulled from oracle pattern: retry-async (coherency 1.000)
 * Evolved to handle swarm-level escalation with multi-mode support.
 */

const DEFAULT_ESCALATION_CONFIG = {
  enabled: true,
  coherenceFloor: 0.90,      // Trigger escalation below this
  maxRetries: 2,              // Max escalation attempts
  modes: ['retry', 'expand', 'deep'], // Escalation progression
  deepTimeoutMultiplier: 2,   // Multiply timeout in deep mode
  expandAgentBoost: 2,        // Extra agents in expand mode
};

/**
 * Determine if escalation is needed based on swarm result.
 *
 * @param {object} result - SwarmResult from swarm()
 * @param {object} escalationConfig - Escalation settings
 * @returns {{ needed: boolean, reason: string, mode: string|null }}
 */
function shouldEscalate(result, escalationConfig) {
  const config = { ...DEFAULT_ESCALATION_CONFIG, ...escalationConfig };

  if (!config.enabled) {
    return { needed: false, reason: 'escalation disabled', mode: null };
  }

  // No winner at all — always escalate
  if (!result.winner) {
    return { needed: true, reason: 'no winner produced', mode: 'retry' };
  }

  // Winner score below floor
  if (result.winner.score < config.coherenceFloor) {
    return {
      needed: true,
      reason: `winner score ${result.winner.score.toFixed(3)} < floor ${config.coherenceFloor}`,
      mode: null, // Will be determined by attempt number
    };
  }

  // Low agreement
  if (result.agreement < 0.5 && result.agentCount > 1) {
    return {
      needed: true,
      reason: `low agreement ${(result.agreement * 100).toFixed(0)}% with ${result.agentCount} agents`,
      mode: null,
    };
  }

  return { needed: false, reason: 'coherence acceptable', mode: null };
}

/**
 * Get the escalation mode for a given attempt number.
 * Progresses through modes: retry → expand → deep
 *
 * @param {number} attempt - Current attempt (0-indexed)
 * @param {object} escalationConfig - Escalation settings
 * @returns {string} Escalation mode
 */
function getEscalationMode(attempt, escalationConfig) {
  const config = { ...DEFAULT_ESCALATION_CONFIG, ...escalationConfig };
  const modes = config.modes;
  return modes[Math.min(attempt, modes.length - 1)];
}

/**
 * Apply escalation adjustments to swarm options based on mode.
 *
 * @param {string} mode - Escalation mode (retry, expand, deep)
 * @param {object} currentOptions - Current swarm options
 * @param {object} escalationConfig - Escalation settings
 * @returns {object} Adjusted options for the next swarm run
 */
function applyEscalation(mode, currentOptions, escalationConfig) {
  const config = { ...DEFAULT_ESCALATION_CONFIG, ...escalationConfig };
  const adjusted = { ...currentOptions };

  switch (mode) {
    case 'retry':
      // Same config, just re-run (handles transient failures)
      break;

    case 'expand':
      // Force cross-scoring on and signal to use more agents
      adjusted.crossScoring = true;
      adjusted._expandAgents = config.expandAgentBoost;
      break;

    case 'deep':
      // Extended timeout + chain-of-thought prompting
      adjusted.crossScoring = true;
      adjusted._deepMode = true;
      adjusted._timeoutMultiplier = config.deepTimeoutMultiplier;
      break;
  }

  return adjusted;
}

/**
 * Run swarm with automatic escalation on low coherence.
 * Uses exponential backoff between retries (pulled from oracle: retry-async, coherency 1.000).
 *
 * @param {function} swarmFn - The swarm() function to call
 * @param {string} task - Task description
 * @param {object} options - Swarm options
 * @param {object} [escalationConfig] - Escalation overrides
 * @returns {object} Final SwarmResult (with escalation metadata)
 */
async function swarmWithEscalation(swarmFn, task, options = {}, escalationConfig = {}) {
  const config = { ...DEFAULT_ESCALATION_CONFIG, ...escalationConfig };
  const attempts = [];
  let lastResult = null;

  for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
    const adjustedOptions = attempt === 0
      ? options
      : applyEscalation(getEscalationMode(attempt - 1, config), options, config);

    lastResult = await swarmFn(task, adjustedOptions);

    attempts.push({
      attempt,
      mode: attempt === 0 ? 'initial' : getEscalationMode(attempt - 1, config),
      winnerScore: lastResult.winner?.score || 0,
      agreement: lastResult.agreement,
      agentCount: lastResult.agentCount,
      durationMs: lastResult.totalDurationMs,
    });

    const { needed, reason } = shouldEscalate(lastResult, config);
    if (!needed) break;

    // Don't retry if we've exhausted attempts
    if (attempt >= config.maxRetries) break;

    // Exponential backoff between retries (from oracle: retry-async)
    const delay = 1000 * Math.pow(2, attempt);
    await new Promise(r => setTimeout(r, delay));
  }

  // Attach escalation metadata to the result
  lastResult.escalation = {
    attempts,
    totalAttempts: attempts.length,
    escalated: attempts.length > 1,
    finalMode: attempts[attempts.length - 1].mode,
  };

  return lastResult;
}

module.exports = {
  DEFAULT_ESCALATION_CONFIG,
  shouldEscalate,
  getEscalationMode,
  applyEscalation,
  swarmWithEscalation,
};
