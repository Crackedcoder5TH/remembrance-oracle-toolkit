import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getPurchasesByClient, updatePurchaseStatus } from "@/app/lib/client-database";

/**
 * Client Returns API
 *
 * POST /api/client/returns — Request a return on a purchased lead (within 72-hour window)
 */
export async function POST(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { purchaseId, reason } = body;

    if (!purchaseId || !reason) {
      return NextResponse.json(
        { success: false, message: "purchaseId and reason are required." },
        { status: 400 }
      );
    }

    // Verify this purchase belongs to this client
    const purchasesResult = await getPurchasesByClient(auth.clientId, 200);
    if (!purchasesResult.ok) {
      return NextResponse.json({ success: false, message: "Failed to verify purchase." }, { status: 500 });
    }

    const purchase = purchasesResult.value.purchases.find((p) => p.purchaseId === purchaseId);
    if (!purchase) {
      return NextResponse.json({ success: false, message: "Purchase not found." }, { status: 404 });
    }

    if (purchase.status !== "delivered") {
      return NextResponse.json(
        { success: false, message: "This purchase has already been returned or is under dispute." },
        { status: 400 }
      );
    }

    // Check return deadline
    if (purchase.returnDeadline && new Date(purchase.returnDeadline) < new Date()) {
      return NextResponse.json(
        { success: false, message: "The 72-hour return window has expired." },
        { status: 400 }
      );
    }

    // Mark as disputed (admin will review and approve/deny)
    const result = await updatePurchaseStatus(purchaseId, "disputed", reason);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: "Failed to submit return." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: "Return request submitted. Our team will review it within 1 business day.",
    });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
