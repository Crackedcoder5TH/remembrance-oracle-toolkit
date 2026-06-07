import { CLIENT_SESSION_COOKIE } from "@/app/lib/client-auth";
import { clearSessionResponse } from "@/app/lib/session-cookie";

export async function POST() {
  return clearSessionResponse(CLIENT_SESSION_COOKIE, "lax");
}
