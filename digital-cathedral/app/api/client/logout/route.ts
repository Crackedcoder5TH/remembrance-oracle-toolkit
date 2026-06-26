import { PORTAL_SESSION_COOKIE } from "@/app/lib/portal-session";
import { CLIENT_SESSION_COOKIE } from "@/app/lib/client-auth";
import { clearSessionsResponse } from "@/app/lib/session-cookie";

// Logout clears BOTH session cookies — register and login mint both, so
// clearing only __client_session here would leave __portal_session alive and
// the buyer half signed-out. Clearing a cookie the browser lacks is a no-op.
export async function POST() {
  return clearSessionsResponse([
    { name: PORTAL_SESSION_COOKIE, sameSite: "strict" },
    { name: CLIENT_SESSION_COOKIE, sameSite: "lax" },
  ]);
}
