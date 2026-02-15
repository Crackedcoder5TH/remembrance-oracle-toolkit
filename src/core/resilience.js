/**
 * Resilience utilities — retry with exponential backoff.
 *
 * Evolved from oracle pattern "retry-with-backoff" (0.990 coherency, id: 1cc7fba70f6f699e).
 *
 * Provides:
 *   - retryWithBackoff(fn, options) — retry async fn with exponential backoff + jitter
 *   - resilientRequest(url, options) — wrap HTTP requests with retry logic
 *   - resilientFetch(url, options) — browser-side fetch with retry + visual feedback
 */

// ─── Core Retry ───

/**
 * Retry an async function with exponential backoff and optional jitter.
 *
 * @param {Function} fn - Async function to retry (called with no arguments)
 * @param {object} options - Configuration
 * @param {number} options.maxRetries - Maximum retry attempts (default 3)
 * @param {number} options.baseDelay - Initial delay in ms (default 200)
 * @param {number} options.maxDelay - Maximum delay in ms (default 10000)
 * @param {boolean} options.jitter - Add random jitter to prevent thundering herd (default true)
 * @param {Function} options.shouldRetry - Predicate to decide if error is retryable (default: all errors)
 * @param {Function} options.onRetry - Callback on each retry: (error, attempt, delay) => void
 * @returns {Promise<*>} Result of fn()
 * @throws {Error} Last error after all retries exhausted
 */
async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    baseDelay = 200,
    maxDelay = 10000,
    jitter = true,
    shouldRetry = () => true,
    onRetry = null,
  } = options;

  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries && shouldRetry(err, i)) {
        let delay = Math.min(baseDelay * Math.pow(2, i), maxDelay);
        if (jitter) delay *= 0.5 + Math.random() * 0.5;
        if (typeof onRetry === 'function') {
          onRetry(err, i + 1, Math.round(delay));
        }
        await new Promise(r => setTimeout(r, delay));
      } else if (i < maxRetries && !shouldRetry(err, i)) {
        // Non-retryable error — throw immediately
        throw err;
      }
    }
  }
  throw lastError;
}

// ─── HTTP Retry Helpers ───

/**
 * Determine if an HTTP error is retryable.
 * Retries on: network errors, timeouts, 429 (rate limited), 5xx server errors.
 */
function isRetryableError(err) {
  if (!err) return false;
  // Network-level errors
  if (err.code === 'ECONNRESET' || err.code === 'ECONNREFUSED' ||
      err.code === 'ETIMEDOUT' || err.code === 'EPIPE' ||
      err.code === 'ENOTFOUND' || err.code === 'EAI_AGAIN') {
    return true;
  }
  // Timeout
  if (err.message && err.message.includes('timeout')) return true;
  // HTTP status based
  if (err.statusCode === 429 || (err.statusCode >= 500 && err.statusCode < 600)) return true;
  return false;
}

/**
 * Wrap the cloud client's request function with retry logic.
 *
 * @param {Function} requestFn - The original request(url, options) function
 * @param {object} retryOptions - Override retry defaults
 * @returns {Function} Resilient version of requestFn
 */
function withRetry(requestFn, retryOptions = {}) {
  return function resilientRequest(url, options = {}) {
    return retryWithBackoff(
      () => requestFn(url, options),
      {
        maxRetries: 3,
        baseDelay: 200,
        maxDelay: 10000,
        jitter: true,
        shouldRetry: isRetryableError,
        ...retryOptions,
      }
    );
  };
}

/**
 * Generate a browser-side fetch wrapper with retry logic.
 * Returns a JavaScript string for embedding in HTML templates.
 *
 * @returns {string} JavaScript source code for resilientFetch function
 */
function resilientFetchSource() {
  return `
async function resilientFetch(url, options) {
  options = options || {};
  var maxRetries = options.maxRetries || 2;
  var baseDelay = options.baseDelay || 300;
  var onRetry = options.onRetry || null;
  var lastError;
  for (var i = 0; i <= maxRetries; i++) {
    try {
      var res = await fetch(url, options);
      if (res.status === 429 || res.status >= 500) {
        var retryAfter = res.headers.get('Retry-After');
        var err = new Error('HTTP ' + res.status);
        err.statusCode = res.status;
        err.retryAfter = retryAfter ? parseInt(retryAfter, 10) * 1000 : null;
        throw err;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        var delay = err.retryAfter || Math.min(baseDelay * Math.pow(2, i), 10000);
        delay *= 0.5 + Math.random() * 0.5;
        if (typeof onRetry === 'function') onRetry(err, i + 1, Math.round(delay));
        await new Promise(function(r) { setTimeout(r, delay); });
      }
    }
  }
  throw lastError;
}`;
}

module.exports = {
  retryWithBackoff,
  isRetryableError,
  withRetry,
  resilientFetchSource,
};
