'use strict';

/**
 * Swarm Pattern Auto-Registration Module
 *
 * When a swarm run produces code with coherence >= threshold,
 * automatically registers it in the oracle pattern library.
 * The swarm feeds the pattern bank → Oracle gets smarter.
 *
 * Oracle decision: EVOLVE from pipe (0.970) + core auto-register patterns.
 */

const DEFAULT_AUTO_REGISTER_CONFIG = {
  enabled: true,
  coherenceThreshold: 0.95, // Only register truly excellent code
  agreementThreshold: 0.7,  // Need reasonable consensus
  maxCodeLength: 10000,     // Don't register massive outputs
  tags: ['swarm', 'auto-registered', 'consensus'],
};

/**
 * Check if a swarm result qualifies for auto-registration.
 *
 * @param {object} result - SwarmResult
 * @param {object} [config] - Auto-registration config overrides
 * @returns {{ qualifies: boolean, reason: string }}
 */
function qualifiesForRegistration(result, config = {}) {
  const cfg = { ...DEFAULT_AUTO_REGISTER_CONFIG, ...config };

  if (!cfg.enabled) {
    return { qualifies: false, reason: 'auto-registration disabled' };
  }

  if (!result.winner?.code) {
    return { qualifies: false, reason: 'no winning code' };
  }

  if (result.winner.score < cfg.coherenceThreshold) {
    return {
      qualifies: false,
      reason: `score ${result.winner.score.toFixed(3)} < threshold ${cfg.coherenceThreshold}`,
    };
  }

  if (result.agreement < cfg.agreementThreshold) {
    return {
      qualifies: false,
      reason: `agreement ${(result.agreement * 100).toFixed(0)}% < threshold ${(cfg.agreementThreshold * 100).toFixed(0)}%`,
    };
  }

  if (result.winner.code.length > cfg.maxCodeLength) {
    return {
      qualifies: false,
      reason: `code too long (${result.winner.code.length} > ${cfg.maxCodeLength})`,
    };
  }

  return { qualifies: true, reason: 'meets all thresholds' };
}

/**
 * Auto-register a swarm result's winning code with the oracle.
 *
 * @param {object} result - SwarmResult
 * @param {object} oracle - Oracle instance with register() or submit() method
 * @param {object} [config] - Auto-registration config
 * @returns {{ registered: boolean, reason: string, patternId: string|null }}
 */
function autoRegisterResult(result, oracle, config = {}) {
  const cfg = { ...DEFAULT_AUTO_REGISTER_CONFIG, ...config };
  const check = qualifiesForRegistration(result, cfg);

  if (!check.qualifies) {
    return { registered: false, reason: check.reason, patternId: null };
  }

  if (!oracle) {
    return { registered: false, reason: 'no oracle instance', patternId: null };
  }

  try {
    // Try register first (named patterns), fall back to submit (anonymous)
    const taskName = extractTaskName(result.task || '');
    const language = detectLanguage(result.winner.code);
    const tags = [
      ...cfg.tags,
      ...(result.winner.dimensions || []),
      language,
    ];

    let registerResult;
    if (typeof oracle.register === 'function') {
      registerResult = oracle.register({
        name: taskName,
        code: result.winner.code,
        language,
        tags,
        description: `Swarm consensus winner (score: ${result.winner.score.toFixed(3)}, agreement: ${(result.agreement * 100).toFixed(0)}%)`,
      });
    } else if (typeof oracle.submit === 'function') {
      registerResult = oracle.submit(result.winner.code, {
        language,
        tags,
        description: `Swarm winner: ${taskName}`,
      });
    } else {
      return { registered: false, reason: 'oracle has no register/submit method', patternId: null };
    }

    return {
      registered: true,
      reason: check.reason,
      patternId: registerResult?.id || registerResult?.patternId || null,
    };
  } catch (err) {
    return { registered: false, reason: `registration failed: ${err.message}`, patternId: null };
  }
}

/**
 * Process a batch of completed swarm results for auto-registration.
 *
 * @param {object[]} results - Array of SwarmResults
 * @param {object} oracle - Oracle instance
 * @param {object} [config] - Config overrides
 * @returns {{ total: number, registered: number, skipped: number, details: object[] }}
 */
function batchAutoRegister(results, oracle, config = {}) {
  const details = [];
  let registered = 0;

  for (const result of results) {
    const outcome = autoRegisterResult(result, oracle, config);
    details.push({
      id: result.id,
      task: (result.task || '').slice(0, 80),
      ...outcome,
    });
    if (outcome.registered) registered++;
  }

  return {
    total: results.length,
    registered,
    skipped: results.length - registered,
    details,
  };
}

/**
 * Extract a short pattern name from a task description.
 */
function extractTaskName(task) {
  // Take first 40 chars, convert to kebab-case
  return task
    .slice(0, 40)
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    || 'swarm-output';
}

/**
 * Simple language detection from code.
 */
function detectLanguage(code) {
  if (!code) return 'javascript';
  if (code.includes('def ') && code.includes(':')) return 'python';
  if (code.includes('fn ') && code.includes('->')) return 'rust';
  if (code.includes('func ') && code.includes('package')) return 'go';
  if (code.includes(': string') || code.includes(': number') || code.includes('interface ')) return 'typescript';
  return 'javascript';
}

module.exports = {
  DEFAULT_AUTO_REGISTER_CONFIG,
  qualifiesForRegistration,
  autoRegisterResult,
  batchAutoRegister,
  extractTaskName,
  detectLanguage,
};
