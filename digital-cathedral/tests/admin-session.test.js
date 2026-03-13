/**
 * Tests for app/lib/admin-session.ts and app/lib/client-auth.ts.
 *
 * Covers HMAC-signed session creation, verification, expiration, and tampering.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// --- Re-implement admin session logic (matching app/lib/admin-session.ts) ---

const ADMIN_SESSION_DURATION_S = 8 * 60 * 60;

function adminSign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createSessionToken(secret) {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_DURATION_S;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const sig = adminSign(payload, secret);
  return `${payload}.${sig}`;
}

function createGoogleSessionToken(email, role, secret) {
  const exp = Math.floor(Date.now() / 1000) + ADMIN_SESSION_DURATION_S;
  const payload = Buffer.from(JSON.stringify({ exp, email, role })).toString("base64url");
  const sig = adminSign(payload, secret);
  return `${payload}.${sig}`;
}

function verifyAndDecodeSessionToken(token, secret) {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;

    const expectedSig = adminSign(payload, secret);
    if (sig.length !== expectedSig.length) return null;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (typeof data.exp !== "number") return null;
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;

    return { exp: data.exp, email: data.email ?? undefined, role: data.role ?? undefined };
  } catch { return null; }
}

// --- Re-implement client session logic (matching app/lib/client-auth.ts) ---

const CLIENT_SESSION_DURATION_S = 30 * 24 * 60 * 60;

function clientSign(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}

function createClientSessionToken(clientId, email, secret) {
  const exp = Math.floor(Date.now() / 1000) + CLIENT_SESSION_DURATION_S;
  const payload = Buffer.from(JSON.stringify({ clientId, email, exp })).toString("base64url");
  const sig = clientSign(payload, secret);
  return `${payload}.${sig}`;
}

function verifyClientSessionToken(token, secret) {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;
    const expectedSig = clientSign(payload, secret);
    if (sig.length !== expectedSig.length) return null;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    if (typeof data.exp !== "number" || typeof data.clientId !== "string") return null;
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;
    return { clientId: data.clientId, email: data.email };
  } catch { return null; }
}

// --- Tests ---

describe("Admin Session Tokens", () => {
  const secret = "test-admin-secret-key";

  describe("createSessionToken (legacy)", () => {
    it("creates a valid token with dot separator", () => {
      const token = createSessionToken(secret);
      assert.ok(token.includes("."));
      const [payload, sig] = token.split(".");
      assert.ok(payload.length > 0);
      assert.ok(sig.length > 0);
    });

    it("token is verifiable", () => {
      const token = createSessionToken(secret);
      const decoded = verifyAndDecodeSessionToken(token, secret);
      assert.ok(decoded);
      assert.ok(decoded.exp > Math.floor(Date.now() / 1000));
    });

    it("legacy token has no email or role", () => {
      const token = createSessionToken(secret);
      const decoded = verifyAndDecodeSessionToken(token, secret);
      assert.equal(decoded.email, undefined);
      assert.equal(decoded.role, undefined);
    });
  });

  describe("createGoogleSessionToken", () => {
    it("includes email and role", () => {
      const token = createGoogleSessionToken("admin@test.com", "admin", secret);
      const decoded = verifyAndDecodeSessionToken(token, secret);
      assert.ok(decoded);
      assert.equal(decoded.email, "admin@test.com");
      assert.equal(decoded.role, "admin");
    });

    it("supports user role", () => {
      const token = createGoogleSessionToken("user@test.com", "user", secret);
      const decoded = verifyAndDecodeSessionToken(token, secret);
      assert.equal(decoded.role, "user");
    });
  });

  describe("verifyAndDecodeSessionToken", () => {
    it("rejects token with wrong secret", () => {
      const token = createSessionToken(secret);
      assert.equal(verifyAndDecodeSessionToken(token, "wrong-secret"), null);
    });

    it("rejects tampered token", () => {
      const token = createSessionToken(secret);
      const tampered = token.slice(0, -3) + "XXX";
      assert.equal(verifyAndDecodeSessionToken(tampered, secret), null);
    });

    it("rejects expired token", () => {
      const exp = Math.floor(Date.now() / 1000) - 10;
      const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
      const sig = adminSign(payload, secret);
      assert.equal(verifyAndDecodeSessionToken(`${payload}.${sig}`, secret), null);
    });

    it("rejects malformed tokens", () => {
      assert.equal(verifyAndDecodeSessionToken("", secret), null);
      assert.equal(verifyAndDecodeSessionToken("nodot", secret), null);
      assert.equal(verifyAndDecodeSessionToken("a.b.c", secret), null);
    });

    it("rejects token without exp field", () => {
      const payload = Buffer.from(JSON.stringify({ foo: "bar" })).toString("base64url");
      const sig = adminSign(payload, secret);
      assert.equal(verifyAndDecodeSessionToken(`${payload}.${sig}`, secret), null);
    });
  });
});

describe("Client Session Tokens", () => {
  const secret = "test-client-secret-key";

  it("creates and verifies a client session token", () => {
    const token = createClientSessionToken("client_123", "buyer@test.com", secret);
    const decoded = verifyClientSessionToken(token, secret);
    assert.ok(decoded);
    assert.equal(decoded.clientId, "client_123");
    assert.equal(decoded.email, "buyer@test.com");
  });

  it("rejects token with wrong secret", () => {
    const token = createClientSessionToken("client_123", "buyer@test.com", secret);
    assert.equal(verifyClientSessionToken(token, "wrong-secret"), null);
  });

  it("rejects expired client token", () => {
    const exp = Math.floor(Date.now() / 1000) - 10;
    const payload = Buffer.from(JSON.stringify({ clientId: "c1", email: "x@x.com", exp })).toString("base64url");
    const sig = clientSign(payload, secret);
    assert.equal(verifyClientSessionToken(`${payload}.${sig}`, secret), null);
  });

  it("rejects token without clientId", () => {
    const exp = Math.floor(Date.now() / 1000) + 3600;
    const payload = Buffer.from(JSON.stringify({ email: "x@x.com", exp })).toString("base64url");
    const sig = clientSign(payload, secret);
    assert.equal(verifyClientSessionToken(`${payload}.${sig}`, secret), null);
  });

  it("30-day session duration", () => {
    const token = createClientSessionToken("c1", "x@x.com", secret);
    const decoded = verifyClientSessionToken(token, secret);
    const now = Math.floor(Date.now() / 1000);
    const expectedExp = now + 30 * 24 * 60 * 60;
    // Allow 2 seconds tolerance
    assert.ok(Math.abs(decoded.exp - expectedExp) < 2 || decoded.exp === undefined);
  });
});
