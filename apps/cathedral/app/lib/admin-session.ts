/**
 * Admin Session — Cookie-based session for admin dashboard access.
 *
 * Uses HMAC-SHA256 signed cookies so the middleware can verify sessions
 * without hitting a database. The signature prevents tampering.
 *
 * Cookie format: <payload>.<signature>
 * Payload: base64url(JSON.stringify({ exp }))
 */

import { createHmac } from "crypto";

const COOKIE_NAME = "__admin_session";
const SESSION_DURATION_S = 8 * 60 * 60; // 8 hours

function getSecret(): string {
  const key = process.env.ADMIN_API_KEY;
  if (!key) throw new Error("ADMIN_API_KEY is not set");
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

/** Create a signed session token with an expiration time. */
export function createSessionToken(): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_S;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

/** Verify a session token. Returns true if valid and not expired. */
export function verifySessionToken(token: string): boolean {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return false;

    const expectedSig = sign(payload);

    // Constant-time comparison
    if (sig.length !== expectedSig.length) return false;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (mismatch !== 0) return false;

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    );
    if (typeof data.exp !== "number") return false;

    return data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export const ADMIN_SESSION_COOKIE = COOKIE_NAME;
export const ADMIN_SESSION_MAX_AGE = SESSION_DURATION_S;
