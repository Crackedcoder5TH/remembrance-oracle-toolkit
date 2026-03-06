import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getClientStats, getRevenueByClient } from "@/app/lib/client-database";

/**
 * Admin Revenue API
 *
 * GET /api/admin/revenue — Revenue stats and per-client breakdown
 */
export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req);
  if (authError) return authError;

  const [statsResult, revenueResult] = await Promise.all([
    getClientStats(),
    getRevenueByClient(),
  ]);

  return NextResponse.json({
    success: true,
    stats: statsResult.ok ? statsResult.value : null,
    byClient: revenueResult.ok ? revenueResult.value : [],
  });
}
