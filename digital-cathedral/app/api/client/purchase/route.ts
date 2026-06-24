import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import {
  getClientById,
  getPurchasesByLead,
  getClientDailyPurchaseCount,
  getClientMonthlyPurchaseCount,
} from "@/app/lib/client-database";
import { getLeadById } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";
import { getLeadPrice, PURCHASE_TIERS, getTierByIndex } from "@/app/lib/lead-depreciation";
import { stripe } from "@/app/lib/stripe";
import { validateCsrfToken } from "@/app/lib/csrf";
import { logger } from "@/app/lib/logger";

/**
 * Client Purchase API
 *
 * POST /api/client/purchase — Create a Stripe Checkout Session for a lead purchase.
 *
 * Body: { leadId: string, tierIndex: number }
 *   tierIndex: 0 = Exclusive ($120, 1 buyer), 1 = Semi-Exclusive ($100, 2 buyers),
 *              2 = Warm Shared ($80, 3-4 buyers), 3 = Cool Shared ($60, 5-6 buyers)
 */
export async function POST(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  if (!validateCsrfToken(req)) {
    return NextResponse.json(
      { success: false, message: "Security validation failed. Please refresh the page and try again." },
      { status: 403 }
    );
  }

  try {
    const body = await req.json();
    const { leadId, tierIndex } = body;

    if (!leadId) {
      return NextResponse.json({ success: false, message: "leadId is required." }, { status: 400 });
    }

    const selectedTierIndex = typeof tierIndex === "number" ? tierIndex : 3; // default to cool shared
    const selectedTier = getTierByIndex(selectedTierIndex);

    // Get client
    const clientResult = await getClientById(auth.clientId);
    if (!clientResult.ok || !clientResult.value) {
      return NextResponse.json({ success: false, message: "Client not found." }, { status: 404 });
    }
    const client = clientResult.value;

    // Get lead
    const leadResult = await getLeadById(leadId);
    if (!leadResult.ok || !leadResult.value) {
      return NextResponse.json({ success: false, message: "Lead not found." }, { status: 404 });
    }
    const lead = leadResult.value;

    // Score check
    const score = scoreLead(lead);
    if (score.total < client.minScore) {
      return NextResponse.json({ success: false, message: "Lead score below your minimum threshold." }, { status: 400 });
    }

    // Check existing purchases for this lead
    const existingPurchases = await getPurchasesByLead(leadId);
    if (existingPurchases.ok) {
      const activePurchases = existingPurchases.value.filter((p) => p.status === "delivered");

      // Already purchased by this client?
      if (activePurchases.some((p) => p.clientId === auth.clientId)) {
        return NextResponse.json({ success: false, message: "You already own this lead." }, { status: 409 });
      }

      // Exclusively purchased by someone else?
      if (activePurchases.some((p) => p.exclusive)) {
        return NextResponse.json({ success: false, message: "This lead is no longer available." }, { status: 409 });
      }

      // Enforce buyer cap for the selected tier
      if (activePurchases.length >= selectedTier.maxBuyers) {
        return NextResponse.json({
          success: false,
          message: `${selectedTier.name} tier is sold out (${activePurchases.length}/${selectedTier.maxBuyers} buyers).`,
        }, { status: 409 });
      }
    }

    // Cap checks
    const dailyCount = await getClientDailyPurchaseCount(auth.clientId);
    if (dailyCount.ok && dailyCount.value >= client.dailyCap) {
      return NextResponse.json({ success: false, message: "Daily purchase cap reached." }, { status: 429 });
    }

    const monthlyCount = await getClientMonthlyPurchaseCount(auth.clientId);
    if (monthlyCount.ok && monthlyCount.value >= client.monthlyCap) {
      return NextResponse.json({ success: false, message: "Monthly purchase cap reached." }, { status: 429 });
    }

    // Price calculation — tier base price, time-depreciated, then scaled by the
    // lead's coherency grade (score.total is coherency×100, so /100 recovers it).
    const isExclusive = selectedTierIndex === 0;
    const { price } = getLeadPrice(lead.createdAt, selectedTier.name, score.total / 100);

    // Create Stripe Checkout Session
    const origin = req.headers.get("origin") || req.headers.get("host") || "";
    const baseUrl = origin.startsWith("http") ? origin : `https://${origin}`;

    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      payment_method_types: ["card", "us_bank_account", "cashapp"],
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: price,
            product_data: {
              name: `${selectedTier.name} Lead — ${lead.state}`,
              description: `Lead #${leadId.slice(0, 12)}… | ${lead.coverageInterest} | Score: ${score.total} | Max ${selectedTier.maxBuyers} buyer${selectedTier.maxBuyers > 1 ? "s" : ""}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        clientId: auth.clientId,
        leadId,
        exclusive: isExclusive ? "true" : "false",
        tierName: selectedTier.name,
        maxBuyers: String(selectedTier.maxBuyers),
        price: String(price),
      },
      success_url: `${baseUrl}/portal/marketplace?tab=purchases&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/portal/marketplace?tab=leads&payment=cancelled`,
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: session.url,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";

    // Missing key — clearer 503 than a generic 400 so the operator knows it's
    // an env-var problem, not a client mistake.
    if (message.includes("STRIPE_SECRET_KEY is not set")) {
      logger.error("Stripe not configured — purchase request rejected", { detail: message });
      return NextResponse.json(
        {
          success: false,
          message: "Payments are temporarily unavailable. Our team has been notified — please try again shortly.",
        },
        { status: 503 },
      );
    }

    // Stripe accepted the request but returned an API error — surface the
    // Stripe-side message to the operator log and a generic 502 to the buyer
    // (don't leak Stripe internals to the client).
    if (message.includes("StripeInvalidRequestError") || (err as { type?: string })?.type?.startsWith?.("Stripe")) {
      logger.error("Stripe API error during checkout session create", { detail: message });
      return NextResponse.json(
        { success: false, message: "We couldn't open the payment page. Please try again." },
        { status: 502 },
      );
    }

    // Genuinely malformed body / unknown failure — preserve the original 400.
    logger.warn("Purchase request rejected", { detail: message });
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
