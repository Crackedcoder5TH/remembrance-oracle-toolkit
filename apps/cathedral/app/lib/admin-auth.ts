/**
 * Admin Authentication
 *
 * Three authentication methods (checked in order):
 *  1. NextAuth session token — Google OAuth users listed in ADMIN_EMAILS
 *  2. Session cookie (__admin_session) — set by /api/admin/login, HMAC-signed
 *  3. Bearer token (Authorization header) — for programmatic/API access
 *
 * Environment variables:
 *   ADMIN_API_KEY   — required for API key / legacy admin access
 *   ADMIN_EMAILS    — comma-separated Google emails granted admin access
 *   NEXTAUTH_SECRET — required for NextAuth JWT verification
 */

import { NextRequest, NextResponse } from "next/server";
import { getToken } from "next-auth/jwt";
import { verifySessionToken, ADMIN_SESSION_COOKIE } from "./admin-session";

/** Comma-separated list of admin emails (case-insensitive). */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Verify admin authentication.
 *
 * Returns null if authenticated, or a NextResponse with 401/403/503 if not.
 */
export async function verifyAdmin(req: NextRequest): Promise<NextResponse | null> {
  // Method 1: NextAuth JWT — check if Google-authenticated user is an admin
  try {
    const token = await getToken({ req, secret: process.env.NEXTAUTH_SECRET });
    if (token?.email && ADMIN_EMAILS.includes((token.email as string).toLowerCase())) {
      return null; // Authenticated via Google OAuth admin email
    }
  } catch {
    // NextAuth not configured or token invalid — fall through
  }

  // Method 2: Session cookie (from /api/admin/login flow)
  const sessionCookie = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (sessionCookie && verifySessionToken(sessionCookie)) {
    return null; // Authenticated via session
  }

  // Method 3: Bearer token (for programmatic access)
  const adminKey = process.env.ADMIN_API_KEY;

  if (!adminKey) {
    console.error("[ADMIN AUTH] ADMIN_API_KEY environment variable is not set.");
    return NextResponse.json(
      { success: false, message: "Admin access is not configured." },
      { status: 503 },
    );
  }

  const authHeader = req.headers.get("authorization");
  if (!authHeader) {
    return NextResponse.json(
      { success: false, message: "Authentication required." },
      { status: 401 },
    );
  }

  const [scheme, bearerToken] = authHeader.split(" ");
  if (scheme !== "Bearer" || !bearerToken) {
    return NextResponse.json(
      { success: false, message: "Invalid authorization format. Use: Bearer <token>" },
      { status: 401 },
    );
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(bearerToken, adminKey)) {
    return NextResponse.json(
      { success: false, message: "Invalid credentials." },
      { status: 403 },
    );
  }

  return null; // Authenticated via bearer token
}

/** Constant-time string comparison */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}
