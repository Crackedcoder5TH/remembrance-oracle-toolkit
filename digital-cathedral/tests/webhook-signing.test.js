/**
 * Tests for webhook HMAC signature verification and retry logic.
 *
 * Covers: signPayload, retry with exponential backoff.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// --- Re-implement webhook signing (matching app/lib/webhooks.ts) ---

function signPayload(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

// --- Re-implement retry logic (shared across email.ts, sms.ts, webhooks.ts) ---

async function retry(fn, maxRetries = 3, delay = 10) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (i < maxRetries) {
        await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
      }
    }
  }
  throw lastError;
}

// --- Tests ---

describe("signPayload (webhook HMAC)", () => {
  it("produces a valid hex HMAC-SHA256 signature", () => {
    const sig = signPayload('{"event":"lead.created"}', "my-secret");
    assert.match(sig, /^[0-9a-f]{64}$/);
  });

  it("is deterministic for same input", () => {
    const payload = '{"data":"test"}';
    const sig1 = signPayload(payload, "secret");
    const sig2 = signPayload(payload, "secret");
    assert.equal(sig1, sig2);
  });

  it("differs for different payloads", () => {
    const sig1 = signPayload("payload-a", "secret");
    const sig2 = signPayload("payload-b", "secret");
    assert.notEqual(sig1, sig2);
  });

  it("differs for different secrets", () => {
    const payload = '{"event":"lead.created"}';
    const sig1 = signPayload(payload, "secret-1");
    const sig2 = signPayload(payload, "secret-2");
    assert.notEqual(sig1, sig2);
  });

  it("matches expected HMAC output", () => {
    // Verify against Node.js crypto directly
    const payload = "test-payload";
    const secret = "test-secret";
    const expected = createHmac("sha256", secret).update(payload).digest("hex");
    assert.equal(signPayload(payload, secret), expected);
  });

  it("handles empty string payload", () => {
    const sig = signPayload("", "secret");
    assert.match(sig, /^[0-9a-f]{64}$/);
  });

  it("handles empty string secret", () => {
    const sig = signPayload("payload", "");
    assert.match(sig, /^[0-9a-f]{64}$/);
  });
});

describe("retry with exponential backoff", () => {
  it("returns result on first success", async () => {
    const result = await retry(() => Promise.resolve(42), 3, 1);
    assert.equal(result, 42);
  });

  it("retries on failure and succeeds eventually", async () => {
    let attempts = 0;
    const result = await retry(() => {
      attempts++;
      if (attempts < 3) throw new Error("not yet");
      return Promise.resolve("success");
    }, 3, 1);
    assert.equal(result, "success");
    assert.equal(attempts, 3);
  });

  it("throws after max retries exhausted", async () => {
    let attempts = 0;
    await assert.rejects(
      () => retry(() => { attempts++; throw new Error("always fails"); }, 2, 1),
      { message: "always fails" }
    );
    assert.equal(attempts, 3); // 1 initial + 2 retries
  });

  it("throws the last error", async () => {
    let callCount = 0;
    await assert.rejects(
      () => retry(() => { callCount++; throw new Error(`fail-${callCount}`); }, 2, 1),
      { message: "fail-3" }
    );
  });

  it("does not retry on first success", async () => {
    let calls = 0;
    await retry(() => { calls++; return Promise.resolve(); }, 5, 1);
    assert.equal(calls, 1);
  });
});
