import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { loadLedgerLeads } from "@/app/lib/valor/pattern-library";

export const dynamic = "force-dynamic";

/** RFC-4180 cell escaping — quote when the value contains a comma, quote, or newline. */
function csvCell(v: unknown): string {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

/**
 * Admin Void Pattern Library — CSV export ("pull my leads" → download).
 *
 * GET /api/admin/patterns/export?archetype=valor/protective-veteran
 * Streams the ledger-stamped leads for an archetype as CSV. Omit `archetype`
 * to export every stamped lead.
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const archetype = req.nextUrl.searchParams.get("archetype") || undefined;
  const rows = await loadLedgerLeads();
  const filtered = archetype ? rows.filter((r) => r.archetype === archetype) : rows;

  const header = [
    "Lead ID", "First Name", "Last Name", "Email", "Phone", "State",
    "Coverage", "Veteran Status", "Military Branch",
    "Archetype", "Group", "Coherency", "Tier", "Verdict", "Observed At",
  ];
  const lines = [header.join(",")];
  for (const r of filtered) {
    lines.push([
      r.leadId, r.firstName, r.lastName, r.email, r.phone, r.state,
      r.coverageInterest, r.veteranStatus, r.militaryBranch,
      r.archetype, r.group, r.coherency.toFixed(4), r.tier, r.verdict, r.observedAt,
    ].map(csvCell).join(","));
  }

  const tag = (archetype || "all").replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "");
  return new NextResponse(lines.join("\n"), {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="leads-${tag}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
