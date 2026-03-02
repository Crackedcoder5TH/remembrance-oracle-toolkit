/**
 * Admin Authentication
 *
 * Two authentication methods (checked in order):
 *  1. Session cookie (__admin_session) — set by /api/admin/login, HMAC-signed
 *  2. Bearer token (Authorization header) — for programmatic/API access
 *
 * Environment variables:
 *   ADMIN_API_KEY — required for admin access (any string, min 16 chars recommended)
 */

import { NextRequest, NextResponse } from "next/server";
import { verifySessionToken, ADMIN_SESSION_COOKIE } from "./admin-session";

/**
 * Verify admin authentication from session cookie or Authorization header.
 *
 * Returns null if authenticated, or a NextResponse with 401/403/503 if not.
 */
export function verifyAdmin(req: NextRequest): NextResponse | null {
  // Method 1: Session cookie (from /admin/login flow)
  const sessionCookie = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (sessionCookie && verifySessionToken(sessionCookie)) {
    return null; // Authenticated via session
  }

  // Method 2: Bearer token (for programmatic access)
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

  const [scheme, token] = authHeader.split(" ");
  if (scheme !== "Bearer" || !token) {
    return NextResponse.json(
      { success: false, message: "Invalid authorization format. Use: Bearer <token>" },
      { status: 401 },
    );
  }

  // Constant-time comparison to prevent timing attacks
  if (!timingSafeEqual(token, adminKey)) {
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
