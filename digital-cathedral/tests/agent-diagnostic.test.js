/**
 * Tests for app/lib/valor/agent-diagnostic.ts — the structured rejection
 * feedback returned to authenticated AI agents on /api/agent/leads.
 *
 * Re-implements the diagnostic builder in plain JS (same convention as
 * tests/valor-coherency.test.js) so the suite doesn't need a TS toolchain.
 * Any drift between this file and the TS module is a bug signal.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// ─── Port of relevant constants from coherency-primitives.ts ─────

const COHERENCY_THRESHOLDS = {
  REJECTION: 0.0,
  GATE: 0.6,
  PULL: 0.68,
  FOUNDATION: 0.7,
  STABILITY: 0.75,
  OPTIMIZATION: 0.8,
  SYNERGY: 0.85,
  INTELLIGENCE: 0.9,
  TRANSCENDENCE: 0.95,
  UNITY: 0.98,
};

const LEAD_DIMENSIONS = [
  "coverage_clarity",
  "intent_strength",
  "veteran_integrity",
  "branch_specificity",
  "state_market_fit",
  "field_completeness",
  "recency",
  "consent_integrity",
  "email_quality",
  "phone_quality",
  "name_plausibility",
  "dob_validity",
  "marketing_context",
  "session_coherence",
  "timing_cadence",
  "step_rhythm",
];

// ─── Port of agent-diagnostic.ts ─────────────────────────────────

function roundTo(n, decimals) {
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

function pickWeakestDimensions(dims, k) {
  return Object.entries(dims)
    .map(([dimension, score]) => ({ dimension, score }))
    .sort((a, b) => a.score - b.score)
    .slice(0, k)
    .map(({ dimension, score }) => ({
      dimension,
      score: roundTo(score, 4),
      hint: `hint for ${dimension}`,
    }));
}

function buildAgentDiagnostic(decision) {
  const { verdict, coherency, reason } = decision;
  const threshold =
    verdict === "admit-low-coherency"
      ? COHERENCY_THRESHOLDS.FOUNDATION
      : COHERENCY_THRESHOLDS.GATE;
  const gap = Math.max(0, threshold - coherency.score);
  const weakestDimensions = pickWeakestDimensions(coherency.dimensions, 3);
  const topArchetypeMatches = (coherency.matches ?? []).slice(0, 3).map((m) => ({
    name: m.name,
    r: roundTo(m.r, 4),
    kind: m.kind,
  }));
  const retryable =
    verdict === "soft-reject-low" || verdict === "admit-low-coherency";
  const guidance = [];
  if (verdict === "silent-reject-bot") {
    guidance.push(`bot:${coherency.dominantArchetype}`);
  } else if (verdict === "silent-reject-fraud") {
    guidance.push(`fraud:${coherency.dominantArchetype}`);
  } else if (verdict === "soft-reject-low") {
    guidance.push("below-gate");
  } else if (verdict === "admit-low-coherency") {
    guidance.push("below-foundation");
  } else {
    guidance.push("admitted");
  }
  for (const w of weakestDimensions) {
    guidance.push(`weak[${w.dimension}]`);
  }
  return {
    verdict,
    retryable,
    coherency: {
      score: roundTo(coherency.score, 4),
      threshold,
      gap: roundTo(gap, 4),
      tier: coherency.tier,
      dominantArchetype: coherency.dominantArchetype,
      dominantGroup: coherency.dominantGroup,
    },
    weakestDimensions,
    topArchetypeMatches,
    guidance,
    reason,
  };
}

// ─── Helpers to build fake CovenantDecisions ──────────────────────

function evenDimensions(score) {
  const out = {};
  for (const d of LEAD_DIMENSIONS) out[d] = score;
  return out;
}

function decision({
  verdict = "soft-reject-low",
  score = 0.42,
  tier = "rejection",
  dominantArchetype = "valor/protective-veteran",
  dominantGroup = "valor",
  dimensions = evenDimensions(score),
  matches = [],
  reason = "test",
} = {}) {
  return {
    verdict,
    coherency: {
      score,
      tier,
      dominantArchetype,
      dominantGroup,
      dimensions,
      matches,
      shape: Object.values(dimensions),
      admitted: verdict.startsWith("admit"),
    },
    reason,
  };
}

// ─── Tests ────────────────────────────────────────────────────────

describe("buildAgentDiagnostic — verdict shape", () => {
  it("soft-reject-low returns retryable=true with the GATE threshold", () => {
    const d = buildAgentDiagnostic(
      decision({ verdict: "soft-reject-low", score: 0.42 }),
    );
    assert.equal(d.verdict, "soft-reject-low");
    assert.equal(d.retryable, true);
    assert.equal(d.coherency.threshold, COHERENCY_THRESHOLDS.GATE);
    assert.ok(d.coherency.gap > 0);
  });

  it("admit-low-coherency uses the FOUNDATION threshold + gap", () => {
    const d = buildAgentDiagnostic(
      decision({ verdict: "admit-low-coherency", score: 0.65, tier: "gate" }),
    );
    assert.equal(d.coherency.threshold, COHERENCY_THRESHOLDS.FOUNDATION);
    assert.equal(d.coherency.gap, roundTo(0.7 - 0.65, 4));
    assert.equal(d.retryable, true);
  });

  it("silent-reject-bot is NOT retryable (agent must fix the pipeline)", () => {
    const d = buildAgentDiagnostic(
      decision({
        verdict: "silent-reject-bot",
        score: 0.3,
        dominantArchetype: "bot/template-spam",
        dominantGroup: "bot",
      }),
    );
    assert.equal(d.verdict, "silent-reject-bot");
    assert.equal(d.retryable, false);
    assert.ok(d.guidance[0].includes("bot/template-spam"));
  });

  it("silent-reject-fraud is NOT retryable", () => {
    const d = buildAgentDiagnostic(
      decision({
        verdict: "silent-reject-fraud",
        score: 0.5,
        dominantArchetype: "fraud/synthetic-identity",
        dominantGroup: "fraud",
      }),
    );
    assert.equal(d.retryable, false);
    assert.ok(d.guidance[0].includes("fraud/synthetic-identity"));
  });

  it("admit returns informational diagnostic (no gap)", () => {
    const d = buildAgentDiagnostic(
      decision({
        verdict: "admit",
        score: 0.82,
        tier: "optimization",
      }),
    );
    assert.equal(d.coherency.gap, 0);
    assert.equal(d.retryable, false);
  });
});

describe("buildAgentDiagnostic — weakestDimensions", () => {
  it("returns the three lowest-scoring dimensions in ascending order", () => {
    const dims = evenDimensions(0.9);
    dims.coverage_clarity = 0.1;
    dims.intent_strength = 0.2;
    dims.email_quality = 0.3;
    const d = buildAgentDiagnostic(
      decision({ verdict: "soft-reject-low", score: 0.4, dimensions: dims }),
    );
    assert.equal(d.weakestDimensions.length, 3);
    assert.deepEqual(
      d.weakestDimensions.map((w) => w.dimension),
      ["coverage_clarity", "intent_strength", "email_quality"],
    );
    assert.equal(d.weakestDimensions[0].score, 0.1);
  });

  it("attaches a hint string to every weakest dimension", () => {
    const d = buildAgentDiagnostic(decision());
    for (const w of d.weakestDimensions) {
      assert.ok(typeof w.hint === "string" && w.hint.length > 0);
    }
  });

  it("appends a weak[<dim>] entry to guidance for every weakest dimension", () => {
    const d = buildAgentDiagnostic(decision());
    const weakLines = d.guidance.filter((g) => g.startsWith("weak["));
    assert.equal(weakLines.length, d.weakestDimensions.length);
  });
});

describe("buildAgentDiagnostic — topArchetypeMatches", () => {
  it("returns at most three matches in input order", () => {
    const matches = [
      { name: "valor/protective-veteran", r: 0.92, kind: "harmonic" },
      { name: "valor/income-replacement-pro", r: 0.71, kind: "harmonic" },
      { name: "fraud/synthetic-identity", r: -0.42, kind: "anti-phase" },
      { name: "bot/template-spam", r: 0.18, kind: "weak" },
    ];
    const d = buildAgentDiagnostic(decision({ matches }));
    assert.equal(d.topArchetypeMatches.length, 3);
    assert.equal(d.topArchetypeMatches[0].name, "valor/protective-veteran");
  });

  it("handles empty matches array", () => {
    const d = buildAgentDiagnostic(decision({ matches: [] }));
    assert.deepEqual(d.topArchetypeMatches, []);
  });
});

describe("buildAgentDiagnostic — score rounding", () => {
  it("rounds score, gap, and dimension scores to 4 decimals", () => {
    const dims = evenDimensions(0.5);
    dims.email_quality = 0.123456789;
    const d = buildAgentDiagnostic(
      decision({ score: 0.123456789, dimensions: dims }),
    );
    assert.equal(d.coherency.score, 0.1235);
    const emailDim = d.weakestDimensions.find(
      (w) => w.dimension === "email_quality",
    );
    assert.equal(emailDim.score, 0.1235);
  });
});
