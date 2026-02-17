'use strict';

/**
 * Error Recovery & Fallback Module
 *
 * When agents fail (rate limit, timeout, bad output), this module:
 * 1. Classifies the error type
 * 2. Retries with adjusted parameters per error class
 * 3. Falls back to next-best agent or cached oracle patterns
 * 4. Logs all failures for history tracking
 *
 * Oracle decision: EVOLVE from retry-async (1.000) + pipe (0.970)
 */

/**
 * Error classification — determines retry strategy.
 */
const ERROR_CLASSES = {
  RATE_LIMIT: 'rate_limit',
  TIMEOUT: 'timeout',
  AUTH: 'auth',
  BAD_OUTPUT: 'bad_output',
  NETWORK: 'network',
  UNKNOWN: 'unknown',
};

/**
 * Classify an error into a recovery-relevant category.
 *
 * @param {Error|string} error - The error to classify
 * @returns {string} Error class from ERROR_CLASSES
 */
function classifyError(error) {
  const msg = (typeof error === 'string' ? error : error?.message || '').toLowerCase();

  if (msg.includes('rate') || msg.includes('429') || msg.includes('quota') || msg.includes('limit')) {
    return ERROR_CLASSES.RATE_LIMIT;
  }
  if (msg.includes('timeout') || msg.includes('abort') || msg.includes('timed out')) {
    return ERROR_CLASSES.TIMEOUT;
  }
  if (msg.includes('401') || msg.includes('403') || msg.includes('auth') || msg.includes('key')) {
    return ERROR_CLASSES.AUTH;
  }
  if (msg.includes('fetch') || msg.includes('econnrefused') || msg.includes('network') || msg.includes('dns')) {
    return ERROR_CLASSES.NETWORK;
  }

  return ERROR_CLASSES.UNKNOWN;
}

/**
 * Get recovery strategy for an error class.
 *
 * @param {string} errorClass - From classifyError()
 * @returns {{ retry: boolean, delayMs: number, adjustPrompt: boolean, fallbackToCache: boolean }}
 */
function getRecoveryStrategy(errorClass) {
  const strategies = {
    [ERROR_CLASSES.RATE_LIMIT]: {
      retry: true,
      delayMs: 5000,     // Wait longer for rate limits
      adjustPrompt: false,
      fallbackToCache: false,
    },
    [ERROR_CLASSES.TIMEOUT]: {
      retry: true,
      delayMs: 1000,
      adjustPrompt: true, // Shorten prompt on timeout
      fallbackToCache: true,
    },
    [ERROR_CLASSES.AUTH]: {
      retry: false,        // Auth errors won't resolve with retry
      delayMs: 0,
      adjustPrompt: false,
      fallbackToCache: true,
    },
    [ERROR_CLASSES.BAD_OUTPUT]: {
      retry: true,
      delayMs: 500,
      adjustPrompt: true, // Rephrase prompt
      fallbackToCache: true,
    },
    [ERROR_CLASSES.NETWORK]: {
      retry: true,
      delayMs: 2000,
      adjustPrompt: false,
      fallbackToCache: true,
    },
    [ERROR_CLASSES.UNKNOWN]: {
      retry: true,
      delayMs: 1000,
      adjustPrompt: false,
      fallbackToCache: true,
    },
  };

  return strategies[errorClass] || strategies[ERROR_CLASSES.UNKNOWN];
}

/**
 * Attempt to send to an agent with automatic error recovery.
 * On failure: classify error → apply strategy → retry or fall back.
 *
 * @param {object} agent - Agent adapter with send() method
 * @param {string} prompt - The prompt to send
 * @param {object} options - Send options (system, maxTokens, etc.)
 * @param {object} [recoveryOpts] - Recovery configuration
 * @param {number} [recoveryOpts.maxRetries=1] - Max retries per agent
 * @param {function} [recoveryOpts.onError] - Error callback: (agent, error, errorClass) => void
 * @returns {object} { response, meta, recovered, errors }
 */
