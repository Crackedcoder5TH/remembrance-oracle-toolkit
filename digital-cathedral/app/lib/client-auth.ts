/**
 * Client Authentication — Cookie-based session for lead buyer portal.
 *
 * Separate from admin auth. Uses HMAC-SHA256 signed cookies.
 * Cookie format: <payload>.<signature>
 * Payload: base64url(JSON.stringify({ clientId, email, exp }))
 *
 * In demo mode (no DATABASE_URL), authentication is bypassed entirely —
 * all requests are auto-authenticated as the demo client.
 */

import { createHmac } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { getClientById } from "./client-database";

const COOKIE_NAME = "__client_session";
const SESSION_DURATION_S = 30 * 24 * 60 * 60; // 30 days

/** True when no real database is configured — auto-auth as demo client. */
function isDemoMode(): boolean {
  return !process.env.DATABASE_URL;
}

function getSecret(): string {
  const key = process.env.CLIENT_SESSION_SECRET || process.env.ADMIN_API_KEY;
  if (!key) throw new Error("CLIENT_SESSION_SECRET or ADMIN_API_KEY is not set");
  return key;
}

function sign(payload: string): string {
  return createHmac("sha256", getSecret())
    .update(payload)
    .digest("base64url");
}

export function createClientSessionToken(clientId: string, email: string): string {
  const exp = Math.floor(Date.now() / 1000) + SESSION_DURATION_S;
  const payload = Buffer.from(JSON.stringify({ clientId, email, exp })).toString("base64url");
  const sig = sign(payload);
  return `${payload}.${sig}`;
}

export function verifyClientSessionToken(token: string): { clientId: string; email: string } | null {
  try {
    const [payload, sig] = token.split(".");
    if (!payload || !sig) return null;

    const expectedSig = sign(payload);
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
  } catch {
    return null;
  }
}

/**
 * Verify client authentication from request.
 * Returns the client ID if authenticated, or a 401 response.
 *
 * In demo mode (no DATABASE_URL), always returns the demo client —
 * no login required.
 */
export async function verifyClient(req: NextRequest): Promise<{ clientId: string } | NextResponse> {
  // Demo mode — bypass auth entirely
  if (isDemoMode()) {
    const { DEMO_CLIENT } = await import("./demo-client");
    return { clientId: DEMO_CLIENT.clientId };
  }

  // Method 1: Session cookie
  const sessionCookie = req.cookies.get(COOKIE_NAME)?.value;
  if (sessionCookie) {
    const session = verifyClientSessionToken(sessionCookie);
    if (session) {
      // Verify client still exists and is active
      const clientResult = await getClientById(session.clientId);
      if (clientResult.ok && clientResult.value && clientResult.value.status === "active") {
        return { clientId: session.clientId };
      }
    }
  }

  // Method 2: Bearer token (for API access)
  const authHeader = req.headers.get("authorization");
  if (authHeader) {
    const [scheme, token] = authHeader.split(" ");
    if (scheme === "Bearer" && token) {
      const session = verifyClientSessionToken(token);
      if (session) {
        const clientResult = await getClientById(session.clientId);
        if (clientResult.ok && clientResult.value && clientResult.value.status === "active") {
          return { clientId: session.clientId };
        }
      }
    }
  }

  return NextResponse.json(
    { success: false, message: "Authentication required." },
    { status: 401 }
  );
}

export const CLIENT_SESSION_COOKIE = COOKIE_NAME;
export const CLIENT_SESSION_MAX_AGE = SESSION_DURATION_S;
