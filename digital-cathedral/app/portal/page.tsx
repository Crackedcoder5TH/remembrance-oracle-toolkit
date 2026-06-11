import { redirect } from "next/navigation";

/**
 * /portal — Agent entry point.
 *
 * Server-side redirects to /portal/login. The login page itself bounces
 * already-authenticated agents to /portal/dashboard, so the full chain is:
 *   /portal  →  /portal/login  →  (if session)  /portal/dashboard
 * Collapsing /portal to a pure redirect eliminates the duplicate inline
 * login form that previously lived here, so there's exactly one login
 * surface and one POST target (/api/portal/login) instead of two.
 */
export default function PortalIndexPage(): never {
  redirect("/portal/login");
}
