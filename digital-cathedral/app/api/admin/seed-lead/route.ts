import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { insertLead } from "@/app/lib/database";
import { DEMO_LEADS } from "@/app/lib/demo-leads";
import { scoreLead } from "@/app/lib/lead-scoring";

/**
 * Seed Test Leads API
 *
 * POST /api/admin/seed-lead — Seeds demo leads spanning all score tiers.
 * Protected by admin auth.
 *
 * Works in all modes:
 * - With DATABASE_URL: inserts into PostgreSQL
 * - Without DATABASE_URL on Vercel: NoopAdapter accepts the insert, demo leads
 *   are served from the demo-leads module by all read APIs
 * - Local dev: inserts into SQLite
 */
export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req);
  if (authError) return authError;

  const results: Array<{ name: string; status: string; leadId: string; tier: string; score: number }> = [];

  for (const lead of DEMO_LEADS) {
    const result = await insertLead(lead);
    const score = scoreLead(lead);

    results.push({
      name: `${lead.firstName} ${lead.lastName}`,
      status: result.ok ? "created" : (result.error.includes("Duplicate") ? "already exists" : `error: ${result.error}`),
      leadId: lead.leadId,
      tier: score.tier,
      score: score.total,
    });
  }

  const created = results.filter((r) => r.status === "created").length;
  const isDemoMode = !process.env.DATABASE_URL;

  return NextResponse.json({
    success: true,
    message: isDemoMode
      ? `Demo mode active — ${DEMO_LEADS.length} test leads are now visible across all portals. Connect a database (DATABASE_URL) for persistent storage.`
      : `Seeded ${created} test leads into the database.`,
    leads: results,
    demoMode: isDemoMode,
  });
}
