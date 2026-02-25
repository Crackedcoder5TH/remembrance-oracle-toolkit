import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getFilteredLeads } from "@/app/lib/database";
import type { LeadFilters } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";

/**
 * Admin Leads API — Kingdom Dashboard Data
 *
 * Oracle decision: GENERATE (dashboard-plugin 0.900 too distant to EVOLVE)
 *
 * GET /api/admin/leads?state=TX&coverage=term&veteran=veteran&search=john&limit=50&offset=0
 * Returns filtered leads with scores, paginated.
 * Protected by bearer token (ADMIN_API_KEY).
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;

  const filters: LeadFilters = {
    state: params.get("state") || undefined,
    coverageInterest: params.get("coverage") || undefined,
    veteranStatus: params.get("veteran") || undefined,
    search: params.get("search") || undefined,
    startDate: params.get("startDate") || undefined,
    endDate: params.get("endDate") || undefined,
    limit: Math.min(parseInt(params.get("limit") || "50") || 50, 200),
    offset: parseInt(params.get("offset") || "0") || 0,
  };

  const result = getFilteredLeads(filters);

  if (!result.ok) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch leads." },
      { status: 500 },
    );
  }

  // Attach lead scores
  const leadsWithScores = result.value.leads.map((lead) => {
    const score = scoreLead(lead);
    return {
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
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      createdAt: lead.createdAt,
      score: score.total,
      tier: score.tier,
      scoreFactors: score.factors,
    };
  });

  return NextResponse.json({
    success: true,
    leads: leadsWithScores,
    total: result.value.total,
    limit: filters.limit,
    offset: filters.offset,
  });
}
