import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getLeadById } from "@/app/lib/database";
import { scoreLead } from "@/app/lib/lead-scoring";
import {
  recordLeadOutcome,
  getCloseRateByCoherency,
  type LeadOutcomeKind,
} from "@/app/lib/lead-outcomes";

export const dynamic = "force-dynamic";

/**
 * Lead outcomes — the close-rate-by-coherency feedback loop.
 *
 *   GET  — close-rate aggregated by coherency band (the proof that the grade
 *          predicts closes).
 *   POST — record a resolved outcome for a lead ({ leadId, outcome: "won"|"lost",
 *          premiumCents? }). The lead's coherency is read from its score
 *          (score.total = coherency×100), and the outcome is stored as a
 *          retro-causal resolved ledger.
 */
export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const report = await getCloseRateByCoherency();
  return NextResponse.json({ success: true, ...report });
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  let body: { leadId?: unknown; outcome?: unknown; premiumCents?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ success: false, message: "Invalid JSON." }, { status: 400 });
  }

  const leadId = typeof body.leadId === "string" ? body.leadId.trim() : "";
  const outcome = body.outcome === "won" || body.outcome === "lost" ? (body.outcome as LeadOutcomeKind) : null;
  if (!leadId || !outcome) {
    return NextResponse.json(
      { success: false, message: 'Body must be { leadId, outcome: "won" | "lost", premiumCents? }.' },
      { status: 400 },
    );
  }
  const premiumCents =
    typeof body.premiumCents === "number" && Number.isFinite(body.premiumCents) && body.premiumCents >= 0
      ? Math.round(body.premiumCents)
      : undefined;

  const leadResult = await getLeadById(leadId);
  if (!leadResult.ok) {
    return NextResponse.json({ success: false, message: "Failed to look up lead." }, { status: 500 });
  }
  const lead = leadResult.value;
  if (!lead) {
    return NextResponse.json({ success: false, message: `No lead found for ${leadId}.` }, { status: 404 });
  }

  // score.total is the coherency grade ×100 (scoreLead projects the covenant
  // cascade into the legacy 0–100 shape), so /100 recovers the 0–1 coherency.
  const coherency = scoreLead(lead).total / 100;

  const result = await recordLeadOutcome({
    leadId,
    leadCreatedAt: lead.createdAt,
    coherency,
    outcome,
    premiumCents,
  });
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.error || "Failed to record outcome." }, { status: 503 });
  }
  return NextResponse.json({ success: true, leadId, outcome, coherency });
}
