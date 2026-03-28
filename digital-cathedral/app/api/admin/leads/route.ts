import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getFilteredLeads } from "@/app/lib/database";
import type { LeadFilters } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";
import { VALID_STATES, VALID_COVERAGE, VALID_VETERAN_STATUS } from "@/app/lib/validation";

export const dynamic = "force-dynamic";

/**
 * Admin Leads API
 *
 * GET /api/admin/leads?state=TX&coverage=term&veteran=veteran&search=john&limit=50&offset=0
 * Returns filtered leads with scores, paginated.
 * Protected by bearer token (ADMIN_API_KEY).
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;

  // Validate enum filter values against allowlists
  const stateParam = params.get("state") || undefined;
  const coverageParam = params.get("coverage") || undefined;
  const veteranParam = params.get("veteran") || undefined;

  if (stateParam && !VALID_STATES.has(stateParam)) {
    return NextResponse.json(
      { success: false, message: "Invalid state filter." },
      { status: 400 },
    );
  }
  if (coverageParam && !VALID_COVERAGE.has(coverageParam)) {
    return NextResponse.json(
      { success: false, message: "Invalid coverage filter." },
      { status: 400 },
    );
  }
  if (veteranParam && !VALID_VETERAN_STATUS.has(veteranParam)) {
    return NextResponse.json(
      { success: false, message: "Invalid veteran status filter." },
      { status: 400 },
    );
  }

  // Cap search string length to prevent abuse
  const searchParam = params.get("search") || undefined;
  const search = searchParam && searchParam.length <= 200 ? searchParam : undefined;

  const filters: LeadFilters = {
    state: stateParam,
    coverageInterest: coverageParam,
    veteranStatus: veteranParam,
    search,
    startDate: params.get("startDate") || undefined,
    endDate: params.get("endDate") || undefined,
    limit: Math.min(parseInt(params.get("limit") || "50") || 50, 200),
    offset: parseInt(params.get("offset") || "0") || 0,
  };

  const result = await getFilteredLeads(filters);

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
      purchaseIntent: lead.purchaseIntent,
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
