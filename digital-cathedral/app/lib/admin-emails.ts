/**
 * Admin Emails — Server-side allowlist for auto-admin role assignment.
 *
 * Reads ADMIN_EMAILS from environment (comma-separated).
 * Used during Google OAuth to determine if a user gets admin access.
 *
 * IMPORTANT: This module is server-side only. Never import from client components.
 */

function getAdminEmails(): Set<string> {
  const raw = process.env.ADMIN_EMAILS ?? "";
  const emails = raw
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter((e) => e.length > 0);
  return new Set(emails);
}

/** Check if an email address is in the admin allowlist. */
export function isAdminEmail(email: string): boolean {
  if (!email || typeof email !== "string") return false;
  return getAdminEmails().has(email.trim().toLowerCase());
}

/** Get the role for a given email. */
export function getRoleForEmail(email: string): "admin" | "user" {
  return isAdminEmail(email) ? "admin" : "user";
}
