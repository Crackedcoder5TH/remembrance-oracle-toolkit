import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getLeadStats } from "@/app/lib/database";

/**
 * Admin Stats API — Kingdom Metrics
 *
 * Oracle decision: GENERATE
 *
 * GET /api/admin/stats
 * Returns aggregate lead statistics for the dashboard.
 * Protected by bearer token (ADMIN_API_KEY).
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const result = getLeadStats();

  if (!result.ok) {
    return NextResponse.json(
      { success: false, message: "Failed to fetch stats." },
      { status: 500 },
    );
  }

  return NextResponse.json({
    success: true,
    stats: result.value,
  });
}
