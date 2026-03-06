import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import {
  getClientById,
  createPurchase,
  updateClientBalance,
  getPurchasesByLead,
  getClientDailyPurchaseCount,
  getClientMonthlyPurchaseCount,
  generatePurchaseId,
} from "@/app/lib/client-database";
import { getLeadById } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";

/**
 * Client Purchase API
 *
 * POST /api/client/purchase — Buy a lead
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

    // Price calculation
    const isExclusive = exclusive === true;
    const price = isExclusive ? client.exclusivePrice : client.pricePerLead;

    // Balance check
    if (client.balance < price) {
      return NextResponse.json(
        { success: false, message: `Insufficient balance. Need $${(price / 100).toFixed(2)}, have $${(client.balance / 100).toFixed(2)}.` },
        { status: 402 }
      );
    }

    // Deduct balance
    const balanceResult = await updateClientBalance(auth.clientId, -price);
    if (!balanceResult.ok) {
      return NextResponse.json({ success: false, message: "Payment failed." }, { status: 500 });
    }

    // Create purchase
    const returnDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
    const purchaseId = generatePurchaseId();

    const purchaseResult = await createPurchase({
      purchaseId,
      leadId,
      clientId: auth.clientId,
      pricePaid: price,
      purchasedAt: new Date().toISOString(),
      status: "delivered",
      exclusive: isExclusive,
      returnReason: "",
      returnDeadline,
    });

    if (!purchaseResult.ok) {
      // Refund on failure
      await updateClientBalance(auth.clientId, price);
      return NextResponse.json({ success: false, message: "Purchase failed." }, { status: 500 });
    }

    // Return full lead data now that it's purchased
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
      pricePaid: price,
      exclusive: isExclusive,
      returnDeadline,
      newBalance: balanceResult.value.newBalance,
    });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
