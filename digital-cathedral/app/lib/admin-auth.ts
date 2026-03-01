/**
 * Admin Authentication
 *
 * Three authentication methods (checked in order):
 *  1. Google OAuth session cookie — set after Google sign-in, includes role
 *  2. Legacy session cookie (__admin_session) — set by /api/admin/login, HMAC-signed
 *  3. Bearer token (Authorization header) — for programmatic/API access
 *
 * Environment variables:
 *   ADMIN_API_KEY — required for bearer token access (any string, min 16 chars recommended)
 *   ADMIN_EMAILS — comma-separated Google emails that get admin role automatically
 */

import { NextRequest, NextResponse } from "next/server";
import {
  verifySessionToken,
  verifyAndDecodeSessionToken,
  ADMIN_SESSION_COOKIE,
} from "./admin-session";

/**
 * Verify admin authentication from Google session, legacy session, or bearer token.
 *
 * Returns null if authenticated as admin, or a NextResponse with 401/403/503 if not.
 */
export function verifyAdmin(req: NextRequest): NextResponse | null {
  // Method 1: Session cookie with role (Google OAuth or legacy)
  const sessionCookie = req.cookies.get(ADMIN_SESSION_COOKIE)?.value;
  if (sessionCookie) {
    const payload = verifyAndDecodeSessionToken(sessionCookie);
    if (payload) {
      // Google session — has role field
      if (payload.role) {
        if (payload.role === "admin") {
          return null; // Authenticated as admin via Google
        }
        return NextResponse.json(
          { success: false, message: "You don't have admin access." },
          { status: 403 },
        );
      }
      // Legacy session (no role field) — treat as admin (API key login)
      return null;
    }
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
