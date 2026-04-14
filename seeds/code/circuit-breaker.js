/**
 * Circuit Breaker — Prevents cascading failures by failing fast
 * when an operation exceeds a failure threshold.
 *
 * States: CLOSED (normal) → OPEN (failing fast) → HALF_OPEN (testing recovery)
 *
 * @param {object} options - { threshold, cooldownMs, onStateChange }
 * @returns {{ exec: (fn) => any, reset: (), status: () => object }}
 */
function createCircuitBreaker(options = {}) {
  const { threshold = 5, cooldownMs = 60000, onStateChange } = options;

  const CLOSED = 'CLOSED';
  const OPEN = 'OPEN';
  const HALF_OPEN = 'HALF_OPEN';

  let state = CLOSED;
  let failures = 0;
  let successes = 0;
  let lastFailureTime = 0;

  function setState(newState) {
    const old = state;
    state = newState;
    if (onStateChange && old !== newState) {
      onStateChange({ from: old, to: newState, failures, successes });
    }
  }

  function exec(fn) {
    if (state === OPEN) {
      if (Date.now() - lastFailureTime >= cooldownMs) {
        setState(HALF_OPEN);
      } else {
        const remaining = Math.ceil((cooldownMs - (Date.now() - lastFailureTime)) / 1000);
        throw new Error(`Circuit OPEN: ${failures} failures, ${remaining}s cooldown remaining`);
      }
    }

    try {
      const result = fn();
      // Handle promise-returning functions
      if (result && typeof result.then === 'function') {
        return result.then(
          (val) => { onSuccess(); return val; },
          (err) => { onFailure(err); throw err; }
        );
      }
      onSuccess();
      return result;
    } catch (err) {
      onFailure(err);
      throw err;
    }
  }

  function onSuccess() {
    failures = 0;
    successes++;
    if (state === HALF_OPEN) setState(CLOSED);
  }

  function onFailure(err) {
    failures++;
    lastFailureTime = Date.now();
    if (failures >= threshold) {
      setState(OPEN);
    }
  }

  function reset() {
    failures = 0;
    successes = 0;
    lastFailureTime = 0;
    setState(CLOSED);
  }

  function status() {
    return { state, failures, successes, lastFailureTime };
  }

  return { exec, reset, status };
}

module.exports = { createCircuitBreaker };
