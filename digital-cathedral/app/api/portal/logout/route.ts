import { PORTAL_SESSION_COOKIE } from "@/app/lib/portal-session";
import { CLIENT_SESSION_COOKIE } from "@/app/lib/client-auth";
import { clearSessionsResponse } from "@/app/lib/session-cookie";

// Logout clears BOTH session cookies. Register and login mint both
// (__portal_session + __client_session); clearing only one leaves the buyer
// half-authenticated — e.g. signing out here but keeping __client_session,
// which still authorizes the purchasing /api/client/* surface.
export async function POST() {
  return clearSessionsResponse([
    { name: PORTAL_SESSION_COOKIE, sameSite: "strict" },
    { name: CLIENT_SESSION_COOKIE, sameSite: "lax" },
  ]);
}
