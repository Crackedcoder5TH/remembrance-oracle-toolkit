import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getAllPurchases, updatePurchaseStatus, updateClientBalance } from "@/app/lib/client-database";

export const dynamic = "force-dynamic";

/**
 * Admin Disputes API
 *
 * GET  /api/admin/disputes — List disputed purchases
 * PUT  /api/admin/disputes — Resolve a dispute (approve return or deny)
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(params.get("limit") || "50") || 50, 200);
  const offset = parseInt(params.get("offset") || "0") || 0;

  const result = await getAllPurchases(limit, offset, "disputed");
  if (!result.ok) {
    return NextResponse.json({ success: false, message: "Failed to fetch disputes." }, { status: 500 });
  }

  return NextResponse.json({ success: true, ...result.value });
}

export async function PUT(req: NextRequest) {
  const authError = await verifyAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { purchaseId, action, clientId, refundAmount } = body;

    if (!purchaseId || !action) {
      return NextResponse.json(
        { success: false, message: "purchaseId and action are required." },
        { status: 400 }
      );
    }

    if (action === "approve") {
      // Approve the return — refund the client
      await updatePurchaseStatus(purchaseId, "returned", "Approved by admin");
      if (clientId && refundAmount) {
        await updateClientBalance(clientId, refundAmount);
      }
      return NextResponse.json({ success: true, message: "Return approved and refund issued." });
    } else if (action === "deny") {
      // Deny the return — mark as delivered again
      await updatePurchaseStatus(purchaseId, "delivered", "Dispute denied by admin");
      return NextResponse.json({ success: true, message: "Dispute denied." });
    }

    return NextResponse.json({ success: false, message: "Invalid action. Use 'approve' or 'deny'." }, { status: 400 });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
