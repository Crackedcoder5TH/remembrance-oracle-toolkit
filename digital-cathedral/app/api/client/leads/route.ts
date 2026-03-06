import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getFilteredLeads } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";
import { getClientById, getPurchasesByLead } from "@/app/lib/client-database";

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

      // Check if already purchased by this client
      const purchasesResult = await getPurchasesByLead(lead.leadId);
      const purchased = purchasesResult.ok
        ? purchasesResult.value.some((p) => p.clientId === auth.clientId && p.status !== "returned")
        : false;

      // Check if exclusively purchased by someone else
      const exclusivelyTaken = purchasesResult.ok
        ? purchasesResult.value.some((p) => p.exclusive && p.status === "delivered" && p.clientId !== auth.clientId)
        : false;

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
        };
      }

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
        pricePerLead: client.pricePerLead,
        exclusivePrice: client.exclusivePrice,
      };
    })
  );

  return NextResponse.json({
    success: true,
    leads: gatedLeads.filter(Boolean),
    total: result.value.total,
  });
}
