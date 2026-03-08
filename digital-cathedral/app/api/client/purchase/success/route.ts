import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import {
  createPurchase,
  generatePurchaseId,
} from "@/app/lib/client-database";
import { getLeadById } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";
import { stripe } from "@/app/lib/stripe";

/**
 * Purchase Success Callback
 *
 * GET /api/client/purchase/success?session_id=cs_xxx
 *
 * Called after Stripe Checkout completes. Verifies payment and fulfills the lead purchase.
 */
export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  const sessionId = req.nextUrl.searchParams.get("session_id");
  if (!sessionId) {
    return NextResponse.json({ success: false, message: "Missing session_id." }, { status: 400 });
  }

  try {
    // Retrieve the Stripe Checkout Session
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    if (session.payment_status !== "paid") {
      return NextResponse.json({ success: false, message: "Payment not completed." }, { status: 402 });
    }

    const { clientId, leadId, exclusive, price } = session.metadata || {};

    // Verify the session belongs to the authenticated client
    if (clientId !== auth.clientId) {
      return NextResponse.json({ success: false, message: "Unauthorized." }, { status: 403 });
    }

    if (!leadId || !price) {
      return NextResponse.json({ success: false, message: "Invalid session metadata." }, { status: 400 });
    }

    const isExclusive = exclusive === "true";
    const pricePaid = parseInt(price, 10);

    // Get lead data for the response
    const leadResult = await getLeadById(leadId);
    if (!leadResult.ok || !leadResult.value) {
      return NextResponse.json({ success: false, message: "Lead not found." }, { status: 404 });
    }
    const lead = leadResult.value;
    const score = scoreLead(lead);

    // Create the purchase record
    const returnDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const purchaseId = generatePurchaseId();

    const purchaseResult = await createPurchase({
      purchaseId,
      leadId,
      clientId: auth.clientId,
      pricePaid,
      purchasedAt: new Date().toISOString(),
      status: "delivered",
      exclusive: isExclusive,
      returnReason: "",
      returnDeadline,
    });

    if (!purchaseResult.ok) {
      return NextResponse.json({ success: false, message: "Failed to record purchase." }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      purchaseId,
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
      pricePaid,
      exclusive: isExclusive,
      returnDeadline,
    });
  } catch {
    return NextResponse.json({ success: false, message: "Failed to verify payment." }, { status: 500 });
  }
}
