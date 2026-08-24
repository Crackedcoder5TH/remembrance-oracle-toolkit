import { NextRequest, NextResponse } from "next/server";
import { PORTAL_SESSION_COOKIE, verifyPortalSessionToken } from "@/app/lib/portal-session";
import { getClientByEmail } from "@/app/lib/client-database";
import { getAgentPerformanceSnapshot } from "@/app/lib/performance-analytics";

export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  const token = request.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  const session = token ? verifyPortalSessionToken(token) : null;
  if (!session) return NextResponse.json({ success: false }, { status: 401 });
  const client = await getClientByEmail(session.email);
  if (!client.ok || !client.value) return NextResponse.json({ success: false, message: "Agent profile unavailable." }, { status: 404 });
  return NextResponse.json({ success: true, analytics: await getAgentPerformanceSnapshot(client.value.clientId), creditsAvailable: client.value.balance });
}
