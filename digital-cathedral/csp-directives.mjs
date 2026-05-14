/**
 * Shared Content-Security-Policy directives.
 *
 * Single source of truth consumed by:
 *   - next.config.mjs  (static headers)
 *   - middleware.ts     (runtime headers)
 *
 * Update this file ONCE when adding new external domains.
 */

export const CSP_DIRECTIVES = [
  "default-src 'self'",
  // 'unsafe-inline' kept as fallback for browsers that don't support 'strict-dynamic'.
  // 'unsafe-eval' removed — not needed by Next.js 14 production builds.
  "script-src 'self' 'unsafe-inline' www.googletagmanager.com connect.facebook.net js.stripe.com https://accounts.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https: www.googletagmanager.com www.facebook.com lh3.googleusercontent.com *.stripe.com https://*.googleusercontent.com",
  "font-src 'self' fonts.gstatic.com",
  "connect-src 'self' www.google-analytics.com analytics.google.com www.facebook.com *.ingest.sentry.io api.stripe.com https://accounts.google.com https://oauth2.googleapis.com",
  "frame-src 'self' js.stripe.com hooks.stripe.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
];

/** Pre-joined CSP string ready for header value (without upgrade-insecure-requests). */
export const CSP_HEADER = CSP_DIRECTIVES.join("; ");

/** CSP string with upgrade-insecure-requests appended (for static next.config headers). */
export const CSP_HEADER_WITH_UPGRADE = [...CSP_DIRECTIVES, "upgrade-insecure-requests"].join("; ");
