/**
 * Portal Session — Cookie-based session for client portal access.
 *
 * Uses HMAC-SHA256 signed cookies (same approach as admin-session.ts).
 * Payload includes client ID and email for route-level auth.
 *
 * Cookie format: <payload>.<signature>
 * Payload: base64url(JSON.stringify({ id, email, exp }))
 */

import { createHmac } from "crypto";

const COOKIE_NAME = "__portal_session";
const SESSION_DURATION_S = 7 * 24 * 60 * 60; // 7 days

function getSecret(): string {
  // Use a dedicated secret or fall back to NEXTAUTH_SECRET
  const key = process.env.PORTAL_SESSION_SECRET || process.env.NEXTAUTH_SECRET;
  if (!key) throw new Error("PORTAL_SESSION_SECRET or NEXTAUTH_SECRET must be set");
  if (!process.env.PORTAL_SESSION_SECRET && process.env.NODE_ENV === "production") {
    console.warn("[AUTH] PORTAL_SESSION_SECRET not set — using NEXTAUTH_SECRET. Set a dedicated secret for production.");
  }
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

export interface PortalSessionData {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
}

/** Create a signed session token for a portal client. */
export function createPortalSessionToken(data: PortalSessionData): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_S;
  const payload = Buffer.from(
    JSON.stringify({ id: data.id, email: data.email, firstName: data.firstName, lastName: data.lastName, exp }),
  ).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

/** Verify a portal session token. Returns session data if valid, null otherwise. */
export function verifyPortalSessionToken(token: string): PortalSessionData | null {
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
      id: data.id,
      email: data.email,
      firstName: data.firstName,
      lastName: data.lastName,
    };
  } catch {
    return null;
  }
}

/** Lightweight check for middleware (Edge runtime) — checks expiry only, no HMAC. */
export function isPortalSessionLikelyValid(token: string): boolean {
  try {
    const [payload] = token.split(".");
    if (!payload) return false;
    const json = atob(payload.replace(/-/g, "+").replace(/_/g, "/"));
    const data = JSON.parse(json);
    if (typeof data.exp !== "number") return false;
    return data.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

export const PORTAL_SESSION_COOKIE = COOKIE_NAME;
export const PORTAL_SESSION_MAX_AGE = SESSION_DURATION_S;
