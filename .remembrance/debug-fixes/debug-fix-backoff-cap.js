/**
 * Meta-Pattern 4 Fix: Unbounded Exponential Backoff
 *
 * Bug: Exponential backoff has no upper cap. At attempt 10, delay becomes
 * strategy.delayMs * 1024, potentially exceeding acceptable timeouts.
 *
 * Root cause: Forgetting Abundance — imposing scarcity thinking by not
 * considering that exponential growth is unbounded.
 *
 * Fix: Cap backoff at 60 seconds. Math.min(maxDelay, base * 2^attempt).
 */

const MAX_BACKOFF_MS = 60000;

function cappedExponentialBackoff(baseDelayMs, attempt, maxDelayMs = MAX_BACKOFF_MS) {
  return Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
}

module.exports = { cappedExponentialBackoff, MAX_BACKOFF_MS };
