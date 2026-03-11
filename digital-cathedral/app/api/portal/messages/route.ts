import { NextRequest, NextResponse } from "next/server";
import { verifyPortalSessionToken, PORTAL_SESSION_COOKIE } from "@/app/lib/portal-session";
import { createClientMessage, markMessageRead } from "@/app/lib/database";

/** Send a new message (client → admin). */
export async function POST(req: NextRequest) {
  const cookie = req.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = verifyPortalSessionToken(cookie);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { subject, message } = body;

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  const result = await createClientMessage({
    clientId: session.id,
    direction: "inbound",
    subject: (subject || "").trim(),
    body: message.trim(),
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true, id: result.value.id });
}

/** Mark a message as read. */
export async function PATCH(req: NextRequest) {
  const cookie = req.cookies.get(PORTAL_SESSION_COOKIE)?.value;
  if (!cookie) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const session = verifyPortalSessionToken(cookie);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { messageId } = body;

  if (!messageId) {
    return NextResponse.json({ error: "messageId is required." }, { status: 400 });
  }

  const result = await markMessageRead(messageId, session.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}
