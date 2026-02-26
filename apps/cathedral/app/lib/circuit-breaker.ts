/**
 * Circuit Breaker — Fault tolerance for external services
 *
 * States:
 *  - CLOSED: Normal operation. Requests pass through.
 *  - OPEN: Too many failures. Requests are rejected immediately.
 *  - HALF_OPEN: After cooldown, allow one test request through.
 *
 * Configuration:
 *  - failureThreshold: Number of failures before opening (default: 5)
 *  - resetTimeout: Time in ms before attempting recovery (default: 60s)
 *  - halfOpenMax: Max concurrent requests in half-open state (default: 1)
 */

type CircuitState = "CLOSED" | "OPEN" | "HALF_OPEN";

interface CircuitBreakerOptions {
  name: string;
  failureThreshold?: number;
  resetTimeout?: number;
}

interface CircuitBreakerInstance {
  state: CircuitState;
  failures: number;
  lastFailureTime: number;
  halfOpenAttempts: number;
}

const breakers = new Map<string, CircuitBreakerInstance>();

function getOrCreate(name: string): CircuitBreakerInstance {
  let instance = breakers.get(name);
  if (!instance) {
    instance = {
      state: "CLOSED",
      failures: 0,
      lastFailureTime: 0,
      halfOpenAttempts: 0,
    };
    breakers.set(name, instance);
  }
  return instance;
}

/**
 * Execute a function through a circuit breaker.
 *
 * @param fn - The async function to execute (e.g., send email, deliver webhook)
 * @param options - Circuit breaker configuration
 * @returns The result of fn, or throws CircuitOpenError if the circuit is open
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  options: CircuitBreakerOptions,
): Promise<T> {
  const { name, failureThreshold = 5, resetTimeout = 60_000 } = options;
  const breaker = getOrCreate(name);

  // Check if circuit should transition from OPEN → HALF_OPEN
  if (breaker.state === "OPEN") {
    const elapsed = Date.now() - breaker.lastFailureTime;
    if (elapsed >= resetTimeout) {
      breaker.state = "HALF_OPEN";
      breaker.halfOpenAttempts = 0;
      console.log(`[CIRCUIT-BREAKER] ${name}: OPEN → HALF_OPEN (cooldown elapsed)`);
    } else {
      const retryIn = Math.ceil((resetTimeout - elapsed) / 1000);
      console.log(`[CIRCUIT-BREAKER] ${name}: OPEN — rejecting request (retry in ${retryIn}s)`);
      throw new CircuitOpenError(name, retryIn);
    }
  }

  // In HALF_OPEN, only allow one test request
  if (breaker.state === "HALF_OPEN" && breaker.halfOpenAttempts >= 1) {
    throw new CircuitOpenError(name, Math.ceil(resetTimeout / 1000));
  }

  if (breaker.state === "HALF_OPEN") {
    breaker.halfOpenAttempts++;
  }

  try {
    const result = await fn();

    // Success — reset the breaker
    if (breaker.state === "HALF_OPEN") {
      console.log(`[CIRCUIT-BREAKER] ${name}: HALF_OPEN → CLOSED (recovery confirmed)`);
    }
    breaker.state = "CLOSED";
    breaker.failures = 0;
    breaker.halfOpenAttempts = 0;

    return result;
  } catch (err) {
    breaker.failures++;
    breaker.lastFailureTime = Date.now();

    if (breaker.state === "HALF_OPEN") {
      // Test request failed — back to OPEN
      breaker.state = "OPEN";
      console.log(`[CIRCUIT-BREAKER] ${name}: HALF_OPEN → OPEN (test request failed)`);
    } else if (breaker.failures >= failureThreshold) {
      breaker.state = "OPEN";
      console.log(`[CIRCUIT-BREAKER] ${name}: CLOSED → OPEN (${breaker.failures} failures)`);
    }

    throw err;
  }
}

/** Error thrown when the circuit is open and not accepting requests */
export class CircuitOpenError extends Error {
  public retryAfterSeconds: number;
  public circuitName: string;

  constructor(name: string, retryAfterSeconds: number) {
    super(`Circuit breaker "${name}" is OPEN. Retry after ${retryAfterSeconds}s.`);
    this.name = "CircuitOpenError";
    this.circuitName = name;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

/** Get the current state of a circuit breaker (for monitoring/debugging) */
export function getCircuitState(name: string): { state: CircuitState; failures: number } | null {
  const breaker = breakers.get(name);
  if (!breaker) return null;
  return { state: breaker.state, failures: breaker.failures };
}
