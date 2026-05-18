import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getLeadById } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";
import { stripe } from "@/app/lib/stripe";
import { fulfillCheckoutSession } from "@/app/lib/purchase-fulfillment";

export const dynamic = "force-dynamic";

/**
 * Purchase Success Callback
 *
 * GET /api/client/purchase/success?session_id=cs_xxx
 *
 * Called after Stripe Checkout completes, to show the buyer the lead they
 * just bought. Fulfillment is idempotent (shared with the Stripe webhook),
 * so loading this page never creates a duplicate purchase — and the webhook
 * still fulfils the purchase even if the buyer never lands here.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ success: false, message: "Missing session_id." }, { status: 400 });
  }

  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    // The session must belong to the authenticated client.
    if ((session.metadata?.clientId ?? null) !== auth.clientId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 403 });
    }

    // Fulfil idempotently — the webhook may already have recorded this purchase.
    const fulfillment = await fulfillCheckoutSession(session);
    if (!fulfillment.ok) {
      const status =
        fulfillment.reason === "unpaid" ? 402 :
        fulfillment.reason === "sold_out" ? 409 :
        fulfillment.reason === "invalid" ? 400 : 500;
      return NextResponse.json({ success: false, message: fulfillment.error }, { status });
    }
    const purchase = fulfillment.purchase;

    // Lead data for the response
    const leadResult = await getLeadById(purchase.leadId);
    if (!leadResult.ok || !leadResult.value) {
      return NextResponse.json({ success: false, message: "Lead not found." }, { status: 404 });
    }
    const lead = leadResult.value;
    const score = scoreLead(lead);

    return NextResponse.json({
      success: true,
      purchaseId: purchase.purchaseId,
      lead: {
        leadId: lead.leadId,
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        dateOfBirth: lead.dateOfBirth,
        state: lead.state,
        coverageInterest: lead.coverageInterest,
        veteranStatus: lead.veteranStatus,
        militaryBranch: lead.militaryBranch,
        score: score.total,
        tier: score.tier,
        createdAt: lead.createdAt,
      },
      pricePaid: purchase.pricePaid,
      exclusive: purchase.exclusive,
      returnDeadline: purchase.returnDeadline,
    });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to verify payment." }, { status: 500 });
  }
}
