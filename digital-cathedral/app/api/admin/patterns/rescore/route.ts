import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getFilteredLeads } from "@/app/lib/database";
import { evaluateCovenant } from "@/app/lib/valor/covenant-gate";
import { resolveAdapter } from "@/app/lib/valor/lead-ledger";
import { loadLedgerLeads } from "@/app/lib/valor/pattern-library";

export const dynamic = "force-dynamic";

/** Per-run safety cap so one call can't fan out unbounded writes. */
const MAX_BACKFILL = 200;

/**
 * Admin Void Pattern Library — backfill / sync ("pull my leads into the
 * library"). Since neither Void nor the Remembrance field stores leads, the
 * meaningful "sync" is the inverse: take DB leads that were never stamped (or
 * predate the covenant gate), run them through the SAME gate the intake path
 * uses, and record their archetype + coherency into the ledger so they appear
 * in the pattern library.
 *
 * POST /api/admin/patterns/rescore
 *
 * Writes go straight through the ledger adapter (resolveAdapter().append)
 * rather than appendLedgerEntry(), deliberately bypassing the field-bridge
 * side effects — these are historical leads, and replaying them as fresh
 * coherency benefits would pollute the live field metrics.
 */
export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  // Leads already stamped in the ledger — only backfill the gaps.
  const existing = await loadLedgerLeads({ maxMonths: 24, maxEntries: 20000 });
  const stamped = new Set(existing.map((r) => r.leadId));

  // Bounded page of the most recent DB leads.
  const dbResult = await getFilteredLeads({ limit: 200, offset: 0 });
  if (!dbResult.ok) {
    return NextResponse.json(
      { success: false, message: "Failed to read leads." },
      { status: 500 },
    );
  }

  const adapter = resolveAdapter();
  const now = new Date().toISOString();
  let backfilled = 0;
  let skipped = 0;
  let failed = 0;

  for (const lead of dbResult.value.leads) {
    if (stamped.has(lead.leadId)) {
      skipped++;
      continue;
    }
    if (backfilled >= MAX_BACKFILL) break;

    // Mirror the intake covenant evaluation. The submit-timing telemetry isn't
    // persisted on the lead row, so the two cadence dimensions fall back to
    // neutral — the structural archetype match is unaffected.
    const covenant = evaluateCovenant({
      coverageInterest: lead.coverageInterest,
      purchaseIntent: lead.purchaseIntent,
      veteranStatus: lead.veteranStatus,
      militaryBranch: lead.militaryBranch,
      state: lead.state,
      firstName: lead.firstName,
      lastName: lead.lastName,
      email: lead.email,
      phone: lead.phone,
      dateOfBirth: lead.dateOfBirth,
      consentTcpa: lead.consentTcpa,
      consentPrivacy: lead.consentPrivacy,
      consentText: lead.consentText,
      consentTimestamp: lead.consentTimestamp,
      utmSource: lead.utmSource,
      utmMedium: lead.utmMedium,
      utmCampaign: lead.utmCampaign,
      createdAt: lead.createdAt,
    });

    const result = await adapter.append({
      leadId: lead.leadId,
      writtenAt: now,
      observedAt: lead.createdAt,
      lead: {
        firstName: lead.firstName,
        lastName: lead.lastName,
        email: lead.email,
        phone: lead.phone,
        state: lead.state,
        dateOfBirth: lead.dateOfBirth,
        coverageInterest: lead.coverageInterest,
        purchaseIntent: lead.purchaseIntent,
        veteranStatus: lead.veteranStatus,
        militaryBranch: lead.militaryBranch,
      },
      coherency: {
        score: covenant.coherency.score,
        tier: covenant.coherency.tier,
        dominantArchetype: covenant.coherency.dominantArchetype,
        dominantGroup: covenant.coherency.dominantGroup,
        shape: covenant.coherency.shape,
      },
      covenant: {
        verdict: covenant.verdict,
        reason: covenant.reason,
      },
      source: {
        ip: lead.consentIp,
        userAgent: lead.consentUserAgent,
        referer: lead.consentPageUrl,
        utmSource: lead.utmSource,
        utmMedium: lead.utmMedium,
        utmCampaign: lead.utmCampaign,
      },
    });

    if (result.ok) backfilled++;
    else failed++;
  }

  return NextResponse.json({
    success: true,
    scanned: dbResult.value.leads.length,
    backfilled,
    skipped,
    failed,
    note:
      backfilled >= MAX_BACKFILL
        ? `Backfill capped at ${MAX_BACKFILL} per run — run again to continue.`
        : undefined,
  });
}
