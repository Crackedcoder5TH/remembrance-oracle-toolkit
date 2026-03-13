/**
 * Tests for app/lib/rate-limit.ts — checkRateLimit and getClientIp.
 *
 * Re-implements the rate limiter for standalone testing.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement rate limiter (matching app/lib/rate-limit.ts) ---

let store;

function resetStore() {
  store = new Map();
}

function checkRateLimit(ip, maxRequests = 5, windowMs = 60000) {
  const now = Date.now();
  const entry = store.get(ip);

  if (!entry) {
    store.set(ip, { timestamps: [now] });
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

  it("allows first request from a new IP", () => {
    const result = checkRateLimit("1.2.3.4", 5, 60000);
    assert.equal(result.allowed, true);
  });

  it("allows up to maxRequests within window", () => {
    for (let i = 0; i < 5; i++) {
      const r = checkRateLimit("1.2.3.4", 5, 60000);
      assert.equal(r.allowed, true, `Request ${i + 1} should be allowed`);
    }
  });

  it("blocks after maxRequests exceeded", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.2.3.4", 5, 60000);
    const blocked = checkRateLimit("1.2.3.4", 5, 60000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterMs > 0);
  });

  it("tracks IPs independently", () => {
    for (let i = 0; i < 5; i++) checkRateLimit("1.1.1.1", 5, 60000);
    const blocked = checkRateLimit("1.1.1.1", 5, 60000);
    assert.equal(blocked.allowed, false);

    const other = checkRateLimit("2.2.2.2", 5, 60000);
    assert.equal(other.allowed, true);
  });

  it("respects different limits per call", () => {
    checkRateLimit("1.2.3.4", 1, 60000);
    const blocked = checkRateLimit("1.2.3.4", 1, 60000);
    assert.equal(blocked.allowed, false);
  });

  it("returns positive retryAfterMs when blocked", () => {
    checkRateLimit("1.2.3.4", 1, 60000);
    const result = checkRateLimit("1.2.3.4", 1, 60000);
    assert.equal(result.allowed, false);
    assert.ok(result.retryAfterMs > 0);
    assert.ok(result.retryAfterMs <= 60000);
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
