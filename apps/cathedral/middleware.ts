/**
 * Next.js Middleware
 *
 * Security headers applied to every response:
 *  - Content-Security-Policy (CSP) — prevent XSS, injection
 *  - Strict-Transport-Security (HSTS) — enforce HTTPS
 *  - X-Frame-Options — prevent clickjacking
 *  - X-Content-Type-Options — prevent MIME sniffing
 *  - Referrer-Policy — control referrer leakage
 *  - Permissions-Policy — disable unnecessary browser features
 *
 * Admin route protection:
 *  - /admin (except /admin/login) requires a valid session cookie
 *  - Unauthenticated requests are redirected to /admin/login
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

const ADMIN_SESSION_COOKIE = "__admin_session";
const PORTAL_SESSION_COOKIE = "__portal_session";

/** Comma-separated list of admin emails (case-insensitive). */
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS ?? "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

/**
 * Lightweight session check for middleware (Edge runtime).
 * Verifies the payload is unexpired JSON. Full HMAC signature
 * verification happens at the API layer via admin-session.ts.
 */
function isSessionLikelyValid(token: string): boolean {
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

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // ─── Admin route protection ───
  if (
    pathname.startsWith("/admin") &&
    !pathname.startsWith("/admin/login") &&
    !pathname.startsWith("/api/admin/login")
  ) {
    // Method 1: Legacy session cookie
    const sessionCookie = request.cookies.get(ADMIN_SESSION_COOKIE)?.value;
    const hasLegacySession = sessionCookie && isSessionLikelyValid(sessionCookie);

    // Method 2: NextAuth JWT — Google OAuth admin user
    let hasOAuthAdmin = false;
    if (!hasLegacySession) {
      try {
        const token = await getToken({ req: request, secret: process.env.NEXTAUTH_SECRET });
        if (token?.email && ADMIN_EMAILS.includes((token.email as string).toLowerCase())) {
          hasOAuthAdmin = true;
        }
      } catch {
        // NextAuth not configured — fall through
      }
    }

    if (!hasLegacySession && !hasOAuthAdmin) {
      const loginUrl = new URL("/admin/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ─── Portal route protection ───
  if (
    pathname.startsWith("/portal") &&
    !pathname.startsWith("/portal/login") &&
    !pathname.startsWith("/api/portal/login") &&
    !pathname.startsWith("/api/portal/register")
  ) {
    const portalCookie = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
    const hasPortalSession = portalCookie && isSessionLikelyValid(portalCookie);

    if (!hasPortalSession) {
      const loginUrl = new URL("/portal/login", request.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // ─── Security headers ───
  const response = NextResponse.next();
  const headers = response.headers;

  // Content-Security-Policy — synced with next.config.mjs
  // Must match to avoid the middleware overriding config headers
  headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "script-src 'self' 'unsafe-inline' 'unsafe-eval' www.googletagmanager.com connect.facebook.net",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob: https: www.googletagmanager.com www.facebook.com lh3.googleusercontent.com",
      "font-src 'self' https://fonts.gstatic.com",
      "connect-src 'self' www.google-analytics.com analytics.google.com www.facebook.com *.ingest.sentry.io",
      "frame-ancestors 'none'",
      "base-uri 'self'",
      "form-action 'self' https://accounts.google.com",
    ].join("; "),
  );

  // HSTS — enforce HTTPS for 1 year, include subdomains
  headers.set(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );

  // Prevent clickjacking
  headers.set("X-Frame-Options", "DENY");

  // Prevent MIME type sniffing
  headers.set("X-Content-Type-Options", "nosniff");

  // Control referrer information
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");

  // Disable unnecessary browser features
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), interest-cohort=()",
  );

  // Prevent browsers from DNS-prefetching external domains
  headers.set("X-DNS-Prefetch-Control", "off");

  return response;
}

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     *  - _next/static (static files)
     *  - _next/image (image optimization)
     *  - favicon.ico (browser default)
     *  - public files (icons, manifest, etc.)
     */
    "/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
