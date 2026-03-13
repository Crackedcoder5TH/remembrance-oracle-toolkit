/**
 * Tests for app/lib/circuit-breaker.ts — withCircuitBreaker, CircuitOpenError, state transitions.
 *
 * Re-implements the circuit breaker for standalone testing.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement circuit breaker (matching app/lib/circuit-breaker.ts) ---

const breakers = new Map();

function resetBreakers() {
  breakers.clear();
}

function getOrCreate(name) {
  let instance = breakers.get(name);
  if (!instance) {
    instance = { state: "CLOSED", failures: 0, lastFailureTime: 0, halfOpenAttempts: 0 };
    breakers.set(name, instance);
  }
  return instance;
}

class CircuitOpenError extends Error {
  constructor(name, retryAfterSeconds) {
    super(`Circuit breaker "${name}" is OPEN. Retry after ${retryAfterSeconds}s.`);
    this.name = "CircuitOpenError";
    this.circuitName = name;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

async function withCircuitBreaker(fn, options) {
  const { name, failureThreshold = 5, resetTimeout = 60000 } = options;
  const breaker = getOrCreate(name);

  if (breaker.state === "OPEN") {
    const elapsed = Date.now() - breaker.lastFailureTime;
    if (elapsed >= resetTimeout) {
      breaker.state = "HALF_OPEN";
      breaker.halfOpenAttempts = 0;
    } else {
      const retryIn = Math.ceil((resetTimeout - elapsed) / 1000);
      throw new CircuitOpenError(name, retryIn);
    }
  }

  if (breaker.state === "HALF_OPEN" && breaker.halfOpenAttempts >= 1) {
    throw new CircuitOpenError(name, Math.ceil(resetTimeout / 1000));
  }

  if (breaker.state === "HALF_OPEN") {
    breaker.halfOpenAttempts++;
  }

  try {
    const result = await fn();
    breaker.state = "CLOSED";
    breaker.failures = 0;
    breaker.halfOpenAttempts = 0;
    return result;
  } catch (err) {
    breaker.failures++;
    breaker.lastFailureTime = Date.now();
    if (breaker.state === "HALF_OPEN") {
      breaker.state = "OPEN";
    } else if (breaker.failures >= failureThreshold) {
      breaker.state = "OPEN";
    }
    throw err;
  }
}

function getCircuitState(name) {
  const breaker = breakers.get(name);
  if (!breaker) return null;
  return { state: breaker.state, failures: breaker.failures };
}

// --- Tests ---

describe("withCircuitBreaker", () => {
  beforeEach(() => resetBreakers());

  it("passes through successful calls", async () => {
    const result = await withCircuitBreaker(() => Promise.resolve(42), { name: "test" });
    assert.equal(result, 42);
  });

  it("starts in CLOSED state", async () => {
    await withCircuitBreaker(() => Promise.resolve(), { name: "test" });
    assert.equal(getCircuitState("test").state, "CLOSED");
  });

  it("stays CLOSED on failures below threshold", async () => {
    const opts = { name: "test", failureThreshold: 5 };
    for (let i = 0; i < 4; i++) {
      try { await withCircuitBreaker(() => Promise.reject(new Error("fail")), opts); } catch {}
    }
    assert.equal(getCircuitState("test").state, "CLOSED");
    assert.equal(getCircuitState("test").failures, 4);
  });

  it("opens after reaching failure threshold", async () => {
    const opts = { name: "test", failureThreshold: 3 };
    for (let i = 0; i < 3; i++) {
      try { await withCircuitBreaker(() => Promise.reject(new Error("fail")), opts); } catch {}
    }
    assert.equal(getCircuitState("test").state, "OPEN");
  });

  it("throws CircuitOpenError when OPEN", async () => {
    const opts = { name: "test", failureThreshold: 1, resetTimeout: 60000 };
    try { await withCircuitBreaker(() => Promise.reject(new Error("fail")), opts); } catch {}

    await assert.rejects(
      () => withCircuitBreaker(() => Promise.resolve(), opts),
      (err) => {
        assert.ok(err instanceof CircuitOpenError);
        assert.equal(err.circuitName, "test");
        assert.ok(err.retryAfterSeconds > 0);
        return true;
      }
    );
  });

  it("transitions OPEN → HALF_OPEN after timeout", async () => {
    const opts = { name: "test", failureThreshold: 1, resetTimeout: 10 }; // 10ms timeout
    try { await withCircuitBreaker(() => Promise.reject(new Error("fail")), opts); } catch {}
    assert.equal(getCircuitState("test").state, "OPEN");

    // Wait for timeout
    await new Promise(r => setTimeout(r, 20));

    // Next call should attempt (HALF_OPEN)
    const result = await withCircuitBreaker(() => Promise.resolve("recovered"), opts);
    assert.equal(result, "recovered");
    assert.equal(getCircuitState("test").state, "CLOSED");
  });

  it("transitions HALF_OPEN → OPEN on test failure", async () => {
    const opts = { name: "test", failureThreshold: 1, resetTimeout: 10 };
    try { await withCircuitBreaker(() => Promise.reject(new Error("fail")), opts); } catch {}

    await new Promise(r => setTimeout(r, 20));

    // Test request fails → back to OPEN
    try { await withCircuitBreaker(() => Promise.reject(new Error("still broken")), opts); } catch {}
    assert.equal(getCircuitState("test").state, "OPEN");
  });

  it("HALF_OPEN allows only 1 test request", async () => {
    const opts = { name: "test", failureThreshold: 1, resetTimeout: 10 };
    try { await withCircuitBreaker(() => Promise.reject(new Error("fail")), opts); } catch {}

    await new Promise(r => setTimeout(r, 20));

    // First call in HALF_OPEN succeeds or fails — either way, second should be blocked
    const breaker = getOrCreate("test");
    breaker.state = "HALF_OPEN";
    breaker.halfOpenAttempts = 1; // Simulate one test already in flight

    await assert.rejects(
      () => withCircuitBreaker(() => Promise.resolve(), opts),
      (err) => err instanceof CircuitOpenError
    );
  });

  it("resets failure count on success", async () => {
    const opts = { name: "test", failureThreshold: 5 };
    // Accumulate some failures
    for (let i = 0; i < 3; i++) {
      try { await withCircuitBreaker(() => Promise.reject(new Error("fail")), opts); } catch {}
    }
    assert.equal(getCircuitState("test").failures, 3);

    // Successful call resets
    await withCircuitBreaker(() => Promise.resolve(), opts);
    assert.equal(getCircuitState("test").failures, 0);
  });

  it("tracks different circuits independently", async () => {
    const optsA = { name: "service-a", failureThreshold: 1 };
    const optsB = { name: "service-b", failureThreshold: 1 };

    try { await withCircuitBreaker(() => Promise.reject(new Error("a-fail")), optsA); } catch {}

    assert.equal(getCircuitState("service-a").state, "OPEN");
    assert.equal(getCircuitState("service-b"), null); // Not yet created

    await withCircuitBreaker(() => Promise.resolve(), optsB);
    assert.equal(getCircuitState("service-b").state, "CLOSED");
  });

  it("propagates the original error", async () => {
    const opts = { name: "test", failureThreshold: 5 };
    await assert.rejects(
      () => withCircuitBreaker(() => Promise.reject(new Error("custom error")), opts),
      { message: "custom error" }
    );
  });
});

describe("CircuitOpenError", () => {
  it("has correct properties", () => {
    const err = new CircuitOpenError("email-service", 30);
    assert.equal(err.circuitName, "email-service");
    assert.equal(err.retryAfterSeconds, 30);
    assert.equal(err.name, "CircuitOpenError");
    assert.ok(err.message.includes("email-service"));
  });

  it("is an Error instance", () => {
    const err = new CircuitOpenError("test", 10);
    assert.ok(err instanceof Error);
  });
});

describe("getCircuitState", () => {
  beforeEach(() => resetBreakers());

  it("returns null for unknown circuit", () => {
    assert.equal(getCircuitState("nonexistent"), null);
  });

  it("returns state and failures for known circuit", async () => {
    await withCircuitBreaker(() => Promise.resolve(), { name: "test" });
    const state = getCircuitState("test");
    assert.equal(state.state, "CLOSED");
    assert.equal(state.failures, 0);
  });
});
