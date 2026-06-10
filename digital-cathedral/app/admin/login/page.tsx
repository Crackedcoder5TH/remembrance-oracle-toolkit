import { Suspense } from "react";
import LoginContent from "./login-content";

/**
 * Admin Login — server-component shell.
 *
 * Reads GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET at request time and passes a
 * single boolean down so the client knows whether to render the Google button.
 * Without this guard, an unconfigured deploy would show the Google button,
 * the click would hit NextAuth with no provider registered, and the user
 * would land on a generic "Sign-in failed" without knowing the root cause.
 *
 * The actual UI (form, countdown, callback-error handling) lives in
 * login-content.tsx so it can use hooks. This file is intentionally tiny.
 */
export default function AdminLoginPage() {
  const googleEnabled = Boolean(
    process.env.GOOGLE_CLIENT_ID?.trim() && process.env.GOOGLE_CLIENT_SECRET?.trim(),
  );

  // Public-site URL — the .com lead-form host. Resolved here so the
  // "View public site" sublink on the login page points at the actual
  // marketing surface, not whatever "/" happens to be on the current
  // host. Without this, the back-link would route through middleware
  // and end up at /admin (the default landing on .xyz) — a loop.
  const primaryDomain = (process.env.PRIMARY_DOMAIN ?? "valorlegacies.com")
    .trim()
    .toLowerCase();
  const publicSiteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? `https://www.${primaryDomain}`)
    .split(",")[0]
    .trim()
    .replace(/\/$/, "");

  return (
    <Suspense
      fallback={
        <main className="min-h-screen flex items-center justify-center px-4">
          <div className="text-[var(--text-muted)]">Loading...</div>
        </main>
      }
    >
      <LoginContent googleEnabled={googleEnabled} publicSiteUrl={publicSiteUrl} />
    </Suspense>
  );
}
