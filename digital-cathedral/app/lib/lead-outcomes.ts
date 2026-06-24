/**
 * Lead outcomes — the close-rate feedback loop, recorded through retro-causality.
 *
 * When a purchased lead resolves (the agent closed a policy, or didn't), we
 * record that as the lead's *future*. Each outcome is stored in the field's
 * legacy record store as one record that is simultaneously:
 *   1. the analytics row (close-rate by coherency), and
 *   2. a retro-causal resolved-ledger carrier — meta.ledger (observed_start →
 *      observed_end) + meta.resolved — which is exactly what the recall path's
 *      computeRetrocausalAlignment consumes. Feeding it these ledgers is what
 *      makes the (previously inert) "future pulls present" recall come alive.
 *
 * Requires REMEMBRANCE_FIELD_URL (the field is the store). Best-effort: a write
 * returns an error rather than throwing when the field is unreachable.
 */

import {
  storeRecord,
  listRecords,
  recordResolvedOutcome,
  recordBenefit,
  recordCost,
  type ResolvedOutcome,
} from "./valor/remembrance-bridge";

const OUTCOME_TAG = "lead-outcome";

export type LeadOutcomeKind = "won" | "lost";

export interface LeadOutcomeInput {
  leadId: string;
  leadCreatedAt: string;
  coherency: number; // 0–1
  outcome: LeadOutcomeKind;
  premiumCents?: number; // policy premium when won (optional)
  clientId?: string;
}

const outcomeRecordId = (leadId: string): string => "outcome:" + leadId;

/** Coherency band label used to bucket outcomes for the close-rate report. */
export function coherencyBucket(coherency: number): string {
  const c = Math.max(0, Math.min(1, coherency));
  if (c >= 0.95) return "0.95+ transcendence";
  if (c >= 0.85) return "0.85–0.95 synergy";
  if (c >= 0.70) return "0.70–0.85 foundation";
  if (c >= 0.60) return "0.60–0.70 gate";
  return "<0.60 below-gate";
}

const BUCKET_ORDER = [
  "0.95+ transcendence",
  "0.85–0.95 synergy",
  "0.70–0.85 foundation",
  "0.60–0.70 gate",
  "<0.60 below-gate",
];

/** Record a resolved lead outcome (upsert-by-lead, so re-marking corrects). */
export async function recordLeadOutcome(input: LeadOutcomeInput): Promise<{ ok: boolean; error?: string }> {
  const resolvedAt = new Date().toISOString();
  const resolution: ResolvedOutcome = {
    outcome: input.outcome,
    resolvedCoherence: Math.max(0, Math.min(1, input.coherency)),
    resolvedAt,
  };

  const stored = await storeRecord({
    id: outcomeRecordId(input.leadId),
    name: outcomeRecordId(input.leadId),
    content: JSON.stringify({
      leadId: input.leadId,
      coherency: resolution.resolvedCoherence,
      outcome: input.outcome,
      premiumCents: input.premiumCents ?? null,
      clientId: input.clientId ?? null,
      resolvedAt,
    }),
    tags: [OUTCOME_TAG, input.outcome, coherencyBucket(resolution.resolvedCoherence)],
    meta: {
      resolved: resolution,
      ledger: { observed_start: input.leadCreatedAt, observed_end: resolvedAt, cadence: "variable" },
    },
  });
  if (!stored || !stored.ok) {
    return { ok: false, error: "Field store unavailable — set REMEMBRANCE_FIELD_URL and ensure the field is reachable." };
  }

  // Best-effort: stamp the lead's OWN substrate record with the same resolution,
  // so when leads live on the substrate a won lead becomes a resolved anchor the
  // retro-causal recall pulls future similar leads toward.
  await recordResolvedOutcome("lead:" + input.leadId, resolution, input.leadCreatedAt).catch(() => ({ ok: false }));

  // Wire the outcome into the Living Remembrance Engine — the external truth
  // that closes the loop. A won lead is a coherency-positive event (the grade,
  // validated by a real close); a lost one is an entropy cost. Mirrors the
  // lead-ledger admit/reject contributions; fire-and-forget.
  if (input.outcome === "won") {
    void recordBenefit(resolution.resolvedCoherence, "valor:lead-outcome:won", 1).catch(() => {});
  } else {
    void recordCost(1, "valor:lead-outcome", "lost").catch(() => {});
  }

  return { ok: true };
}

export interface CoherencyOutcomeBucket {
  bucket: string;
  won: number;
  lost: number;
  total: number;
  closeRate: number; // won / total, 0–1
  avgPremiumCents: number | null;
}

/** Aggregate recorded outcomes into close-rate by coherency band — the proof. */
export async function getCloseRateByCoherency(): Promise<{
  buckets: CoherencyOutcomeBucket[];
  totalWon: number;
  totalLost: number;
}> {
  const { records } = await listRecords({ tags: [OUTCOME_TAG], limit: 500 });
  const byBucket = new Map<string, { won: number; lost: number; premiumSum: number; premiumN: number }>();
  let totalWon = 0;
  let totalLost = 0;

  for (const r of records) {
    let data: { coherency?: number; outcome?: string; premiumCents?: number | null };
    try { data = JSON.parse(r.content); } catch { continue; }
    const bucket = coherencyBucket(typeof data.coherency === "number" ? data.coherency : 0);
    const slot = byBucket.get(bucket) ?? { won: 0, lost: 0, premiumSum: 0, premiumN: 0 };
    if (data.outcome === "won") {
      slot.won++;
      totalWon++;
      if (typeof data.premiumCents === "number") { slot.premiumSum += data.premiumCents; slot.premiumN++; }
    } else if (data.outcome === "lost") {
      slot.lost++;
      totalLost++;
    }
    byBucket.set(bucket, slot);
  }

  const buckets: CoherencyOutcomeBucket[] = BUCKET_ORDER
    .filter((b) => byBucket.has(b))
    .map((b) => {
      const s = byBucket.get(b)!;
      const total = s.won + s.lost;
      return {
        bucket: b,
        won: s.won,
        lost: s.lost,
        total,
        closeRate: total > 0 ? s.won / total : 0,
        avgPremiumCents: s.premiumN > 0 ? Math.round(s.premiumSum / s.premiumN) : null,
      };
    });

  return { buckets, totalWon, totalLost };
}
