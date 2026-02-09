/**
 * Remembrance Self-Reflector — Error Handling & Logging Wrapper
 *
 * Wraps reflector operations with:
 *
 * 1. Try/catch with structured error capture (stack trace, context, timestamp)
 * 2. Automatic logging to history.js (appendLog) with severity levels
 * 3. Graceful fallback — if a step fails, return cached/default data
 * 4. Retry with exponential backoff for transient failures (git, network)
 * 5. Circuit breaker — stop retrying after repeated failures
 * 6. Error classification — transient vs fatal vs configuration
 *
 * Uses only Node.js built-ins.
 */

const { appendLog, readLogTail } = require('./history');
const { ensureDir, loadJSON, saveJSON } = require('./utils');
const { join } = require('path');

// ─── Error Classification ───

const ERROR_TYPES = {
  TRANSIENT: 'transient',       // Git timeout, file lock, temp disk issue
  FATAL: 'fatal',               // Code bug, missing module, corrupt data
  CONFIG: 'configuration',      // Bad config values, missing paths
  PERMISSION: 'permission',     // File permission denied, git auth failure
  RESOURCE: 'resource',         // Out of memory, disk full, too many files
};

/**
 * Classify an error by type based on its message and code.
 *
 * @param {Error} err - The error to classify
 * @returns {string} Error type from ERROR_TYPES
 */
function classifyError(err) {
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';

  // Permission errors
  if (code === 'EACCES' || code === 'EPERM' || msg.includes('permission denied') || msg.includes('authentication failed')) {
    return ERROR_TYPES.PERMISSION;
  }

  // Transient errors
  if (code === 'EAGAIN' || code === 'EBUSY' || code === 'ECONNRESET' || code === 'ETIMEDOUT' ||
      msg.includes('timeout') || msg.includes('lock') || msg.includes('busy') ||
      msg.includes('network') || msg.includes('connection refused') || msg.includes('econnreset')) {
    return ERROR_TYPES.TRANSIENT;
  }

  // Resource errors
  if (code === 'ENOMEM' || code === 'ENOSPC' || msg.includes('out of memory') || msg.includes('disk full') || msg.includes('no space')) {
    return ERROR_TYPES.RESOURCE;
  }

  // Configuration errors
  if (msg.includes('config') || msg.includes('invalid') && msg.includes('option') ||
      msg.includes('not found') && (msg.includes('path') || msg.includes('directory')) ||
      code === 'ENOENT') {
    return ERROR_TYPES.CONFIG;
  }

  return ERROR_TYPES.FATAL;
}

// ─── Structured Error Wrapper ───

/**
 * Wrap an operation with try/catch, logging, and optional fallback.
 *
 * @param {string} operationName - Name for logging (e.g., 'snapshot', 'heal')
 * @param {Function} fn - The operation to execute
 * @param {object} options - { rootDir, fallback, context, logLevel }
 * @returns {object} { success, result, error, errorType, durationMs }
 */
function withErrorHandling(operationName, fn, options = {}) {
  const {
    rootDir = process.cwd(),
    fallback = null,
    context = {},
    logLevel = 'ERROR',
  } = options;

  const startTime = Date.now();

  try {
    const result = fn();
    const durationMs = Date.now() - startTime;

    // Log success if verbose
    if (options.verbose) {
      appendLog(rootDir, 'INFO', `${operationName} completed`, { durationMs, ...context });
    }

    return {
      success: true,
      result,
      error: null,
      errorType: null,
      durationMs,
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorType = classifyError(err);

    // Log the error
    appendLog(rootDir, logLevel, `${operationName} failed: ${err.message}`, {
      errorType,
      stack: err.stack?.split('\n').slice(0, 5).join(' | '),
      durationMs,
      ...context,
    });

    // Use fallback if provided
    const fallbackValue = typeof fallback === 'function' ? fallback(err) : fallback;

    return {
      success: false,
      result: fallbackValue,
      error: err.message,
      errorType,
      durationMs,
      stack: err.stack,
    };
  }
}

// ─── Retry with Exponential Backoff ───

/**
 * Retry a synchronous operation with exponential backoff.
 * Only retries transient errors.
 *
 * @param {string} operationName - Name for logging
 * @param {Function} fn - Operation to retry
 * @param {object} options - { maxRetries, baseDelayMs, rootDir, context }
 * @returns {object} { success, result, error, attempts, totalMs }
 */
function withRetry(operationName, fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelayMs = 100,
    rootDir = process.cwd(),
    context = {},
  } = options;

  const startTime = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = fn();
      return {
        success: true,
        result,
        error: null,
        attempts: attempt,
        totalMs: Date.now() - startTime,
      };
    } catch (err) {
      lastError = err;
      const errorType = classifyError(err);

      // Only retry transient errors
      if (errorType !== ERROR_TYPES.TRANSIENT || attempt > maxRetries) {
        appendLog(rootDir, 'ERROR', `${operationName} failed (${errorType}, attempt ${attempt}/${maxRetries + 1})`, {
          error: err.message,
          errorType,
          attempt,
          ...context,
        });
        break;
      }

      // Exponential backoff
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      appendLog(rootDir, 'WARN', `${operationName} transient failure, retrying in ${delay}ms (attempt ${attempt})`, {
        error: err.message,
        delay,
        ...context,
      });

      // Synchronous sleep via Atomics.wait (non-spinning, CPU-friendly)
      try {
        const buf = new SharedArrayBuffer(4);
        Atomics.wait(new Int32Array(buf), 0, 0, delay);
      } catch {
        // Fallback for environments without SharedArrayBuffer
        const waitUntil = Date.now() + delay;
        while (Date.now() < waitUntil) { /* spin fallback */ }
      }
    }
  }

  return {
    success: false,
    result: null,
    error: lastError?.message || 'Unknown error',
    errorType: classifyError(lastError),
    attempts: maxRetries + 1,
    totalMs: Date.now() - startTime,
  };
}

