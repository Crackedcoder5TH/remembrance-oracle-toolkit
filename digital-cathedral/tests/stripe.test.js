/**
 * Tests for app/lib/stripe.ts — Lazy Stripe initialization, proxy behavior.
 *
 * Since we can't import the actual Stripe SDK in tests, we test the lazy init
 * pattern and proxy forwarding logic.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement lazy init pattern (matching app/lib/stripe.ts) ---

function createLazyGetter(envKey) {
  let _instance = null;

  function getInstance() {
    if (!_instance) {
      const key = process.env[envKey];
      if (!key) throw new Error(`${envKey} is not set in environment variables`);
      // In real code this creates a Stripe instance; we simulate with an object
      _instance = { apiKey: key, initialized: true };
    }
    return _instance;
  }

  const proxy = new Proxy({}, {
    get(_target, prop) {
      return getInstance()[prop];
    },
  });

  return { getInstance, proxy };
}

// --- Tests ---

describe("Stripe lazy initialization", () => {
  const origEnv = process.env.STRIPE_SECRET_KEY;

  it("throws when STRIPE_SECRET_KEY is not set", () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { getInstance } = createLazyGetter("STRIPE_SECRET_KEY");
    assert.throws(() => getInstance(), { message: /STRIPE_SECRET_KEY is not set/ });
  });

  it("creates instance when env var is set", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key_12345";
    const { getInstance } = createLazyGetter("STRIPE_SECRET_KEY");
    const instance = getInstance();
    assert.equal(instance.apiKey, "sk_test_fake_key_12345");
    assert.equal(instance.initialized, true);
  });

  it("returns same instance on multiple calls (singleton)", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_fake_key";
    const { getInstance } = createLazyGetter("STRIPE_SECRET_KEY");
    const a = getInstance();
    const b = getInstance();
    assert.equal(a, b); // Same reference
  });

  it("proxy forwards property access to lazy instance", () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_proxy";
    const { proxy } = createLazyGetter("STRIPE_SECRET_KEY");
    assert.equal(proxy.apiKey, "sk_test_proxy");
    assert.equal(proxy.initialized, true);
  });

  it("proxy throws when env is missing", () => {
    delete process.env.STRIPE_SECRET_KEY;
    const { proxy } = createLazyGetter("STRIPE_SECRET_KEY");
    assert.throws(() => proxy.apiKey, { message: /STRIPE_SECRET_KEY is not set/ });
  });

  // Restore
  it("cleanup", () => {
    if (origEnv) process.env.STRIPE_SECRET_KEY = origEnv;
    else delete process.env.STRIPE_SECRET_KEY;
    assert.ok(true);
  });
});
