/**
 * Next.js instrumentation — runs once when the server starts, before any page loads.
 *
 * 1. Sanitizes environment variables
 * 2. Validates critical env vars in production (fail-fast)
 */
export function register() {
  // NEXTAUTH_URL must be a single URL — NextAuth passes it to new URL() internally
  if (process.env.NEXTAUTH_URL?.includes(",")) {
    process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL.split(",")[0].trim();
  }

  // --- Production environment validation ---
  if (process.env.NODE_ENV === "production") {
    const missing: string[] = [];

    if (!process.env.DATABASE_URL) missing.push("DATABASE_URL");
    if (!process.env.NEXTAUTH_SECRET) missing.push("NEXTAUTH_SECRET");
    if (!process.env.ADMIN_API_KEY && !process.env.GOOGLE_CLIENT_ID) {
      missing.push("ADMIN_API_KEY or GOOGLE_CLIENT_ID (need at least one admin auth method)");
    }

    if (missing.length > 0) {
      console.error(
        `[STARTUP] CRITICAL: Missing required environment variables for production:\n` +
        missing.map((v) => `  - ${v}`).join("\n") +
        `\n\nThe application will start but may lose data or fail at runtime.` +
        `\nSee .env.example for documentation.`
      );
    }

    // Warn about optional but important vars
    const warnings: string[] = [];
    if (!process.env.STRIPE_SECRET_KEY) warnings.push("STRIPE_SECRET_KEY (payments disabled)");
    if (!process.env.STRIPE_WEBHOOK_SECRET) warnings.push("STRIPE_WEBHOOK_SECRET (purchase persistence disabled)");
    if (!process.env.EMAIL_FROM || process.env.EMAIL_FROM === "noreply@example.com") {
      warnings.push("EMAIL_FROM (defaulting to noreply@example.com)");
    }

    if (warnings.length > 0) {
      console.warn(
        `[STARTUP] Missing optional environment variables:\n` +
        warnings.map((v) => `  - ${v}`).join("\n")
      );
    }
  }
}
