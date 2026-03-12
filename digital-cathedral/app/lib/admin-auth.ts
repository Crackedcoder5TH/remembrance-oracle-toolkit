/**
 * Admin Authentication
 *
 * Three authentication methods (checked in order):
 *  1. Google OAuth session cookie — set after Google sign-in, includes role
 *  2. Legacy session cookie (__admin_session) — set by /api/admin/login, HMAC-signed
 *  3. Bearer token (Authorization header) — for programmatic/API access
 *
 * Environment variables:
 *   ADMIN_API_KEY — comma-separated keys for rotation (first = current, rest = previous)
 *                   Example: "new-key-2026,old-key-2025"
 *                   Both keys work during rotation; remove old key after rollout.
 *   ADMIN_EMAILS — comma-separated Google emails that get admin role automatically
 */

import { NextRequest, NextResponse } from "next/server";
import { timingSafeEqual as cryptoTimingSafeEqual } from "crypto";
import {
  verifySessionToken,
  verifyAndDecodeSessionToken,
  ADMIN_SESSION_COOKIE,
} from "./admin-session";
import { logger } from "./logger";

/** Comma-separated list of admin emails (case-insensitive). */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

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

  // Method 3: Bearer token (for programmatic access)
  // Supports comma-separated keys for rotation: "current-key,previous-key"
  const adminKeysRaw = process.env.ADMIN_API_KEY;

  if (!adminKeysRaw) {
    logger.error("ADMIN_API_KEY environment variable is not set");
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

  // Check against all configured keys (supports rotation)
  const adminKeys = adminKeysRaw.split(",").map((k) => k.trim()).filter(Boolean);
  const matched = adminKeys.some((key) => safeEqual(bearerToken, key));

  if (!matched) {
    return NextResponse.json(
      { success: false, message: "Invalid credentials." },
      { status: 403 },
    );
  }

  return null; // Authenticated via bearer token
}

/** Constant-time string comparison using Node.js crypto. */
function safeEqual(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return cryptoTimingSafeEqual(aBuf, bBuf);
}
