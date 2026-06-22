/**
 * Lead-notification recipients.
 *
 * The admin-managed list of email addresses that get notified when a new lead
 * is submitted. Stored durably via the site-content key/value store (Postgres
 * or the substrate in production — NOT the ephemeral pricing-config JSON file,
 * which doesn't survive Vercel's serverless filesystem).
 *
 * The send path (sendAdminNotificationEmail) uses getLeadNotificationTargets(),
 * which merges this list with the legacy ADMIN_EMAIL env var so existing
 * deployments keep working while the dashboard becomes the primary control.
 */

import { getDbSiteContent, setDbSiteContent } from "./database";

const RECIPIENTS_KEY = "lead_notification_recipients";

/** Pragmatic email check — good enough to reject typos and junk, not RFC-perfect. */
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/** Trim, lowercase, drop invalid/blank, dedupe — order-preserving. */
export function normalizeEmails(input: readonly string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of input) {
    const email = String(raw).trim().toLowerCase();
    if (!email || !isValidEmail(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(email);
  }
  return out;
}

/** The admin-managed recipient list (stored). Empty array when none/unset. */
export async function getNotificationRecipients(): Promise<string[]> {
  const res = await getDbSiteContent(RECIPIENTS_KEY);
  if (!res.ok || !res.value) return [];
  try {
    const parsed = JSON.parse(res.value);
    return Array.isArray(parsed) ? normalizeEmails(parsed) : [];
  } catch {
    return [];
  }
}

/** Replace the stored recipient list (validated + deduped). */
export async function setNotificationRecipients(
  emails: readonly string[],
): Promise<{ ok: boolean; recipients: string[]; error?: string }> {
  const recipients = normalizeEmails(emails);
  const res = await setDbSiteContent(RECIPIENTS_KEY, JSON.stringify(recipients));
  if (!res.ok) return { ok: false, recipients: [], error: res.error };
  return { ok: true, recipients };
}

/** Comma-split, normalize the legacy ADMIN_EMAIL env var (may hold several). */
function envAdminEmails(): string[] {
  return normalizeEmails((process.env.ADMIN_EMAIL || "").split(","));
}

/** Read-only view of the env fallback, for display in the admin UI. */
export function getEnvAdminEmails(): string[] {
  return envAdminEmails();
}

/**
 * The full set of addresses to notify on a new lead: the admin-managed list
 * merged with the legacy ADMIN_EMAIL env var, deduped. This is the authority
 * the send path uses.
 */
export async function getLeadNotificationTargets(): Promise<string[]> {
  const stored = await getNotificationRecipients();
  return normalizeEmails([...stored, ...envAdminEmails()]);
}
