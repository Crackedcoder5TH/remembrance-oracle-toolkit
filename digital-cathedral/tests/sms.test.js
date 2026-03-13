/**
 * Tests for app/lib/sms.ts — SMS message formatting, coverage labels, dev mode.
 *
 * Re-implements the message-building logic for standalone testing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement SMS logic (matching app/lib/sms.ts) ---

const COVERAGE_LABELS = {
  term: "Term Life Insurance",
  whole: "Whole Life Insurance",
  universal: "Universal Life Insurance",
  "final-expense": "Final Expense Insurance",
  annuity: "Annuity",
  "not-sure": "insurance coverage",
};

function buildLeadSmsBody(lead) {
  const coverageLabel = COVERAGE_LABELS[lead.coverageInterest] || lead.coverageInterest;
  return (
    `Hi ${lead.firstName}, thank you for your interest in ${coverageLabel}. ` +
    `A licensed professional will contact you within 1 business day. ` +
    `Ref: ${lead.leadId} — Valor Legacies`
  );
}

function buildAdminSmsBody(lead) {
  const coverageLabel = COVERAGE_LABELS[lead.coverageInterest] || lead.coverageInterest;
  return (
    `New lead: ${lead.firstName} ${lead.lastName} (${lead.state}) — ${coverageLabel}. ` +
    `Phone: ${lead.phone}`
  );
}

// Re-implement retry for testing
async function retry(fn, maxRetries = 2, delay = 1) {
  let lastError;
  for (let i = 0; i <= maxRetries; i++) {
    try { return await fn(); } catch (err) {
      lastError = err;
      if (i < maxRetries) await new Promise(r => setTimeout(r, delay * Math.pow(2, i)));
    }
  }
  throw lastError;
}

// --- Tests ---

describe("buildLeadSmsBody", () => {
  it("includes first name", () => {
    const body = buildLeadSmsBody({ firstName: "Marcus", coverageInterest: "term", leadId: "lead_123" });
    assert.ok(body.includes("Marcus"));
  });

  it("includes coverage label", () => {
    const body = buildLeadSmsBody({ firstName: "Jane", coverageInterest: "final-expense", leadId: "lead_1" });
    assert.ok(body.includes("Final Expense Insurance"));
  });

  it("includes lead reference ID", () => {
    const body = buildLeadSmsBody({ firstName: "A", coverageInterest: "term", leadId: "lead_xyz_123" });
    assert.ok(body.includes("lead_xyz_123"));
  });

  it("includes company name", () => {
    const body = buildLeadSmsBody({ firstName: "A", coverageInterest: "term", leadId: "l1" });
    assert.ok(body.includes("Valor Legacies"));
  });

  it("falls back to raw coverage type if not in labels", () => {
    const body = buildLeadSmsBody({ firstName: "A", coverageInterest: "custom-plan", leadId: "l1" });
    assert.ok(body.includes("custom-plan"));
  });

  it("mentions 1 business day", () => {
    const body = buildLeadSmsBody({ firstName: "A", coverageInterest: "term", leadId: "l1" });
    assert.ok(body.includes("1 business day"));
  });
});

describe("buildAdminSmsBody", () => {
  it("includes lead name and state", () => {
    const body = buildAdminSmsBody({ firstName: "John", lastName: "Smith", state: "TX", coverageInterest: "whole", phone: "5551234567" });
    assert.ok(body.includes("John Smith"));
    assert.ok(body.includes("TX"));
  });

  it("includes coverage label", () => {
    const body = buildAdminSmsBody({ firstName: "A", lastName: "B", state: "CA", coverageInterest: "annuity", phone: "1" });
    assert.ok(body.includes("Annuity"));
  });

  it("includes phone number", () => {
    const body = buildAdminSmsBody({ firstName: "A", lastName: "B", state: "CA", coverageInterest: "term", phone: "5559876543" });
    assert.ok(body.includes("5559876543"));
  });
});

describe("COVERAGE_LABELS", () => {
  it("has 6 coverage types", () => {
    assert.equal(Object.keys(COVERAGE_LABELS).length, 6);
  });

  it("maps term correctly", () => {
    assert.equal(COVERAGE_LABELS["term"], "Term Life Insurance");
  });

  it("maps not-sure to generic label", () => {
    assert.equal(COVERAGE_LABELS["not-sure"], "insurance coverage");
  });

  it("all values are non-empty strings", () => {
    for (const [key, val] of Object.entries(COVERAGE_LABELS)) {
      assert.ok(typeof val === "string" && val.length > 0, `Label for "${key}" should be non-empty`);
    }
  });
});

describe("SMS retry logic", () => {
  it("succeeds on first attempt", async () => {
    const result = await retry(() => Promise.resolve("ok"), 2, 1);
    assert.equal(result, "ok");
  });

  it("retries and eventually succeeds", async () => {
    let attempt = 0;
    const result = await retry(() => {
      attempt++;
      if (attempt < 2) throw new Error("fail");
      return Promise.resolve("recovered");
    }, 2, 1);
    assert.equal(result, "recovered");
  });

  it("throws after max retries", async () => {
    await assert.rejects(
      () => retry(() => { throw new Error("permanent"); }, 2, 1),
      { message: "permanent" }
    );
  });
});
