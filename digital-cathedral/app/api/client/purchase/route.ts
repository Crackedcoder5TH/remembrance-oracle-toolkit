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
import { getLeadPrice, getExclusivePrice } from "@/app/lib/lead-depreciation";
import { stripe } from "@/app/lib/stripe";

/**
 * Client Purchase API
 *
 * POST /api/client/purchase — Create a Stripe Checkout Session for a lead purchase.
 * Returns a checkout URL that the client is redirected to for payment.
 * The purchase is fulfilled in /api/client/purchase/success after payment.
 */
export async function POST(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();
    const { leadId, exclusive } = body;

    if (!leadId) {
      return NextResponse.json({ success: false, message: "leadId is required." }, { status: 400 });
    }

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

    // Check if already purchased by this client
    const existingPurchases = await getPurchasesByLead(leadId);
    if (existingPurchases.ok) {
      const alreadyOwned = existingPurchases.value.some(
        (p) => p.clientId === auth.clientId && p.status !== "returned"
      );
      if (alreadyOwned) {
        return NextResponse.json({ success: false, message: "You already own this lead." }, { status: 409 });
      }

      // Check if exclusively purchased by someone else
      const exclusivelyTaken = existingPurchases.value.some(
        (p) => p.exclusive && p.status === "delivered"
      );
      if (exclusivelyTaken) {
        return NextResponse.json({ success: false, message: "This lead is no longer available." }, { status: 409 });
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

    // Price calculation — use depreciated price based on lead age and tier
    const isExclusive = exclusive === true;
    const { price: depreciatedPrice } = getLeadPrice(lead.createdAt, score.tier);
    const price = isExclusive ? getExclusivePrice(depreciatedPrice) : depreciatedPrice;

    // Create Stripe Checkout Session (pay-per-lead, no stored balance)
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
              name: `${isExclusive ? "Exclusive" : "Shared"} Lead — ${lead.state}`,
              description: `Lead #${leadId.slice(0, 12)}… | ${lead.coverageInterest} | Score: ${score.total}`,
            },
          },
          quantity: 1,
        },
      ],
      metadata: {
        clientId: auth.clientId,
        leadId,
        exclusive: isExclusive ? "true" : "false",
        price: String(price),
      },
      success_url: `${baseUrl}/portal?tab=purchases&payment=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${baseUrl}/portal?tab=leads&payment=cancelled`,
    });

    return NextResponse.json({
      success: true,
      checkoutUrl: session.url,
    });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
