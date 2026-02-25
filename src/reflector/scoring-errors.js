/**
 * Reflector — Error Handling
 *
 * ERROR_TYPES, classifyError, withErrorHandling, withRetry,
 * withCircuitBreaker, buildErrorReport.
 */

const { report: getReport } = require('./report-lazy');
const { TIMEOUTS } = require('./scoring-utils');

const ERROR_TYPES = {
  TRANSIENT: 'transient',
  FATAL: 'fatal',
  CONFIG: 'configuration',
  PERMISSION: 'permission',
  RESOURCE: 'resource',
};

function classifyError(err) {
  if (!err) return ERROR_TYPES.FATAL;
  const msg = (err.message || '').toLowerCase();
  const code = err.code || '';

  if (code === 'EACCES' || code === 'EPERM' || msg.includes('permission denied') || msg.includes('authentication failed')) {
    return ERROR_TYPES.PERMISSION;
  }
  if (code === 'EAGAIN' || code === 'EBUSY' || code === 'ECONNRESET' || code === 'ETIMEDOUT' ||
      msg.includes('timeout') || msg.includes('lock') || msg.includes('busy') ||
      msg.includes('network') || msg.includes('connection refused') || msg.includes('econnreset')) {
    return ERROR_TYPES.TRANSIENT;
  }
  if (code === 'ENOMEM' || code === 'ENOSPC' || msg.includes('out of memory') || msg.includes('disk full') || msg.includes('no space')) {
    return ERROR_TYPES.RESOURCE;
  }
  if (msg.includes('config') || msg.includes('invalid') && msg.includes('option') ||
      msg.includes('not found') && (msg.includes('path') || msg.includes('directory')) ||
      code === 'ENOENT') {
    return ERROR_TYPES.CONFIG;
  }
  return ERROR_TYPES.FATAL;
}

function withErrorHandling(operationName, fn, options = {}) {
  if (typeof fn !== 'function') return { success: false, result: null, error: 'fn is not a function', errorType: ERROR_TYPES.CONFIG, durationMs: 0 };
  const { rootDir = process.cwd(), fallback = null, context = {}, logLevel = 'ERROR' } = options;
  const startTime = Date.now();
  try {
    const result = fn();
    const durationMs = Date.now() - startTime;
    if (options.verbose) {
      const { appendLog } = getReport();
      appendLog(rootDir, 'INFO', `${operationName} completed`, { durationMs, ...context });
    }
    return { success: true, result, error: null, errorType: null, durationMs };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    const errorType = classifyError(err);
    const { appendLog } = getReport();
    appendLog(rootDir, logLevel, `${operationName} failed: ${err.message}`, {
      errorType, stack: err.stack?.split('\n').slice(0, 5).join(' | '), durationMs, ...context,
    });
    const fallbackValue = typeof fallback === 'function' ? fallback(err) : fallback;
    return { success: false, result: fallbackValue, error: err.message, errorType, durationMs, stack: err.stack };
  }
}

function withRetry(operationName, fn, options = {}) {
  const { maxRetries = TIMEOUTS.RETRY_MAX, baseDelayMs = TIMEOUTS.RETRY_BASE_LOCAL, rootDir = process.cwd(), context = {} } = options;
  const startTime = Date.now();
  let lastError = null;

  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      const result = fn();
      return { success: true, result, error: null, attempts: attempt, totalMs: Date.now() - startTime };
    } catch (err) {
      lastError = err;
      const errorType = classifyError(err);
      if (errorType !== ERROR_TYPES.TRANSIENT || attempt > maxRetries) {
        const { appendLog } = getReport();
        appendLog(rootDir, 'ERROR', `${operationName} failed (${errorType}, attempt ${attempt}/${maxRetries + 1})`, {
          error: err.message, errorType, attempt, ...context,
        });
        break;
      }
      const delay = baseDelayMs * Math.pow(2, attempt - 1);
      const { appendLog } = getReport();
      appendLog(rootDir, 'WARN', `${operationName} transient failure, retrying in ${delay}ms (attempt ${attempt})`, {
        error: err.message, delay, ...context,
      });
      try {
        const buf = new SharedArrayBuffer(4);
        Atomics.wait(new Int32Array(buf), 0, 0, delay);
      } catch {
        const waitUntil = Date.now() + delay;
        while (Date.now() < waitUntil) { /* spin fallback */ }
      }
    }
  }

  return {
    success: false, result: null, error: lastError?.message || 'Unknown error',
    errorType: classifyError(lastError), attempts: maxRetries + 1, totalMs: Date.now() - startTime,
  };
}

const circuitState = new Map();

function withCircuitBreaker(operationName, fn, options = {}) {
  const { threshold = 5, cooldownMs = TIMEOUTS.CIRCUIT_COOLDOWN, rootDir = process.cwd() } = options;

  if (!circuitState.has(operationName)) {
    circuitState.set(operationName, { failures: 0, lastFailure: 0, open: false });
  }
  const state = circuitState.get(operationName);

  if (state.open) {
    if (Date.now() - state.lastFailure < cooldownMs) {
      return {
        success: false, result: null,
        error: `Circuit breaker open for "${operationName}". ${state.failures} consecutive failures. Cooldown: ${Math.round((cooldownMs - (Date.now() - state.lastFailure)) / 1000)}s remaining.`,
        circuitOpen: true, failures: state.failures,
      };
    }
    state.open = false;
  }

  try {
    const result = fn();
    state.failures = 0;
    state.open = false;
    return { success: true, result, circuitOpen: false, failures: 0 };
  } catch (err) {
    state.failures++;
    state.lastFailure = Date.now();
    if (state.failures >= threshold) {
      state.open = true;
      const { appendLog } = getReport();
      appendLog(rootDir, 'ERROR', `Circuit breaker opened for "${operationName}" after ${state.failures} failures`, {
        error: err.message, cooldownMs,
      });
    }
    return { success: false, result: null, error: err.message, circuitOpen: state.open, failures: state.failures };
  }
}

function resetCircuitBreaker(operationName) {
  if (operationName) circuitState.delete(operationName);
  else circuitState.clear();
}

function getCircuitStatus(operationName) {
  return circuitState.get(operationName) || { failures: 0, lastFailure: 0, open: false };
}

function buildErrorReport(rootDir, lastN = 50) {
  if (!rootDir) return { totalErrors: 0, totalWarnings: 0, errorsByType: {}, recentErrors: [], recentWarnings: [], healthScore: 1.0 };
  const { readLogTail } = getReport();
  const lines = readLogTail(rootDir, lastN);
  const errors = lines.filter(l => l.includes('[ERROR]'));
  const warnings = lines.filter(l => l.includes('[WARN]'));

  const typeCounts = {};
  for (const line of errors) {
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
    healthScore: errors.length === 0 ? 1.0 : errors.length <= 2 ? 0.8 : errors.length <= 5 ? 0.5 : 0.2,
  };
}

module.exports = {
  ERROR_TYPES,
  classifyError,
  withErrorHandling,
  withRetry,
  withCircuitBreaker,
  resetCircuitBreaker,
  getCircuitStatus,
  buildErrorReport,
};
