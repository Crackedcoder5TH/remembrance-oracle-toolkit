/**
 * Tests for app/lib/valor/agent-tier.ts — derives an authenticated agent's
 * tier from their submission history per the Remembrance Agent Access Spec.
 *
 * Re-implements the derivation in plain JS (same convention as the rest
 * of the test suite) so the tests don't need a TS toolchain. Any drift
 * between this file and the TS module is a bug signal.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Constants mirrored from agent-tier.ts ───────────────────────

const SPEC_VERSION = "1.0.0";

const MERIT_THRESHOLDS = {
  windowDays: 30,
  minSubmissions: 5,
  minHighCoherency: 5,
  maxRejections: 0,
  highCoherencyThreshold: 0.7,
};

const VISIBILITY_DELAY = { basic: 7, merit: 0, admin: 0 };

// ─── Port of agent-tier.ts ───────────────────────────────────────

function visibilityDelayDays(tier) {
  return VISIBILITY_DELAY[tier] ?? 7;
}

function statsFromEntries(entries, agentLabel, now) {
  const cutoff = now - MERIT_THRESHOLDS.windowDays * 24 * 60 * 60 * 1000;
  let submissions = 0;
  let highCoherency = 0;
  let rejections = 0;
  let lastSubmissionAt = null;

  for (const e of entries) {
    if (e.source.utmSource !== "ai-agent") continue;
    if (e.source.utmMedium !== agentLabel) continue;
    const ts = Date.parse(e.writtenAt);
    if (!Number.isFinite(ts) || ts < cutoff) continue;
    submissions += 1;
    if (e.coherency.score >= MERIT_THRESHOLDS.highCoherencyThreshold) {
      highCoherency += 1;
    }
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

  return {
    submissions30d: submissions,
    highCoherencyCount30d: highCoherency,
    rejections30d: rejections,
    lastSubmissionAt,
  };
}

function deriveTier(stats) {
  const meets =
    stats.submissions30d >= MERIT_THRESHOLDS.minSubmissions
    && stats.highCoherencyCount30d >= MERIT_THRESHOLDS.minHighCoherency
    && stats.rejections30d <= MERIT_THRESHOLDS.maxRejections;
  return meets ? "merit" : "basic";
}

function buildAgentAccess(agentLabel, stats) {
  const tier = deriveTier(stats);
  return {
    specVersion: SPEC_VERSION,
    agentId: agentLabel,
    tier,
    visibilityDelayDays: visibilityDelayDays(tier),
    stats,
    promotion: {
      currentTier: tier,
      nextTier: tier === "basic" ? "merit" : null,
      needed: {
        submissions: MERIT_THRESHOLDS.minSubmissions,
        highCoherency: MERIT_THRESHOLDS.minHighCoherency,
        rejectionsAllowed: MERIT_THRESHOLDS.maxRejections,
      },
      have: {
        submissions: stats.submissions30d,
        highCoherency: stats.highCoherencyCount30d,
        rejections: stats.rejections30d,
      },
    },
    piggyback: {
      isHost: tier === "merit",
      viaAgentSupported: true,
      creditsEarnedAsHost30d: 0,
    },
  };
}

// ─── Test fixture ─────────────────────────────────────────────────

function entry({
  ts,
  agent = "claude",
  utmSource = "ai-agent",
  score = 0.5,
  verdict = "admit",
} = {}) {
  return {
    leadId: `lead_${ts}`,
    writtenAt: ts,
    observedAt: ts,
    lead: {
      firstName: "x",
      lastName: "y",
      email: "x@y.com",
      phone: "+15551234567",
      state: "TX",
      dateOfBirth: "1980-01-01",
      coverageInterest: "mortgage-protection",
      veteranStatus: "veteran",
      militaryBranch: "army",
    },
    coherency: {
      score,
      tier: "foundation",
      dominantArchetype: "valor/protective-veteran",
      dominantGroup: "valor",
      shape: [],
    },
    covenant: { verdict, reason: "" },
    source: { ip: "", userAgent: "", referer: "", utmSource, utmMedium: agent },
  };
}

const NOW = Date.parse("2026-04-25T00:00:00Z");
function daysAgo(d) {
  return new Date(NOW - d * 24 * 60 * 60 * 1000).toISOString();
}

// ─── Tests ────────────────────────────────────────────────────────

describe("statsFromEntries", () => {
  it("only counts entries with utmSource=ai-agent and matching label", () => {
    const entries = [
      entry({ ts: daysAgo(1), agent: "claude", score: 0.8 }),
      entry({ ts: daysAgo(1), agent: "gpt-4", score: 0.8 }),  // wrong label
      entry({ ts: daysAgo(1), agent: "claude", utmSource: "web", score: 0.8 }),  // not agent
    ];
    const stats = statsFromEntries(entries, "claude", NOW);
    assert.equal(stats.submissions30d, 1);
    assert.equal(stats.highCoherencyCount30d, 1);
  });

  it("excludes entries older than the 30-day window", () => {
    const entries = [
      entry({ ts: daysAgo(1), score: 0.8 }),
      entry({ ts: daysAgo(45), score: 0.95 }),  // outside window
    ];
    const stats = statsFromEntries(entries, "claude", NOW);
    assert.equal(stats.submissions30d, 1);
    assert.equal(stats.highCoherencyCount30d, 1);
  });

  it("counts highCoherency only when score >= 0.70", () => {
    const entries = [
      entry({ ts: daysAgo(1), score: 0.69 }),
      entry({ ts: daysAgo(2), score: 0.70 }),
      entry({ ts: daysAgo(3), score: 0.95 }),
    ];
    const stats = statsFromEntries(entries, "claude", NOW);
    assert.equal(stats.submissions30d, 3);
    assert.equal(stats.highCoherencyCount30d, 2);
  });

  it("counts rejections from bot/fraud verdicts", () => {
    const entries = [
      entry({ ts: daysAgo(1), verdict: "silent-reject-bot" }),
      entry({ ts: daysAgo(2), verdict: "silent-reject-fraud" }),
      entry({ ts: daysAgo(3), verdict: "soft-reject-low" }),  // not a "rejection" for tier purposes
      entry({ ts: daysAgo(4), verdict: "admit" }),
    ];
    const stats = statsFromEntries(entries, "claude", NOW);
    assert.equal(stats.rejections30d, 2);
  });

  it("tracks the most recent submission timestamp", () => {
    const entries = [
      entry({ ts: daysAgo(5) }),
      entry({ ts: daysAgo(1) }),  // most recent
      entry({ ts: daysAgo(10) }),
    ];
    const stats = statsFromEntries(entries, "claude", NOW);
    assert.equal(stats.lastSubmissionAt, daysAgo(1));
  });
});

describe("deriveTier", () => {
  it("basic when below submission threshold", () => {
    assert.equal(
      deriveTier({ submissions30d: 4, highCoherencyCount30d: 4, rejections30d: 0, lastSubmissionAt: null }),
      "basic",
    );
  });

  it("basic when below high-coherency threshold", () => {
    assert.equal(
      deriveTier({ submissions30d: 10, highCoherencyCount30d: 4, rejections30d: 0, lastSubmissionAt: null }),
      "basic",
    );
  });

  it("basic when ANY rejection in window (max=0)", () => {
    assert.equal(
      deriveTier({ submissions30d: 10, highCoherencyCount30d: 10, rejections30d: 1, lastSubmissionAt: null }),
      "basic",
    );
  });

  it("merit when all thresholds met", () => {
    assert.equal(
      deriveTier({ submissions30d: 5, highCoherencyCount30d: 5, rejections30d: 0, lastSubmissionAt: null }),
      "merit",
    );
  });
});

describe("visibilityDelayDays", () => {
  it("basic gets 7-day delay; merit gets 0", () => {
    assert.equal(visibilityDelayDays("basic"), 7);
    assert.equal(visibilityDelayDays("merit"), 0);
    assert.equal(visibilityDelayDays("admin"), 0);
  });
});

describe("buildAgentAccess", () => {
  it("returns the introspection shape with promotion progress", () => {
    const stats = { submissions30d: 3, highCoherencyCount30d: 2, rejections30d: 0, lastSubmissionAt: daysAgo(1) };
    const access = buildAgentAccess("claude", stats);
    assert.equal(access.specVersion, SPEC_VERSION);
    assert.equal(access.tier, "basic");
    assert.equal(access.visibilityDelayDays, 7);
    assert.equal(access.promotion.nextTier, "merit");
    assert.equal(access.promotion.have.submissions, 3);
    assert.equal(access.promotion.needed.submissions, 5);
    assert.equal(access.piggyback.isHost, false);
  });

  it("merit access marks isHost=true and zero delay", () => {
    const stats = { submissions30d: 8, highCoherencyCount30d: 7, rejections30d: 0, lastSubmissionAt: daysAgo(0) };
    const access = buildAgentAccess("claude", stats);
    assert.equal(access.tier, "merit");
    assert.equal(access.visibilityDelayDays, 0);
    assert.equal(access.promotion.nextTier, null);
    assert.equal(access.piggyback.isHost, true);
  });
});
