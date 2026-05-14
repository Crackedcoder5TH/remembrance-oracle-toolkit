import { NextRequest, NextResponse } from "next/server";
import { verifyPortalSessionToken, PORTAL_SESSION_COOKIE } from "@/app/lib/portal-session";
import { getClientLeads, getClientMessages, getClientDocuments } from "@/app/lib/database";

export async function GET(req: NextRequest) {
  const cookie = req.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  if (!cookie) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  const session = verifyPortalSessionToken(cookie);
  if (!session) {
    return NextResponse.json({ authenticated: false }, { status: 401 });
  }

  // Fetch client data in parallel
  const [leadsResult, messagesResult, documentsResult] = await Promise.all([
    getClientLeads(session.email),
    getClientMessages(session.id),
    getClientDocuments(session.id),
  ]);

  // If all queries failed, the database is likely down
  if (!leadsResult.ok && !messagesResult.ok && !documentsResult.ok) {
    return NextResponse.json(
      { authenticated: true, error: "Service temporarily unavailable. Please try again." },
      { status: 503 },
    );
  }

  return NextResponse.json({
    authenticated: true,
    user: {
      id: session.id,
      email: session.email,
      firstName: session.firstName,
      lastName: session.lastName,
    },
    leads: leadsResult.ok ? leadsResult.value : [],
    messages: messagesResult.ok ? messagesResult.value : [],
    documents: documentsResult.ok ? documentsResult.value : [],
    _partial: !leadsResult.ok || !messagesResult.ok || !documentsResult.ok,
  });
}
