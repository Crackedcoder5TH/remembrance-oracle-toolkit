import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getPurchasesByClient } from "@/app/lib/client-database";

/**
 * Client Purchase History API
 *
 * GET /api/client/purchases — List client's purchased leads
 */
export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  const params = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(params.get("limit") || "25") || 25, 100);
  const offset = parseInt(params.get("offset") || "0") || 0;

  const result = await getPurchasesByClient(auth.clientId, limit, offset);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: "Failed to fetch purchases." }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result.value });
}
