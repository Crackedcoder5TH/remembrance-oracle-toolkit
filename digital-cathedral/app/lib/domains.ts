/**
 * Multi-Domain Configuration
 *
 * Separates the application into two domain groups:
 *  - Leads domains (.com, .net, .info, .store, .shop) — public marketing + lead capture only
 *  - Portal domain (.xyz) — Admin dashboard + Agent portal
 *
 * Environment variables:
 *  - LEADS_DOMAINS: comma-separated hostnames for the leads website
 *  - PORTAL_DOMAIN: hostname for the admin/agent portal
 *  - NEXT_PUBLIC_PORTAL_URL: full URL for cross-domain portal links
 */

/** Parse comma-separated domain list from env, lowercased and trimmed. */
const LEADS_DOMAINS: string[] = (process.env.LEADS_DOMAINS ?? "")
  .split(",")
  .map((d) => d.trim().toLowerCase())
  .filter(Boolean);

/** The single portal domain (admin + client). */
const PORTAL_DOMAIN: string = (process.env.PORTAL_DOMAIN ?? "").trim().toLowerCase();

export type DomainType = "leads" | "portal" | "unknown";

/**
 * Determine domain type from hostname.
 * Strips port for localhost/dev comparisons.
 */
export function getDomainType(hostname: string): DomainType {
  const host = hostname.toLowerCase().split(":")[0]; // strip port

  if (PORTAL_DOMAIN && host === PORTAL_DOMAIN) return "portal";
  if (LEADS_DOMAINS.length > 0 && LEADS_DOMAINS.includes(host)) return "leads";

  // In development (localhost) or when env vars aren't set, allow everything
  return "unknown";
}

/** Routes that should ONLY be served on the portal domain. */
export const PORTAL_ONLY_ROUTES = [
  "/admin",
  "/portal",
  "/api/admin",
  "/api/client",
  "/api/portal",
];

/** Check if a pathname belongs to portal-only routes. */
export function isPortalRoute(pathname: string): boolean {
  return PORTAL_ONLY_ROUTES.some((r) => pathname.startsWith(r));
}

/** Public URL for the portal (for cross-domain links). */
export const PORTAL_URL =
  process.env.NEXT_PUBLIC_PORTAL_URL || (PORTAL_DOMAIN ? `https://${PORTAL_DOMAIN}` : "");

export { LEADS_DOMAINS, PORTAL_DOMAIN };
