import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getAllPurchases } from "@/app/lib/client-database";

export const dynamic = "force-dynamic";

/**
 * Admin Purchases API
 *
 * GET /api/admin/purchases — List all lead purchases across clients
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(params.get("limit") || "50") || 50, 200);
  const offset = parseInt(params.get("offset") || "0") || 0;
  const status = params.get("status") || undefined;

  const result = await getAllPurchases(limit, offset, status);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: "Failed to fetch purchases." }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result.value });
}
