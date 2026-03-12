/**
 * Tests for app/lib/agent-auth.ts — hashApiKey, authenticateAgent, consent tokens.
 *
 * Re-implements the agent auth logic for standalone testing.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

// --- Re-implement agent auth logic (matching app/lib/agent-auth.ts) ---

function hashApiKey(plaintext) {
  return createHash("sha256").update(plaintext).digest("hex");
}

function parseAgentKeys(raw) {
  const keys = new Map();
  for (const entry of raw.split(",")) {
    const trimmed = entry.trim();
    if (!trimmed) continue;
    const colonIdx = trimmed.indexOf(":");
    if (colonIdx > 0) {
      const keyPart = trimmed.slice(0, colonIdx);
      const label = trimmed.slice(colonIdx + 1);
      const isPreHashed = /^[0-9a-f]{64}$/.test(keyPart);
      keys.set(isPreHashed ? keyPart : hashApiKey(keyPart), label);
    } else {
      keys.set(hashApiKey(trimmed), "unknown-agent");
    }
  }
  return keys;
}

function authenticateAgent(bearerToken, agentKeysRaw) {
  if (!bearerToken) return null;
  const match = bearerToken.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;

  const key = match[1].trim();
  const incomingHash = hashApiKey(key);
  const incomingBuf = Buffer.from(incomingHash, "hex");

  const keys = parseAgentKeys(agentKeysRaw);
  for (const [storedHash, label] of keys) {
    const storedBuf = Buffer.from(storedHash, "hex");
    if (storedBuf.length === incomingBuf.length && timingSafeEqual(storedBuf, incomingBuf)) {
      return { key: storedHash, label };
    }
  }
  return null;
}

// --- Consent token logic ---

const CONSENT_DURATION_S = 24 * 60 * 60;

function signConsent(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createConsentToken(email, scope, agentLabel, secret) {
  const consentId = `consent_${Date.now().toString(36)}_${randomBytes(6).toString("hex")}`;
  const exp = Math.floor(Date.now() / 1000) + CONSENT_DURATION_S;
  const payload = { email, scope, agentLabel, exp, confirmed: false, consentId };
  const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = signConsent(encoded, secret);
  return { token: `${encoded}.${sig}`, consentId, expiresAt: new Date(exp * 1000).toISOString() };
}

function verifyConsentToken(token, secret) {
  try {
    const [encoded, sig] = token.split(".");
    if (!encoded || !sig) return null;
    const expectedSig = signConsent(encoded, secret);
    if (sig.length !== expectedSig.length) return null;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;
    const data = JSON.parse(Buffer.from(encoded, "base64url").toString("utf-8"));
    if (typeof data.exp !== "number") return null;
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;
    return data;
  } catch { return null; }
}

function confirmConsentToken(token, secret) {
  const decoded = verifyConsentToken(token, secret);
  if (!decoded) return null;
  const confirmed = { ...decoded, confirmed: true };
  const encoded = Buffer.from(JSON.stringify(confirmed)).toString("base64url");
  const sig = signConsent(encoded, secret);
  return { token: `${encoded}.${sig}`, payload: confirmed };
}

// --- Tests ---

describe("hashApiKey", () => {
  it("returns a 64-char hex SHA-256 digest", () => {
    const hash = hashApiKey("my-secret-key");
    assert.equal(hash.length, 64);
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  it("is deterministic", () => {
    assert.equal(hashApiKey("test"), hashApiKey("test"));
  });

  it("differs for different inputs", () => {
    assert.notEqual(hashApiKey("key-a"), hashApiKey("key-b"));
  });
});

describe("parseAgentKeys", () => {
  it("parses plaintext key:label entries", () => {
    const keys = parseAgentKeys("my-key:my-agent");
    const hash = hashApiKey("my-key");
    assert.equal(keys.get(hash), "my-agent");
  });

  it("parses pre-hashed key:label entries", () => {
    const preHash = hashApiKey("original-key");
    const keys = parseAgentKeys(`${preHash}:hashed-agent`);
    assert.equal(keys.get(preHash), "hashed-agent");
  });

  it("handles multiple comma-separated entries", () => {
    const keys = parseAgentKeys("key1:agent1,key2:agent2");
    assert.equal(keys.size, 2);
    assert.equal(keys.get(hashApiKey("key1")), "agent1");
    assert.equal(keys.get(hashApiKey("key2")), "agent2");
  });

  it("handles keys without labels", () => {
    const keys = parseAgentKeys("solo-key");
    assert.equal(keys.get(hashApiKey("solo-key")), "unknown-agent");
  });

  it("ignores empty entries", () => {
    const keys = parseAgentKeys(",,,key:label,,,");
    assert.equal(keys.size, 1);
  });

  it("handles empty string", () => {
    const keys = parseAgentKeys("");
    assert.equal(keys.size, 0);
  });
});

describe("authenticateAgent", () => {
  const keysRaw = "test-api-key:test-agent,second-key:second-agent";

  it("authenticates valid Bearer token", () => {
    const result = authenticateAgent("Bearer test-api-key", keysRaw);
    assert.ok(result);
    assert.equal(result.label, "test-agent");
  });

  it("rejects invalid key", () => {
    const result = authenticateAgent("Bearer wrong-key", keysRaw);
    assert.equal(result, null);
  });

  it("rejects missing auth header", () => {
    assert.equal(authenticateAgent(null, keysRaw), null);
    assert.equal(authenticateAgent("", keysRaw), null);
  });

  it("rejects non-Bearer auth", () => {
    assert.equal(authenticateAgent("Basic dGVzdDp0ZXN0", keysRaw), null);
  });

  it("is case-insensitive on 'Bearer' prefix", () => {
    const result = authenticateAgent("bearer test-api-key", keysRaw);
    assert.ok(result);
    assert.equal(result.label, "test-agent");
  });

  it("authenticates second key in list", () => {
    const result = authenticateAgent("Bearer second-key", keysRaw);
    assert.ok(result);
    assert.equal(result.label, "second-agent");
  });

  it("works with pre-hashed keys in env", () => {
    const hash = hashApiKey("real-key");
    const result = authenticateAgent("Bearer real-key", `${hash}:hashed-agent`);
    assert.ok(result);
    assert.equal(result.label, "hashed-agent");
  });
});

describe("Consent Token System", () => {
  const secret = "test-consent-secret-key-12345";

  describe("createConsentToken", () => {
    it("creates a valid token with consentId", () => {
      const { token, consentId, expiresAt } = createConsentToken("user@test.com", "lead-submission", "gpt-4", secret);
      assert.ok(token.includes("."));
      assert.ok(consentId.startsWith("consent_"));
      assert.ok(expiresAt);
    });

    it("creates unique tokens each time", () => {
      const a = createConsentToken("user@test.com", "lead-submission", "gpt-4", secret);
      const b = createConsentToken("user@test.com", "lead-submission", "gpt-4", secret);
      assert.notEqual(a.token, b.token);
      assert.notEqual(a.consentId, b.consentId);
    });
  });

  describe("verifyConsentToken", () => {
    it("verifies a valid token", () => {
      const { token } = createConsentToken("user@test.com", "both", "claude", secret);
      const decoded = verifyConsentToken(token, secret);
      assert.ok(decoded);
      assert.equal(decoded.email, "user@test.com");
      assert.equal(decoded.scope, "both");
      assert.equal(decoded.agentLabel, "claude");
      assert.equal(decoded.confirmed, false);
    });

    it("rejects token with wrong secret", () => {
      const { token } = createConsentToken("user@test.com", "both", "claude", secret);
      assert.equal(verifyConsentToken(token, "wrong-secret"), null);
    });

    it("rejects tampered token", () => {
      const { token } = createConsentToken("user@test.com", "both", "claude", secret);
      const tampered = token.slice(0, -5) + "XXXXX";
      assert.equal(verifyConsentToken(tampered, secret), null);
    });

    it("rejects expired token", () => {
      // Create a token that's already expired by manipulating the payload
      const exp = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      const payload = { email: "user@test.com", scope: "both", agentLabel: "claude", exp, confirmed: false, consentId: "test" };
      const encoded = Buffer.from(JSON.stringify(payload)).toString("base64url");
      const sig = signConsent(encoded, secret);
      assert.equal(verifyConsentToken(`${encoded}.${sig}`, secret), null);
    });

    it("rejects malformed tokens", () => {
      assert.equal(verifyConsentToken("", secret), null);
      assert.equal(verifyConsentToken("no-dot-here", secret), null);
      assert.equal(verifyConsentToken("a.b.c", secret), null); // extra dot — first split has 'a'
    });
  });

  describe("confirmConsentToken", () => {
    it("creates a confirmed version of a pending token", () => {
      const { token } = createConsentToken("user@test.com", "lead-submission", "gpt-4", secret);
      const confirmed = confirmConsentToken(token, secret);
      assert.ok(confirmed);
      assert.equal(confirmed.payload.confirmed, true);
      assert.equal(confirmed.payload.email, "user@test.com");
    });

    it("confirmed token is verifiable", () => {
      const { token } = createConsentToken("user@test.com", "account-registration", "claude", secret);
      const confirmed = confirmConsentToken(token, secret);
      const decoded = verifyConsentToken(confirmed.token, secret);
      assert.ok(decoded);
      assert.equal(decoded.confirmed, true);
      assert.equal(decoded.scope, "account-registration");
    });

    it("rejects invalid token for confirmation", () => {
      assert.equal(confirmConsentToken("garbage.token", secret), null);
    });
  });
});
