/**
 * Next.js instrumentation — runs once when the server starts, before any page loads.
 * Sanitizes environment variables that must be single URLs (not comma-separated lists).
 */
export function register() {
  // NEXTAUTH_URL must be a single URL — NextAuth passes it to new URL() internally
  if (process.env.NEXTAUTH_URL?.includes(",")) {
    process.env.NEXTAUTH_URL = process.env.NEXTAUTH_URL.split(",")[0].trim();
  }
}
