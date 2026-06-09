import { NextRequest, NextResponse } from "next/server";
import { verifyPortalSessionToken, PORTAL_SESSION_COOKIE } from "@/app/lib/portal-session";
import { getClientLeads, getClientMessages, getClientDocuments } from "@/app/lib/database";
import { getClientByEmail } from "@/app/lib/client-database";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  if (!cookie) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const session = verifyPortalSessionToken(cookie);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Fetch client data + the buyer's verification status in parallel.
  // Status drives the pending-verification banner on /portal/dashboard.
  const [leadsResult, messagesResult, documentsResult, clientResult] = await Promise.all([
    getClientLeads(session.email),
    getClientMessages(session.id),
    getClientDocuments(session.id),
    getClientByEmail(session.email),
  ]);

  // If all queries failed, the database is likely down
  if (!leadsResult.ok && !messagesResult.ok && !documentsResult.ok) {
    return NextResponse.json(
      { authenticated: true, error: "Service temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  const clientStatus = clientResult.ok && clientResult.value
    ? clientResult.value.status
    : null;

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.id,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
    },
    /** Buyer's license-verification status. Drives the dashboard gating —
     *  null means there's no client row (admin owner, demo mode, or the
     *  client-database service is down). */
    clientStatus,
    leads: leadsResult.ok ? leadsResult.value : [],
    messages: messagesResult.ok ? messagesResult.value : [],
    documents: documentsResult.ok ? documentsResult.value : [],
    _partial: !leadsResult.ok || !messagesResult.ok || !documentsResult.ok,
  });
}
