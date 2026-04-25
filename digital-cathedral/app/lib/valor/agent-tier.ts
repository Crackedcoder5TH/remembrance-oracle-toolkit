/**
 * Agent Tier — derives an authenticated AI agent's tier from their
 * submission history. Implements the Remembrance Agent Access Spec
 * (REMEMBRANCE_AGENT_ACCESS_SPEC.md at the toolkit root).
 *
 * Tier is **derived from behavior** — never assigned by humans (except
 * for the operator's master key, which sits outside this module). The
 * derivation runs on every submission so promotion / demotion is
 * automatic.
 *
 * Source of truth: the lead-ledger. Every admitted lead from an agent
 * carries `source.utmSource === "ai-agent"` and
 * `source.utmMedium === <agent.label>`, so we can scan the trailing
 * 30-day window and bucket by agent without changing the schema.
 */

import { readRecentEntries, type LedgerEntry } from "./lead-ledger";
import { COHERENCY_THRESHOLDS } from "./coherency-primitives";

export const AGENT_ACCESS_SPEC_VERSION = "1.0.0";

export type AgentTier = "basic" | "merit" | "admin";

export interface AgentStats {
  readonly submissions30d: number;
  readonly highCoherencyCount30d: number;
  readonly rejections30d: number;
  readonly lastSubmissionAt: string | null;
}

export interface PromotionRequirements {
  readonly currentTier: AgentTier;
  readonly nextTier: AgentTier | null;
  readonly needed: {
    readonly submissions: number;
    readonly highCoherency: number;
    readonly rejectionsAllowed: number;
  };
  readonly have: {
    readonly submissions: number;
    readonly highCoherency: number;
    readonly rejections: number;
  };
}

export interface AgentAccess {
  readonly specVersion: string;
  readonly agentId: string;
  readonly tier: AgentTier;
  readonly visibilityDelayDays: number;
  readonly stats: AgentStats;
  readonly promotion: PromotionRequirements;
  readonly piggyback: {
    readonly isHost: boolean;
    readonly viaAgentSupported: boolean;
    readonly creditsEarnedAsHost30d: number;
  };
}

/** Promotion thresholds. Mirrored 1:1 in void's agent_tier.py. */
export const MERIT_THRESHOLDS = {
  windowDays: 30,
  minSubmissions: 5,
  minHighCoherency: 5,
  maxRejections: 0,
  highCoherencyThreshold: COHERENCY_THRESHOLDS.FOUNDATION, // 0.70
} as const;

/** Per-tier visibility delay applied to the agent's view of its own activity. */
export function visibilityDelayDays(tier: AgentTier): number {
  if (tier === "basic") return 7;
  return 0;
}

/**
 * Compute trailing-30d stats for one agent label by scanning recent
 * ledger entries. Read-only; never mutates.
 *
 * Pulls a generous slice (1000 entries) and filters in-memory — the
 * ledger isn't large enough for this to matter for any deployment that
 * needs a tier system. If/when it does, swap to an index.
 */
export async function computeAgentStats(agentLabel: string): Promise<AgentStats> {
  const recent = await readRecentEntries(1000);
  return statsFromEntries(recent, agentLabel, Date.now());
}

/** Pure derivation — exported for tests so they don't need ledger I/O. */
export function statsFromEntries(
  entries: readonly LedgerEntry[],
  agentLabel: string,
  now: number,
): AgentStats {
  const cutoff = now - MERIT_THRESHOLDS.windowDays * 24 * 60 * 60 * 1000;
  const threshold = MERIT_THRESHOLDS.highCoherencyThreshold;

  let submissions = 0;
  let highCoherency = 0;
  let rejections = 0;
  let lastSubmissionAt: string | null = null;

  for (const e of entries) {
    if (e.source.utmSource !== "ai-agent") continue;
    if (e.source.utmMedium !== agentLabel) continue;

    const ts = Date.parse(e.writtenAt);
    if (!Number.isFinite(ts) || ts < cutoff) continue;

    submissions += 1;
    if (e.coherency.score >= threshold) highCoherency += 1;
    if (
      e.covenant.verdict === "silent-reject-bot"
      || e.covenant.verdict === "silent-reject-fraud"
    ) {
      rejections += 1;
    }
    if (lastSubmissionAt === null || e.writtenAt > lastSubmissionAt) {
      lastSubmissionAt = e.writtenAt;
    }
  }

  return { submissions30d: submissions, highCoherencyCount30d: highCoherency, rejections30d: rejections, lastSubmissionAt };
}

/** Decide the agent's current tier from their stats. */
export function deriveTier(stats: AgentStats): AgentTier {
  const meets =
    stats.submissions30d >= MERIT_THRESHOLDS.minSubmissions
    && stats.highCoherencyCount30d >= MERIT_THRESHOLDS.minHighCoherency
    && stats.rejections30d <= MERIT_THRESHOLDS.maxRejections;
  return meets ? "merit" : "basic";
}

/** Build the introspection response for /api/agent/access. */
export function buildAgentAccess(agentLabel: string, stats: AgentStats): AgentAccess {
  const tier = deriveTier(stats);
  return {
    specVersion: AGENT_ACCESS_SPEC_VERSION,
    agentId: agentLabel,
    tier,
    visibilityDelayDays: visibilityDelayDays(tier),
    stats,
    promotion: buildPromotion(tier, stats),
    piggyback: {
      isHost: tier === "merit",
      viaAgentSupported: true,
      // Piggyback ledger isn't wired yet — value will populate once the
      // /api/agent/leads route accepts and records X-Via-Agent. Spec'd
      // here so the response shape is stable.
      creditsEarnedAsHost30d: 0,
    },
  };
}

function buildPromotion(currentTier: AgentTier, stats: AgentStats): PromotionRequirements {
  const t = MERIT_THRESHOLDS;
  return {
    currentTier,
    nextTier: currentTier === "basic" ? "merit" : null,
    needed: {
      submissions: t.minSubmissions,
      highCoherency: t.minHighCoherency,
      rejectionsAllowed: t.maxRejections,
    },
    have: {
      submissions: stats.submissions30d,
      highCoherency: stats.highCoherencyCount30d,
      rejections: stats.rejections30d,
    },
  };
}
