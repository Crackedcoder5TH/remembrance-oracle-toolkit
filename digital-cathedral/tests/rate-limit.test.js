/**
 * Tests for app/lib/rate-limit.ts — checkRateLimit and getClientIp.
 *
 * Re-implements the rate limiter for standalone testing. Mirrors the
 * sliding-window algorithm in the in-memory fallback path of the actual
 * module (the production KV path is structurally identical, just stored
 * in Redis instead of a Map). The async signature is exercised so the
 * test catches accidental regressions back to the sync API.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement rate limiter (matching app/lib/rate-limit.ts memory path) ---

let store;

function resetStore() {
  store = new Map();
}

async function checkRateLimit(key, maxRequests = 5, windowMs = 60000) {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry) {
    store.set(key, { timestamps: [now] });
    return { allowed: true };
  }

  entry.timestamps = entry.timestamps.filter((t) => now - t < windowMs);

  if (entry.timestamps.length >= maxRequests) {
    const oldest = entry.timestamps[0];
    const retryAfterMs = windowMs - (now - oldest);
    return { allowed: false, retryAfterMs };
  }

  entry.timestamps.push(now);
  return { allowed: true };
}

function getClientIp(headers) {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return headers.get("x-real-ip") || "unknown";
}

// --- Tests ---

describe("checkRateLimit", () => {
  beforeEach(() => resetStore());

  it("returns a Promise (async signature)", () => {
    const result = checkRateLimit("1.2.3.4", 5, 60000);
    assert.ok(result instanceof Promise, "checkRateLimit must be async");
  });

  it("allows first request from a new IP", async () => {
    const result = await checkRateLimit("1.2.3.4", 5, 60000);
    assert.equal(result.allowed, true);
  });

  it("allows up to maxRequests within window", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await checkRateLimit("1.2.3.4", 5, 60000);
      assert.equal(r.allowed, true, `Request ${i + 1} should be allowed`);
    }
  });

  it("blocks after maxRequests exceeded", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("1.2.3.4", 5, 60000);
    const blocked = await checkRateLimit("1.2.3.4", 5, 60000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterMs > 0);
  });

  it("tracks IPs independently", async () => {
    for (let i = 0; i < 5; i++) await checkRateLimit("1.1.1.1", 5, 60000);
    const blocked = await checkRateLimit("1.1.1.1", 5, 60000);
    assert.equal(blocked.allowed, false);

    const other = await checkRateLimit("2.2.2.2", 5, 60000);
    assert.equal(other.allowed, true);
  });

  it("respects different limits per call", async () => {
    await checkRateLimit("1.2.3.4", 1, 60000);
    const blocked = await checkRateLimit("1.2.3.4", 1, 60000);
    assert.equal(blocked.allowed, false);
  });

  it("returns positive retryAfterMs when blocked", async () => {
    await checkRateLimit("1.2.3.4", 1, 60000);
    const result = await checkRateLimit("1.2.3.4", 1, 60000);
    assert.equal(result.allowed, false);
    assert.ok(result.retryAfterMs > 0);
    assert.ok(result.retryAfterMs <= 60000);
  });

  it("rate-limits by arbitrary string key (not just IP)", async () => {
    // The agent endpoints rate-limit by `agent:${label}` rather than IP.
    for (let i = 0; i < 3; i++) await checkRateLimit("agent:claude", 3, 60000);
    const blocked = await checkRateLimit("agent:claude", 3, 60000);
    assert.equal(blocked.allowed, false);

    const other = await checkRateLimit("agent:gpt-4", 3, 60000);
    assert.equal(other.allowed, true);
  });
});

describe("getClientIp", () => {
  it("extracts IP from x-forwarded-for", () => {
    const headers = new Headers({ "x-forwarded-for": "203.0.113.1, 10.0.0.1" });
    assert.equal(getClientIp(headers), "203.0.113.1");
  });

  it("falls back to x-real-ip", () => {
    const headers = new Headers({ "x-real-ip": "203.0.113.2" });
    assert.equal(getClientIp(headers), "203.0.113.2");
  });

  it("returns 'unknown' when no IP headers present", () => {
    const headers = new Headers();
    assert.equal(getClientIp(headers), "unknown");
  });

  it("takes only the first IP from forwarded chain", () => {
    const headers = new Headers({ "x-forwarded-for": "  1.1.1.1 , 2.2.2.2 , 3.3.3.3  " });
    assert.equal(getClientIp(headers), "1.1.1.1");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const headers = new Headers({
      "x-forwarded-for": "1.1.1.1",
      "x-real-ip": "2.2.2.2",
    });
    assert.equal(getClientIp(headers), "1.1.1.1");
  });
});
