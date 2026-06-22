import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { loadLedgerLeads } from "@/app/lib/valor/pattern-library";

export const dynamic = "force-dynamic";

/**
 * Admin Void Pattern Library — leads for an archetype ("pull my leads").
 *
 * GET /api/admin/patterns/leads?archetype=valor/protective-veteran&limit=100&offset=0
 * Returns the ledger-stamped leads whose dominant archetype matches, newest
 * first. Omit `archetype` to list every stamped lead.
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const archetype = params.get("archetype") || undefined;
  const limit = Math.min(parseInt(params.get("limit") || "100") || 100, 500);
  const offset = Math.max(parseInt(params.get("offset") || "0") || 0, 0);

  const rows = await loadLedgerLeads();
  const filtered = archetype ? rows.filter((r) => r.archetype === archetype) : rows;
  const page = filtered.slice(offset, offset + limit);

  return NextResponse.json({
    success: true,
    archetype: archetype ?? null,
    leads: page,
    total: filtered.length,
    limit,
    offset,
  });
}
