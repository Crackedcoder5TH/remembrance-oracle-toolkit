/**
 * Admin Authentication
 *
 * Simple bearer token authentication for admin API routes.
 * Production-ready: token is set via ADMIN_API_KEY environment variable.
 *
 * Environment variables:
 *   ADMIN_API_KEY — required for admin access (any string, min 16 chars recommended)
 */

import { NextRequest, NextResponse } from "next/server";

/**
 * Verify admin authentication from request headers.
 * Expects: Authorization: Bearer <ADMIN_API_KEY>
 *
 * Returns null if authenticated, or a NextResponse with 401/403 if not.
 */
export function verifyAdmin(req: NextRequest): NextResponse | null {
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

  return null; // Authenticated
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
