import { PORTAL_SESSION_COOKIE } from "@/app/lib/portal-session";
import { clearSessionResponse } from "@/app/lib/session-cookie";

export async function POST() {
  return clearSessionResponse(PORTAL_SESSION_COOKIE, "strict");
}
