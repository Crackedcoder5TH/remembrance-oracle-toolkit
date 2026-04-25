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
import { isHost } from "./host-registry";

export const AGENT_ACCESS_SPEC_VERSION = "1.1.0";

/** Royalty defaults — must match the spec. Hard-capped at 10% combined. */
export const ROYALTY_DEFAULTS = {
  operatorShare: 0.05,
  hostShare: 0.01,
  substrateShare: 0.01,
  totalCap: 0.10,
} as const;

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
    readonly viaSubjectSupported: boolean;
    readonly creditsEarnedAsHost30d: number;
    readonly royaltyShareIfHost: number;
  };
  readonly royalty: {
    readonly consentDefault: boolean;
    readonly operatorShare: number;
    readonly substrateShare: number;
    readonly totalCap: number;
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
      // The spec distinguishes "eligible to be a host" (merit) from
      // "actually hosting right now" (merit AND opted in via
      // /api/agent/host). The opted-in bit is computed asynchronously
      // — see buildAgentAccessAsync below for the version that fills
      // it in. This sync builder leaves it false; safe default.
      isHost: false,
      viaSubjectSupported: true,
      creditsEarnedAsHost30d: 0,
      royaltyShareIfHost: ROYALTY_DEFAULTS.hostShare,
    },
    royalty: {
      consentDefault: true,
      operatorShare: ROYALTY_DEFAULTS.operatorShare,
      substrateShare: ROYALTY_DEFAULTS.substrateShare,
      totalCap: ROYALTY_DEFAULTS.totalCap,
    },
  };
}

/**
 * Async builder that fills in the host-opt-in flag from the host
 * registry. Use this where I/O is fine; use buildAgentAccess for
 * synchronous paths (the only diff is `piggyback.isHost`).
 */
export async function buildAgentAccessAsync(
  agentLabel: string,
  stats: AgentStats,
): Promise<AgentAccess> {
  const base = buildAgentAccess(agentLabel, stats);
  const subjectId = `agent:${agentLabel}`;
  const optedIn = await isHost(subjectId);
  if (!optedIn) return base;
  return {
    ...base,
    piggyback: { ...base.piggyback, isHost: optedIn && base.tier === "merit" },
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
