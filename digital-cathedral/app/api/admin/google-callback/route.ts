/**
 * Google OAuth Callback — Bridges NextAuth session to legacy admin session cookie.
 *
 * After Google OAuth completes, NextAuth sets its own session. This route:
 *  1. Reads the NextAuth session to get the user's email
 *  2. Checks if the email is in the admin allowlist
 *  3. Sets the legacy HMAC-signed session cookie with the role embedded
 *  4. Redirects to /admin (if admin) or /admin/login?error=AccessDenied (if not)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/app/lib/auth-config";
import { isAdminEmail } from "@/app/lib/admin-auth";
import {
  createGoogleSessionToken,
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE,
} from "@/app/lib/admin-session";

export async function GET(req: NextRequest) {
  const session = await auth();

  // Bug fix: previously hardcoded production URL as fallback, which broke local-dev
  // OAuth (would jump from localhost to prod). Use the request origin instead.
  const baseUrl = req.nextUrl.origin;

  if (!session?.user?.email) {
    return NextResponse.redirect(
      new URL("/admin/login?error=NoSession", baseUrl),
    );
  }

  const email = session.user.email;
  const isAdmin = isAdminEmail(email);
  const role = isAdmin ? "admin" : "user";

  if (!isAdmin) {
    return NextResponse.redirect(
      new URL("/admin/login?error=AccessDenied", baseUrl),
    );
  }

  // Create legacy session cookie with role for backward-compatible middleware
  const token = createGoogleSessionToken(email, role);
  const response = NextResponse.redirect(new URL("/admin", baseUrl));

  response.cookies.set(ADMIN_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE,
  });

  return response;
}