async function sendWithRecovery(agent, prompt, options = {}, recoveryOpts = {}) {
  const maxRetries = recoveryOpts.maxRetries ?? 1;
  const errors = [];

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await agent.send(prompt, options);

      // Check for bad output (empty response)
      if (!result.response || result.response.trim().length === 0) {
        const badErr = new Error(`${agent.name}: empty response`);
        errors.push({ attempt, error: badErr.message, class: ERROR_CLASSES.BAD_OUTPUT });
        if (recoveryOpts.onError) recoveryOpts.onError(agent.name, badErr, ERROR_CLASSES.BAD_OUTPUT);

        const strategy = getRecoveryStrategy(ERROR_CLASSES.BAD_OUTPUT);
        if (strategy.retry && attempt < maxRetries) {
          await new Promise(r => setTimeout(r, strategy.delayMs));
          continue;
        }
        return { response: '', meta: result.meta, recovered: false, errors };
      }

      return {
        response: result.response,
        meta: result.meta,
        recovered: attempt > 0,
        errors,
      };
    } catch (err) {
      const errorClass = classifyError(err);
      errors.push({ attempt, error: err.message, class: errorClass });
      if (recoveryOpts.onError) recoveryOpts.onError(agent.name, err, errorClass);

      const strategy = getRecoveryStrategy(errorClass);

      if (!strategy.retry || attempt >= maxRetries) {
        return { response: '', meta: {}, recovered: false, errors };
      }

      // Exponential backoff based on strategy delay
      const delay = strategy.delayMs * Math.pow(2, attempt);
      await new Promise(r => setTimeout(r, delay));
    }
  }

  return { response: '', meta: {}, recovered: false, errors };
}

/**
 * Dispatch to all agents with recovery, then fall back to oracle cache
 * for any agents that completely failed.
 *
 * @param {object[]} agents - Agent adapters
 * @param {string} prompt - Task prompt
 * @param {object} options - Send options
 * @param {object} [fallbackOpts] - Fallback configuration
 * @param {function} [fallbackOpts.oracleSearch] - oracle.search(query) for cache fallback
 * @param {string} [fallbackOpts.task] - Task description for oracle search
 * @returns {object[]} Results array with { agent, response, meta, recovered, errors, fromCache }
 */
async function dispatchWithRecovery(agents, prompt, options = {}, fallbackOpts = {}) {
  const errorLog = [];

  const results = await Promise.all(
    agents.map(async (agent) => {
      const result = await sendWithRecovery(agent, prompt, options, {
        maxRetries: 1,
        onError: (name, err, cls) => {
          errorLog.push({ agent: name, error: err.message, class: cls, timestamp: new Date().toISOString() });
        },
      });

      return {
        agent: agent.name,
        ...result,
        fromCache: false,
      };
    })
  );

  // For completely failed agents, attempt oracle cache fallback
  if (fallbackOpts.oracleSearch && fallbackOpts.task) {
    for (const result of results) {
      if (!result.response && result.errors.length > 0) {
        const lastError = result.errors[result.errors.length - 1];
        const strategy = getRecoveryStrategy(lastError.class);
        if (strategy.fallbackToCache) {
          try {
            const cached = fallbackOpts.oracleSearch(fallbackOpts.task);
            if (cached && cached.length > 0 && cached[0].code) {
              result.response = `\`\`\`\n${cached[0].code}\n\`\`\`\nCONFIDENCE: ${cached[0].coherency || 0.6}\n(Cached from oracle pattern: ${cached[0].name || 'unknown'})`;
              result.fromCache = true;
            }
          } catch {
            // Oracle cache unavailable
          }
        }
      }
    }
  }

  return results;
}

/**
 * Build an error summary for the swarm result.
 *
 * @param {object[]} errors - Array of { agent, error, class, timestamp }
 * @returns {object} { totalErrors, byClass, byAgent, critical }
 */
function buildErrorSummary(errors) {
  const byClass = {};
  const byAgent = {};

  for (const err of errors) {
    byClass[err.class] = (byClass[err.class] || 0) + 1;
    byAgent[err.agent] = (byAgent[err.agent] || 0) + 1;
  }

  return {
    totalErrors: errors.length,
    byClass,
    byAgent,
    critical: errors.some(e =>
      e.class === ERROR_CLASSES.AUTH || e.class === ERROR_CLASSES.NETWORK
    ),
  };
}

module.exports = {
  ERROR_CLASSES,
  classifyError,
  getRecoveryStrategy,
  sendWithRecovery,
  dispatchWithRecovery,
  buildErrorSummary,
};
