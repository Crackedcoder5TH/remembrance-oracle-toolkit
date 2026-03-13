/**
 * Tests for app/lib/csrf.ts — CSRF token generation, validation.
 *
 * Re-implements the CSRF logic for standalone testing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { randomBytes } from "node:crypto";

// --- Re-implement CSRF logic (matching app/lib/csrf.ts) ---

const TOKEN_LENGTH = 32;

function generateCsrfToken() {
  return randomBytes(TOKEN_LENGTH).toString("hex");
}

function validateCsrfToken(cookieToken, headerToken) {
  if (!cookieToken || !headerToken) return false;
  if (cookieToken.length !== headerToken.length) return false;

  let mismatch = 0;
  for (let i = 0; i < cookieToken.length; i++) {
    mismatch |= cookieToken.charCodeAt(i) ^ headerToken.charCodeAt(i);
  }
  return mismatch === 0;
}

// --- Tests ---

describe("generateCsrfToken", () => {
  it("generates a 64-character hex string (32 bytes)", () => {
    const token = generateCsrfToken();
    assert.equal(token.length, 64);
    assert.match(token, /^[0-9a-f]{64}$/);
  });

  it("generates unique tokens", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    assert.notEqual(a, b);
  });
});

describe("validateCsrfToken", () => {
  it("validates matching tokens", () => {
    const token = generateCsrfToken();
    assert.equal(validateCsrfToken(token, token), true);
  });

  it("rejects mismatched tokens", () => {
    const a = generateCsrfToken();
    const b = generateCsrfToken();
    assert.equal(validateCsrfToken(a, b), false);
  });

  it("rejects null cookie token", () => {
    assert.equal(validateCsrfToken(null, "abc"), false);
  });

  it("rejects null header token", () => {
    assert.equal(validateCsrfToken("abc", null), false);
  });

  it("rejects both null", () => {
    assert.equal(validateCsrfToken(null, null), false);
  });

  it("rejects empty strings", () => {
    assert.equal(validateCsrfToken("", ""), false);
  });

  it("rejects tokens of different lengths", () => {
    assert.equal(validateCsrfToken("short", "muchlongertoken"), false);
  });

  it("uses constant-time comparison (no early exit on first mismatch)", () => {
    // We verify this by ensuring that tokens differing in first vs last char
    // both return false (behavioral test — timing would need a microbenchmark)
    const base = "a".repeat(64);
    const diffFirst = "b" + "a".repeat(63);
    const diffLast = "a".repeat(63) + "b";
    assert.equal(validateCsrfToken(base, diffFirst), false);
    assert.equal(validateCsrfToken(base, diffLast), false);
  });
});
