/**
 * Admin Session — Cookie-based session for admin dashboard access.
 *
 * Uses HMAC-SHA256 signed cookies so the middleware can verify sessions
 * without hitting a database. The signature prevents tampering.
 *
 * Cookie format: <payload>.<signature>
 * Payload: base64url(JSON.stringify({ exp, email?, role? }))
 *
 * Supports two token types:
 *  1. Legacy: { exp } — from API key login (backward compatible)
 *  2. Google: { exp, email, role } — from Google OAuth sign-in
 */

import { createHmac } from "crypto";

const COOKIE_NAME = "__admin_session";
const SESSION_DURATION_S = 8 * 60 * 60; // 8 hours

export interface SessionPayload {
  exp: number;
  email?: string;
  role?: "admin" | "user";
}

function getSecret(): string {
  const key = process.env.ADMIN_API_KEY ?? process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("ADMIN_API_KEY or NEXTAUTH_SECRET must be set");
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

/** Create a signed session token with an expiration time (legacy API key login). */
export function createSessionToken(): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_S;
  const payload = Buffer.from(JSON.stringify({ exp })).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

/** Create a signed session token with email and role (Google OAuth login). */
export function createGoogleSessionToken(
  email: string,
  role: "admin" | "user",
): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_S;
  const payload = Buffer.from(
    JSON.stringify({ exp, email, role }),
  ).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

/** Verify a session token. Returns true if valid and not expired. */
export function verifySessionToken(token: string): boolean {
  const result = verifyAndDecodeSessionToken(token);
  return result !== null;
}

/** Verify and decode a session token. Returns the payload if valid, null otherwise. */
export function verifyAndDecodeSessionToken(
  token: string,
): SessionPayload | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;

    const expectedSig = sign(payload);

    // Constant-time comparison
    if (sig.length !== expectedSig.length) return null;
    let mismatch = 0;
    for (let i = 0; i < sig.length; i++) {
      mismatch |= sig.charCodeAt(i) ^ expectedSig.charCodeAt(i);
    }
    if (mismatch !== 0) return null;

    const data = JSON.parse(
      Buffer.from(payload, "base64url").toString("utf-8"),
    );
    if (typeof data.exp !== "number") return null;
    if (data.exp <= Math.floor(Date.now() / 1000)) return null;

    return {
      exp: data.exp,
      email: data.email ?? undefined,
      role: data.role ?? undefined,
    };
  } catch {
    return null;
  }
}

export const ADMIN_SESSION_COOKIE = COOKIE_NAME;
export const ADMIN_SESSION_MAX_AGE = SESSION_DURATION_S;
