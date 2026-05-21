import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getAllPurchases, updatePurchaseStatus } from "@/app/lib/client-database";
import { stripe } from "@/app/lib/stripe";

export const dynamic = "force-dynamic";

/**
 * Admin Disputes API
 *
 * GET  /api/admin/disputes — List disputed purchases
 * PUT  /api/admin/disputes — Resolve a dispute (approve return or deny)
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
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
  const authError = verifyAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { purchaseId, action } = body;

    if (!purchaseId || !action) {
      return NextResponse.json(
        { success: false, message: "purchaseId and action are required." },
        { status: 400 }
      );
    }

    if (action === "approve") {
      // Approve the return and refund the buyer. The purchase id is
      // purchase_<checkout-session-id>, so the original Stripe payment is
      // recoverable — refund it directly. A balance credit would land in a
      // column nothing can spend, since lead purchases go through Checkout.
      const sessionId = typeof purchaseId === "string" && purchaseId.startsWith("purchase_")
        ? purchaseId.slice("purchase_".length)
        : "";

      if (sessionId.startsWith("cs_")) {
        let paymentIntentId: string | null = null;
        try {
          const session = await stripe.checkout.sessions.retrieve(sessionId);
          paymentIntentId = typeof session.payment_intent === "string"
            ? session.payment_intent
            : session.payment_intent?.id ?? null;
        } catch (err) {
          const detail = err instanceof Error ? err.message : "Unknown error";
          return NextResponse.json(
            { success: false, message: `Could not load the original payment: ${detail}` },
            { status: 502 }
          );
        }

        if (!paymentIntentId) {
          return NextResponse.json(
            { success: false, message: "No payment found for this purchase — cannot refund." },
            { status: 422 }
          );
        }

        try {
          // Idempotent: re-approving the same dispute returns the existing
          // refund rather than issuing a second one.
          await stripe.refunds.create(
            { payment_intent: paymentIntentId },
            { idempotencyKey: `refund_dispute_${purchaseId}` }
          );
        } catch (err) {
          const detail = err instanceof Error ? err.message : "Unknown error";
          // Leave the purchase disputed so the admin can retry.
          return NextResponse.json(
            { success: false, message: `Refund failed: ${detail}` },
            { status: 502 }
          );
        }

        const statusResult = await updatePurchaseStatus(purchaseId, "returned", "Approved by admin — payment refunded");
        if (!statusResult.ok) {
          return NextResponse.json(
            { success: false, message: "Payment refunded, but the purchase status could not be updated. Re-approve to retry." },
            { status: 500 }
          );
        }
        return NextResponse.json({ success: true, message: "Return approved and payment refunded via Stripe." });
      }

      // Not a Stripe Checkout purchase (e.g. a distributed lead) — no payment on file.
      await updatePurchaseStatus(purchaseId, "returned", "Approved by admin");
      return NextResponse.json({ success: true, message: "Return approved. No Stripe payment was on file to refund." });
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
