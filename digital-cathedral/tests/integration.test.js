/**
 * Integration tests — full lead lifecycle from submission to distribution.
 *
 * Tests the complete flow: validate → score → match → distribute → price.
 * All logic is self-contained (no external dependencies).
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Import logic from other test files (re-implemented inline) ---

// Validation
function validateLeadPayload(body) {
  if (!body || typeof body !== "object") return { valid: false, errors: ["Request body must be a JSON object."] };
  const errors = [];
  const b = body;

  if (typeof b.firstName !== "string" || b.firstName.trim().length < 2) errors.push("First name required.");
  if (typeof b.lastName !== "string" || b.lastName.trim().length < 2) errors.push("Last name required.");
  if (typeof b.email !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(b.email)) errors.push("Invalid email.");
  if (typeof b.phone !== "string" || b.phone.replace(/\D/g, "").length < 10) errors.push("Invalid phone.");
  const VALID_STATES = new Set(["TX","CA","NY","FL","OH","IL","GA","NC","VA","PA"]);
  if (!VALID_STATES.has(b.state)) errors.push("Invalid state.");
  const VALID_COVERAGE = new Set(["mortgage-protection","final-expense","income-replacement","legacy","not-sure"]);
  if (!VALID_COVERAGE.has(b.coverageInterest)) errors.push("Invalid coverage.");
  if (b.tcpaConsent !== true) errors.push("TCPA consent required.");
  if (b.privacyConsent !== true) errors.push("Privacy consent required.");

  if (errors.length > 0) return { valid: false, errors };
  return {
    valid: true,
    data: {
      firstName: b.firstName.trim(),
      lastName: b.lastName.trim(),
      email: b.email.trim().toLowerCase(),
      phone: b.phone.replace(/\D/g, "").slice(-10),
      state: b.state,
      coverageInterest: b.coverageInterest,
      purchaseIntent: b.purchaseIntent || "exploring",
      veteranStatus: b.veteranStatus || "non-military",
      militaryBranch: b.militaryBranch || "",
      dateOfBirth: b.dateOfBirth || "1990-01-01",
      consentTimestamp: b.consentTimestamp || new Date().toISOString(),
      consentText: b.consentText || "I consent.",
    },
  };
}

// Scoring (simplified)
const COVERAGE_WEIGHTS = { "mortgage-protection": 23, "final-expense": 22, "income-replacement": 23, "legacy": 25, "not-sure": 8 };
const INTENT_WEIGHTS = { "protect-family": 20, "want-protection": 12, "exploring": 5 };
const VETERAN_WEIGHTS = { "active-duty": 18, "veteran": 18, "non-military": 7 };
const HIGH_VALUE_STATES = new Set(["TX","FL","CA","NY","PA","OH","IL","GA","NC","VA"]);

function scoreLead(lead) {
  const coverage = COVERAGE_WEIGHTS[lead.coverageInterest] || 8;
  const intent = INTENT_WEIGHTS[lead.purchaseIntent || ""] || 5;
  let veteran = VETERAN_WEIGHTS[lead.veteranStatus] || 5;
  if (lead.veteranStatus !== "non-military" && lead.militaryBranch) veteran = Math.min(18, veteran + 2);
  const state = HIGH_VALUE_STATES.has(lead.state) ? 17 : 9;
  const completeness = [lead.firstName, lead.lastName, lead.email, lead.phone, lead.dateOfBirth].filter(Boolean).length * 2;
  const total = Math.min(100, coverage + intent + veteran + state + completeness + 10); // 10 = fresh lead recency

  let tier;
  if (total >= 85) tier = "hot";
  else if (total >= 70) tier = "warm";
  else if (total >= 55) tier = "standard";
  else tier = "cool";

  return { total, tier };
}

// Distribution matching (simplified)
function matchClient(client, lead, score) {
  if (score.total < client.minScore) return { match: false, reason: "Score too low" };
  const licenses = JSON.parse(client.stateLicenses || "[]");
  if (licenses.length > 0 && !licenses.includes(lead.state)) return { match: false, reason: "Not licensed" };
  return { match: true };
}

// Depreciation
function calculatePrice(ageInDays, basePrice, holdDays, dropAmount, dropInterval, floor) {
  if (ageInDays <= holdDays) return basePrice;
  const steps = Math.floor((ageInDays - holdDays) / dropInterval);
  return Math.max(floor, basePrice - dropAmount * steps);
}

// --- Full lifecycle fixtures ---
function validSubmission(overrides = {}) {
  return {
    firstName: "Marcus",
    lastName: "Johnson",
    dateOfBirth: "1988-03-15",
    email: "marcus@example.com",
    phone: "(555) 987-6543",
    state: "TX",
    coverageInterest: "mortgage-protection",
    purchaseIntent: "protect-family",
    veteranStatus: "veteran",
    militaryBranch: "army",
    tcpaConsent: true,
    privacyConsent: true,
    consentTimestamp: new Date().toISOString(),
    consentText: "I consent to be contacted by a licensed professional.",
    ...overrides,
  };
}

// --- Integration Tests ---

describe("Lead Lifecycle Integration", () => {
  it("valid lead → high score → matched to buyer → priced correctly", () => {
    // Step 1: Validate
    const validation = validateLeadPayload(validSubmission());
    assert.equal(validation.valid, true);
    const lead = { ...validation.data, leadId: "lead_int_1", createdAt: new Date().toISOString() };

    // Step 2: Score
    const score = scoreLead(lead);
    assert.ok(score.total >= 85, `Expected hot lead, got score ${score.total}`);
    assert.equal(score.tier, "hot");

    // Step 3: Match to buyer
    const buyer = { clientId: "buyer_1", minScore: 70, stateLicenses: JSON.stringify(["TX", "CA"]) };
    const matchResult = matchClient(buyer, lead, score);
    assert.equal(matchResult.match, true);

    // Step 4: Price the lead (fresh, exclusive)
    const price = calculatePrice(0, 12000, 3, 500, 1, 6000);
    assert.equal(price, 12000); // $120 — fresh exclusive lead
  });

  it("low-quality lead → cool score → no buyer match", () => {
    const submission = validSubmission({
      coverageInterest: "not-sure",
      purchaseIntent: "exploring",
      veteranStatus: "non-military",
      militaryBranch: "",
    });

    const validation = validateLeadPayload(submission);
    assert.equal(validation.valid, true);
    const lead = { ...validation.data, leadId: "lead_int_2", createdAt: new Date().toISOString() };

    const score = scoreLead(lead);
    assert.ok(score.total < 85, `Expected lower score, got ${score.total}`);

    // High-bar buyer rejects low-quality lead
    const buyer = { clientId: "buyer_2", minScore: 80, stateLicenses: "[]" };
    const matchResult = matchClient(buyer, lead, score);
    assert.equal(matchResult.match, false);
  });

  it("aged lead depreciates correctly through tiers", () => {
    const validation = validateLeadPayload(validSubmission());
    assert.equal(validation.valid, true);

    // Day 0: Full exclusive price
    assert.equal(calculatePrice(0, 12000, 3, 500, 1, 6000), 12000);

    // Day 3: Still holding
    assert.equal(calculatePrice(3, 12000, 3, 500, 1, 6000), 12000);

    // Day 5: Dropped 2 steps ($10 drop)
    assert.equal(calculatePrice(5, 12000, 3, 500, 1, 6000), 11000);

    // Day 15: Hit floor
    assert.equal(calculatePrice(15, 12000, 3, 500, 1, 6000), 6000);

    // Day 100: Still at floor
    assert.equal(calculatePrice(100, 12000, 3, 500, 1, 6000), 6000);
  });

  it("invalid submission is rejected before scoring", () => {
    const invalid = validSubmission({ email: "not-an-email", tcpaConsent: false });
    const validation = validateLeadPayload(invalid);
    assert.equal(validation.valid, false);
    assert.ok(validation.errors.length >= 2);
  });

  it("state licensing prevents out-of-state distribution", () => {
    const validation = validateLeadPayload(validSubmission({ state: "CA" }));
    assert.equal(validation.valid, true);
    const lead = { ...validation.data, leadId: "lead_int_3", createdAt: new Date().toISOString() };

    const score = scoreLead(lead);
    const txOnlyBuyer = { clientId: "buyer_3", minScore: 50, stateLicenses: JSON.stringify(["TX"]) };
    const matchResult = matchClient(txOnlyBuyer, lead, score);
    assert.equal(matchResult.match, false);
  });

  it("military lead scores higher than civilian with same coverage", () => {
    const milLead = { ...validSubmission(), leadId: "mil", createdAt: new Date().toISOString() };
    const civLead = {
      ...validSubmission({ veteranStatus: "non-military", militaryBranch: "" }),
      leadId: "civ",
      createdAt: new Date().toISOString(),
    };

    const milValidation = validateLeadPayload(milLead);
    const civValidation = validateLeadPayload(civLead);

    const milScore = scoreLead({ ...milValidation.data, leadId: "mil", createdAt: new Date().toISOString() });
    const civScore = scoreLead({ ...civValidation.data, leadId: "civ", createdAt: new Date().toISOString() });

    assert.ok(milScore.total > civScore.total, `Military (${milScore.total}) should score higher than civilian (${civScore.total})`);
  });

  it("shared lead pricing applies lower base price", () => {
    // Exclusive: $120
    assert.equal(calculatePrice(0, 12000, 3, 500, 1, 6000), 12000);
    // Warm shared: $80
    assert.equal(calculatePrice(0, 8000, 1, 300, 1, 6000), 8000);
    // Cool shared: $60 (no depreciation)
    assert.equal(calculatePrice(0, 6000, 0, 0, 1, 6000), 6000);
  });

  it("full pipeline: validate → score → match multiple buyers → calculate prices", () => {
    const validation = validateLeadPayload(validSubmission());
    assert.equal(validation.valid, true);

    const lead = { ...validation.data, leadId: "lead_full", createdAt: new Date().toISOString() };
    const score = scoreLead(lead);

    const buyers = [
      { clientId: "b1", minScore: 85, stateLicenses: JSON.stringify(["TX"]) },
      { clientId: "b2", minScore: 70, stateLicenses: "[]" },
      { clientId: "b3", minScore: 90, stateLicenses: "[]" },
      { clientId: "b4", minScore: 50, stateLicenses: JSON.stringify(["CA"]) },
    ];

    const matched = buyers.filter(b => matchClient(b, lead, score).match);

    // b1 and b2 should match (score >= their min, licensed in TX or all states)
    // b3 may or may not match depending on score
    // b4 should NOT match (only licensed in CA, lead is TX)
    assert.ok(matched.some(b => b.clientId === "b2"));
    assert.ok(!matched.some(b => b.clientId === "b4"));

    // Price for each matched buyer
    const prices = matched.map(b => ({
      clientId: b.clientId,
      price: calculatePrice(0, 12000, 3, 500, 1, 6000),
    }));

    assert.ok(prices.every(p => p.price === 12000)); // All fresh leads at full price
  });
});