// ─── Circuit Breaker ───

// In-memory state (resets on process restart)
const circuitState = new Map();

/**
 * Circuit breaker for operations that fail repeatedly.
 * After `threshold` consecutive failures, the circuit opens for `cooldownMs`.
 *
 * @param {string} operationName - Unique operation identifier
 * @param {Function} fn - Operation to execute
 * @param {object} options - { threshold, cooldownMs, rootDir }
 * @returns {object} { success, result, circuitOpen, failures }
 */
function withCircuitBreaker(operationName, fn, options = {}) {
  const {
    threshold = 5,
    cooldownMs = 60000,
    rootDir = process.cwd(),
  } = options;

  // Get or initialize circuit state
  if (!circuitState.has(operationName)) {
    circuitState.set(operationName, { failures: 0, lastFailure: 0, open: false });
  }
  const state = circuitState.get(operationName);

  // Check if circuit is open
  if (state.open) {
    if (Date.now() - state.lastFailure < cooldownMs) {
      return {
        success: false,
        result: null,
        error: `Circuit breaker open for "${operationName}". ${state.failures} consecutive failures. Cooldown: ${Math.round((cooldownMs - (Date.now() - state.lastFailure)) / 1000)}s remaining.`,
        circuitOpen: true,
        failures: state.failures,
      };
    }
    // Cooldown expired — try half-open
    state.open = false;
  }

  try {
    const result = fn();
    // Success — reset failures
    state.failures = 0;
    state.open = false;
    return { success: true, result, circuitOpen: false, failures: 0 };
  } catch (err) {
    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= threshold) {
      state.open = true;
      appendLog(rootDir, 'ERROR', `Circuit breaker opened for "${operationName}" after ${state.failures} failures`, {
        error: err.message,
        cooldownMs,
      });
    }

    return {
      success: false,
      result: null,
      error: err.message,
      circuitOpen: state.open,
      failures: state.failures,
    };
  }
}

/**
 * Reset circuit breaker state for an operation (or all operations).
 */
function resetCircuitBreaker(operationName) {
  if (operationName) {
    circuitState.delete(operationName);
  } else {
    circuitState.clear();
  }
}

/**
 * Get circuit breaker status for an operation.
 */
function getCircuitStatus(operationName) {
  return circuitState.get(operationName) || { failures: 0, lastFailure: 0, open: false };
}

// ─── Error Report ───

/**
 * Build a structured error report from recent log entries.
 *
 * @param {string} rootDir - Repository root
 * @param {number} lastN - Number of log entries to scan
 * @returns {object} Error summary
 */
function buildErrorReport(rootDir, lastN = 50) {
  const lines = readLogTail(rootDir, lastN);
  const errors = lines.filter(l => l.includes('[ERROR]'));
  const warnings = lines.filter(l => l.includes('[WARN]'));

  // Count by error type
  const typeCounts = {};
  for (const line of errors) {
    // Try to extract error type from log data
    const typeMatch = line.match(/"errorType":"(\w+)"/);
    const type = typeMatch ? typeMatch[1] : 'unknown';
    typeCounts[type] = (typeCounts[type] || 0) + 1;
  }

  return {
    totalErrors: errors.length,
    totalWarnings: warnings.length,
    errorsByType: typeCounts,
    recentErrors: errors.slice(-5),
    recentWarnings: warnings.slice(-5),
    healthScore: errors.length === 0 ? 1.0 :
                 errors.length <= 2 ? 0.8 :
                 errors.length <= 5 ? 0.5 : 0.2,
  };
}

module.exports = {
  // Error types
  ERROR_TYPES,
  classifyError,

  // Wrappers
  withErrorHandling,
  withRetry,

  // Circuit breaker
  withCircuitBreaker,
  resetCircuitBreaker,
  getCircuitStatus,

  // Reporting
  buildErrorReport,
};
