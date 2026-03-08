import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getFilteredLeads } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";
import { getClientById, getPurchasesByLead } from "@/app/lib/client-database";
import { getAllTierPrices } from "@/app/lib/lead-depreciation";

/**
 * Client Leads API
 *
 * GET /api/client/leads — Browse available leads (gated — no contact info until purchased)
 */
export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  const clientResult = await getClientById(auth.clientId);
  if (!clientResult.ok || !clientResult.value) {
    return NextResponse.json({ success: false, message: "Client not found." }, { status: 404 });
  }

  const client = clientResult.value;
  const params = req.nextUrl.searchParams;

  const result = await getFilteredLeads({
    state: params.get("state") || undefined,
    coverageInterest: params.get("coverage") || undefined,
    veteranStatus: params.get("veteran") || undefined,
    limit: Math.min(parseInt(params.get("limit") || "25") || 25, 100),
    offset: parseInt(params.get("offset") || "0") || 0,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, message: "Failed to fetch leads." }, { status: 500 });
  }

  // Gate contact info — only show state, coverage, score, tier, date
  // Check which leads this client has already purchased
  const gatedLeads = await Promise.all(
    result.value.leads.map(async (lead) => {
      const score = scoreLead(lead);

      // Check all active purchases for this lead
      const purchasesResult = await getPurchasesByLead(lead.leadId);
      const activePurchases = purchasesResult.ok
        ? purchasesResult.value.filter((p) => p.status === "delivered")
        : [];
      const activeBuyerCount = activePurchases.length;

      const purchased = activePurchases.some((p) => p.clientId === auth.clientId);

      // Check if exclusively purchased by someone else
      const exclusivelyTaken = activePurchases.some(
        (p) => p.exclusive && p.clientId !== auth.clientId
      );

      if (exclusivelyTaken) return null; // Hide exclusively purchased leads

      // If purchased, show full info; otherwise gate it
      if (purchased) {
        return {
          leadId: lead.leadId,
          firstName: lead.firstName,
          lastName: lead.lastName,
          email: lead.email,
          phone: lead.phone,
          state: lead.state,
          coverageInterest: lead.coverageInterest,
          veteranStatus: lead.veteranStatus,
          score: score.total,
          tier: score.tier,
          createdAt: lead.createdAt,
          purchased: true,
          available: false,
          buyerCount: activeBuyerCount,
        };
      }

      // Calculate all tier prices with sold-out status
      const tierPrices = getAllTierPrices(lead.createdAt, activeBuyerCount);
      const ageMs = Date.now() - new Date(lead.createdAt).getTime();
      const ageInDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));

      // Check if completely sold out (all tiers maxed)
      const completelySoldOut = tierPrices.every((t) => t.soldOut);
      if (completelySoldOut) return null;

      return {
        leadId: lead.leadId,
        state: lead.state,
        coverageInterest: lead.coverageInterest,
        veteranStatus: lead.veteranStatus,
        score: score.total,
        tier: score.tier,
        createdAt: lead.createdAt,
        purchased: false,
        available: score.total >= client.minScore,
        buyerCount: activeBuyerCount,
        ageInDays: Math.round(ageInDays * 10) / 10,
        tierPrices: tierPrices.map((tp) => ({
          name: tp.tier.name,
          maxBuyers: tp.tier.maxBuyers,
          price: tp.price,
          soldOut: tp.soldOut,
        })),
      };
    })
  );

  return NextResponse.json({
    success: true,
    leads: gatedLeads.filter(Boolean),
    total: result.value.total,
  });
}
