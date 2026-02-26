import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getFilteredLeads } from "@/app/lib/database";
import type { LeadFilters } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";

/**
 * Admin CSV Export API
 *
 * GET /api/admin/export?format=csv&state=TX&coverage=term
 * Exports filtered leads as CSV download.
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
    limit: 10000, // Export up to 10k records
    offset: 0,
  };

  const result = getFilteredLeads(filters);

  if (!result.ok) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch leads." },
      { status: 500 },
    );
  }

  const headers = [
    "Lead ID", "First Name", "Last Name", "Email", "Phone", "DOB",
    "State", "Coverage", "Veteran Status", "Military Branch",
    "Score", "Tier", "UTM Source", "UTM Medium", "UTM Campaign",
    "Created At",
  ];

  const rows = result.value.leads.map((lead) => {
    const score = scoreLead(lead);
    return [
      lead.leadId,
      lead.firstName,
      lead.lastName,
      lead.email,
      lead.phone,
      lead.dateOfBirth,
      lead.state,
      lead.coverageInterest,
      lead.veteranStatus,
      lead.militaryBranch,
      String(score.total),
      score.tier,
      lead.utmSource || "",
      lead.utmMedium || "",
      lead.utmCampaign || "",
      lead.createdAt,
    ];
  });

  const csvContent = [
    headers.join(","),
    ...rows.map((row) =>
      row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(",")
    ),
  ].join("\n");

  return new NextResponse(csvContent, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-export-${new Date().toISOString().slice(0, 10)}.csv"`,
    },
  });
}
