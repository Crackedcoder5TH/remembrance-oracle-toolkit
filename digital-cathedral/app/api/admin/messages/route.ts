import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  getAllClientMessages,
  getClientMessages,
  createClientMessage,
  markMessageRead,
} from "@/app/lib/database";

export const dynamic = "force-dynamic";

/**
 * Admin Messaging API
 *
 * GET   /api/admin/messages            — recent messages across all clients
 * GET   /api/admin/messages?clientId=N — one client's full thread
 * POST  /api/admin/messages            — send an outbound reply to a client
 * PATCH /api/admin/messages            — mark an inbound message read
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const clientIdParam = req.nextUrl.searchParams.get("clientId");
  if (clientIdParam) {
    const clientId = Number(clientIdParam);
    if (!Number.isInteger(clientId) || clientId <= 0) {
      return NextResponse.json({ success: false, message: "Invalid clientId." }, { status: 400 });
    }
    const thread = await getClientMessages(clientId);
    if (!thread.ok) {
      return NextResponse.json({ success: false, message: "Failed to load thread." }, { status: 500 });
    }
    return NextResponse.json({ success: true, messages: thread.value });
  }

  const limit = Math.min(parseInt(req.nextUrl.searchParams.get("limit") || "200", 10) || 200, 500);
  const offset = parseInt(req.nextUrl.searchParams.get("offset") || "0", 10) || 0;
  const result = await getAllClientMessages(limit, offset);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: "Failed to load messages." }, { status: 500 });
  }
  return NextResponse.json({ success: true, ...result.value });
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const clientId = Number(body.clientId);
    const subject = typeof body.subject === "string" ? body.subject.trim() : "";
    const message = typeof body.message === "string" ? body.message.trim() : "";

    if (!Number.isInteger(clientId) || clientId <= 0) {
      return NextResponse.json({ success: false, message: "A valid clientId is required." }, { status: 400 });
    }
    if (!message) {
      return NextResponse.json({ success: false, message: "Message body is required." }, { status: 400 });
    }

    const result = await createClientMessage({ clientId, direction: "outbound", subject, body: message });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, id: result.value.id });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const messageId = Number(body.messageId);
    const clientId = Number(body.clientId);

    if (!Number.isInteger(messageId) || messageId <= 0 || !Number.isInteger(clientId) || clientId <= 0) {
      return NextResponse.json(
        { success: false, message: "A valid messageId and clientId are required." },
        { status: 400 }
      );
    }

    const result = await markMessageRead(messageId, clientId);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: "Failed to update message." }, { status: 500 });
    }
    return NextResponse.json({ success: true });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
