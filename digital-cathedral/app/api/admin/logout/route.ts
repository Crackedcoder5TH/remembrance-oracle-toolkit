import { ADMIN_SESSION_COOKIE } from "@/app/lib/admin-session";
import { clearSessionResponse } from "@/app/lib/session-cookie";

export async function POST() {
  return clearSessionResponse(ADMIN_SESSION_COOKIE, "strict");
}
