import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getClientDocuments, createClientDocument } from "@/app/lib/database";

export const dynamic = "force-dynamic";

/**
 * Admin Documents API
 *
 * GET  /api/admin/documents?clientId=N — list a client's documents
 * POST /api/admin/documents            — attach a document to a client
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const clientId = Number(req.nextUrl.searchParams.get("clientId"));
  if (!Number.isInteger(clientId) || clientId <= 0) {
    return NextResponse.json({ success: false, message: "A valid clientId is required." }, { status: 400 });
  }

  const result = await getClientDocuments(clientId);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: "Failed to load documents." }, { status: 500 });
  }
  return NextResponse.json({ success: true, documents: result.value });
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const clientId = Number(body.clientId);
    const name = typeof body.name === "string" ? body.name.trim() : "";
    const url = typeof body.url === "string" ? body.url.trim() : "";
    const type = typeof body.type === "string" ? body.type.trim() : "";

    if (!Number.isInteger(clientId) || clientId <= 0) {
      return NextResponse.json({ success: false, message: "A valid clientId is required." }, { status: 400 });
    }
    if (!name || !url) {
      return NextResponse.json({ success: false, message: "Document name and URL are required." }, { status: 400 });
    }
    // The portal renders the URL as a link target — only allow http(s) so a
    // javascript:/data: URL can never be planted as a download link.
    if (!/^https?:\/\//i.test(url)) {
      return NextResponse.json({ success: false, message: "URL must start with http:// or https://." }, { status: 400 });
    }

    const result = await createClientDocument({ clientId, name, url, type });
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, id: result.value.id });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
