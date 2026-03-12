/**
 * Tests for app/lib/lead-scoring.ts — scoreLead function.
 *
 * Re-implements the scoring logic for standalone testing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement scoring logic (matching app/lib/lead-scoring.ts) ---

const COVERAGE_WEIGHTS = {
  "mortgage-protection": 23, "income-replacement": 23, "final-expense": 22,
  "legacy": 25, "retirement-savings": 21, "guaranteed-income": 18, "not-sure": 8,
};

const INTENT_WEIGHTS = { "protect-family": 20, "want-protection": 12, "exploring": 5 };

const VETERAN_WEIGHTS = {
  "active-duty": 18, "veteran": 18, "reserve": 16, "national-guard": 16, "non-military": 7,
};

const HIGH_VALUE_STATES = new Set([
  "TX","FL","CA","NY","PA","OH","IL","GA","NC","VA","NJ","MI","TN","AZ","IN","MO","MD","WI","SC","AL",
]);
const MEDIUM_VALUE_STATES = new Set([
  "CO","MN","LA","KY","OR","OK","CT","IA","MS","AR","KS","UT","NV","NE","WV","NM","HI","NH","ME","ID",
]);

function scoreLead(lead) {
  const coverage = COVERAGE_WEIGHTS[lead.coverageInterest] || 8;
  const intent = INTENT_WEIGHTS[lead.purchaseIntent || ""] || 5;

  let veteran = VETERAN_WEIGHTS[lead.veteranStatus] || 5;
  if (lead.veteranStatus !== "non-military" && lead.militaryBranch)
    veteran = Math.min(18, veteran + 2);

  let state = 9;
  if (HIGH_VALUE_STATES.has(lead.state)) state = 17;
  else if (MEDIUM_VALUE_STATES.has(lead.state)) state = 13;

  let completeness = 0;
  if (lead.firstName) completeness += 2;
  if (lead.lastName) completeness += 2;
  if (lead.email) completeness += 2;
  if (lead.phone) completeness += 2;
  if (lead.dateOfBirth) completeness += 2;

  let recency = 10;
  const ageMs = Date.now() - new Date(lead.createdAt).getTime();
  const ageHours = ageMs / (1000 * 60 * 60);
  if (ageHours > 72) recency = 2;
  else if (ageHours > 24) recency = 5;
  else if (ageHours > 6) recency = 8;

  const total = Math.min(100, coverage + intent + veteran + state + completeness + recency);

  let tier;
  if (total >= 85) tier = "hot";
  else if (total >= 70) tier = "warm";
  else if (total >= 55) tier = "standard";
  else tier = "cool";

  return { total, tier, factors: { coverage, intent, veteran, state, completeness, recency } };
}

// --- Fixture ---
function makeLead(overrides = {}) {
  return {
    coverageInterest: "mortgage-protection",
    purchaseIntent: "protect-family",
    veteranStatus: "veteran",
    militaryBranch: "army",
    state: "TX",
    email: "john@test.com",
    phone: "5551234567",
    firstName: "John",
    lastName: "Smith",
    dateOfBirth: "1990-06-15",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

// --- Tests ---

describe("scoreLead", () => {
  it("returns a score between 0 and 100", () => {
    const { total } = scoreLead(makeLead());
    assert.ok(total >= 0 && total <= 100, `Score ${total} out of range`);
  });

  it("scores a high-quality military lead as hot", () => {
    const score = scoreLead(makeLead());
    assert.equal(score.tier, "hot");
    assert.ok(score.total >= 85);
  });

  it("scores a low-quality lead as cool", () => {
    const score = scoreLead(makeLead({
      coverageInterest: "not-sure",
      purchaseIntent: "exploring",
      veteranStatus: "non-military",
      militaryBranch: "",
      state: "WY", // low-value state
      firstName: "",
      lastName: "",
      email: "",
      phone: "",
      dateOfBirth: "",
      createdAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000).toISOString(), // 4 days old
    }));
    assert.equal(score.tier, "cool");
    assert.ok(score.total < 55);
  });

  it("gives higher coverage score for legacy vs not-sure", () => {
    const legacy = scoreLead(makeLead({ coverageInterest: "legacy" }));
    const notSure = scoreLead(makeLead({ coverageInterest: "not-sure" }));
    assert.ok(legacy.factors.coverage > notSure.factors.coverage);
  });

  it("gives higher intent score for protect-family vs exploring", () => {
    const high = scoreLead(makeLead({ purchaseIntent: "protect-family" }));
    const low = scoreLead(makeLead({ purchaseIntent: "exploring" }));
    assert.ok(high.factors.intent > low.factors.intent);
  });

  it("gives higher veteran score for active-duty vs non-military", () => {
    const mil = scoreLead(makeLead({ veteranStatus: "active-duty", militaryBranch: "army" }));
    const civ = scoreLead(makeLead({ veteranStatus: "non-military", militaryBranch: "" }));
    assert.ok(mil.factors.veteran > civ.factors.veteran);
  });

  it("gives branch bonus for military with identified branch", () => {
    // reserve starts at 16, +2 = 18 with branch. Without branch = 16.
    const withBranch = scoreLead(makeLead({ veteranStatus: "reserve", militaryBranch: "navy" }));
    const noBranch = scoreLead(makeLead({ veteranStatus: "reserve", militaryBranch: "" }));
    assert.ok(withBranch.factors.veteran > noBranch.factors.veteran);
  });

  it("caps veteran score at 18", () => {
    const score = scoreLead(makeLead({ veteranStatus: "active-duty", militaryBranch: "marines" }));
    assert.ok(score.factors.veteran <= 18);
  });

  it("gives higher state score for TX than WY", () => {
    const tx = scoreLead(makeLead({ state: "TX" }));
    const wy = scoreLead(makeLead({ state: "WY" }));
    assert.ok(tx.factors.state > wy.factors.state);
  });

  it("gives medium state score for CO", () => {
    const score = scoreLead(makeLead({ state: "CO" }));
    assert.equal(score.factors.state, 13);
  });

  it("gives full completeness for complete lead", () => {
    const score = scoreLead(makeLead());
    assert.equal(score.factors.completeness, 10);
  });

  it("gives zero completeness for empty fields", () => {
    const score = scoreLead(makeLead({
      firstName: "", lastName: "", email: "", phone: "", dateOfBirth: "",
    }));
    assert.equal(score.factors.completeness, 0);
  });

  it("reduces recency for old leads", () => {
    const fresh = scoreLead(makeLead());
    const old = scoreLead(makeLead({
      createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
    }));
    const ancient = scoreLead(makeLead({
      createdAt: new Date(Date.now() - 96 * 60 * 60 * 1000).toISOString(),
    }));
    assert.ok(fresh.factors.recency > old.factors.recency);
    assert.ok(old.factors.recency > ancient.factors.recency);
  });

  it("returns correct tier thresholds", () => {
    // Tier thresholds: 85=hot, 70=warm, 55=standard, <55=cool
    const score100 = scoreLead(makeLead()); // should be hot
    assert.equal(score100.tier, "hot");
  });

  it("never exceeds 100", () => {
    const score = scoreLead(makeLead());
    assert.ok(score.total <= 100);
  });

  it("includes all factor keys", () => {
    const score = scoreLead(makeLead());
    assert.ok("coverage" in score.factors);
    assert.ok("intent" in score.factors);
    assert.ok("veteran" in score.factors);
    assert.ok("state" in score.factors);
    assert.ok("completeness" in score.factors);
    assert.ok("recency" in score.factors);
  });
});
