import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { LEAD_DIMENSIONS } from "@/app/lib/valor/lead-substrates";
import { COHERENCY_THRESHOLDS } from "@/app/lib/valor/coherency-primitives";
import {
  listArchetypes,
  loadLedgerLeads,
  tallyByArchetype,
} from "@/app/lib/valor/pattern-library";
import { isReachable, learnedShapesByDomain } from "@/app/lib/valor/remembrance-bridge";

export const dynamic = "force-dynamic";

/**
 * Admin Void Pattern Library — overview.
 *
 * GET /api/admin/patterns
 * Returns the archetype library (name, group, 16-d signature) with a live
 * per-archetype lead count from the ledger, plus tier/group distributions and
 * — best-effort — the Remembrance field's learned shapes per domain. The
 * library still renders when the oracle is down (graceful degradation, same as
 * the Substrate Console).
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const rows = await loadLedgerLeads();
  const counts = tallyByArchetype(rows);

  const tierDistribution: Record<string, number> = {};
  const groupTotals: Record<string, number> = { valor: 0, fraud: 0, bot: 0, unknown: 0 };
  for (const r of rows) {
    tierDistribution[r.tier] = (tierDistribution[r.tier] ?? 0) + 1;
    groupTotals[r.group] = (groupTotals[r.group] ?? 0) + 1;
  }

  // Live field learned-shapes — best-effort. A downed oracle must not break
  // the library, so any failure degrades to reachable:false.
  let fieldReachable = false;
  let learnedShapes: Awaited<ReturnType<typeof learnedShapesByDomain>> = null;
  try {
    fieldReachable = await isReachable();
    if (fieldReachable) learnedShapes = await learnedShapesByDomain();
  } catch {
    fieldReachable = false;
    learnedShapes = null;
  }

  return NextResponse.json({
    success: true,
    dimensions: LEAD_DIMENSIONS,
    thresholds: COHERENCY_THRESHOLDS,
    archetypes: listArchetypes().map((a) => ({
      name: a.name,
      group: a.group,
      vector: a.vector,
      count: counts[a.name] ?? 0,
    })),
    totalStamped: rows.length,
    groupTotals,
    tierDistribution,
    field: { reachable: fieldReachable, learnedShapes },
    generatedAt: new Date().toISOString(),
  });
}
