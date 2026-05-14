/**
 * Tests for database Result type pattern and row mapper logic.
 *
 * Covers: Ok/Err constructors, rowToLead mapper, LeadRecord shape.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement Result type (matching app/lib/database.ts) ---

function Ok(value) {
  return { ok: true, value };
}

function Err(error) {
  return { ok: false, error };
}

// --- Re-implement row mapper (matching app/lib/database.ts) ---

function rowToLead(row) {
  return {
    leadId: row.lead_id,
    firstName: row.first_name,
    lastName: row.last_name,
    dateOfBirth: row.date_of_birth || "",
    email: row.email,
    phone: row.phone,
    state: row.state,
    coverageInterest: row.coverage_interest,
    purchaseIntent: row.purchase_intent || "",
    veteranStatus: row.veteran_status,
    militaryBranch: row.military_branch || "",
    consentTcpa: Boolean(row.consent_tcpa),
    consentPrivacy: Boolean(row.consent_privacy),
    consentTimestamp: row.consent_timestamp || "",
    consentText: row.consent_text || "",
    consentIp: row.consent_ip || "",
    consentUserAgent: row.consent_user_agent || "",
    consentPageUrl: row.consent_page_url || "",
    utmSource: row.utm_source || null,
    utmMedium: row.utm_medium || null,
    utmCampaign: row.utm_campaign || null,
    utmTerm: row.utm_term || null,
    utmContent: row.utm_content || null,
    createdAt: row.created_at || "",
  };
}

// --- Duplicate detection logic ---

function isDuplicate(existingLeads, newEmail, newPhone, windowMs = 24 * 60 * 60 * 1000) {
  const now = Date.now();
  return existingLeads.some(lead => {
    const age = now - new Date(lead.createdAt).getTime();
    return age < windowMs &&
           lead.email === newEmail &&
           lead.phone === newPhone;
  });
}

// --- Tests ---

describe("Result type", () => {
  it("Ok wraps a value", () => {
    const result = Ok(42);
    assert.equal(result.ok, true);
    assert.equal(result.value, 42);
  });

  it("Err wraps an error", () => {
    const result = Err("something went wrong");
    assert.equal(result.ok, false);
    assert.equal(result.error, "something went wrong");
  });

  it("Ok and Err are distinguishable via ok field", () => {
    const success = Ok("data");
    const failure = Err("error");
    assert.equal(success.ok, true);
    assert.equal(failure.ok, false);
  });

  it("Ok can wrap complex objects", () => {
    const result = Ok({ id: 1, leadId: "lead_123" });
    assert.deepEqual(result.value, { id: 1, leadId: "lead_123" });
  });

  it("Err can wrap Error objects", () => {
    const result = Err(new Error("db error"));
    assert.ok(result.error instanceof Error);
    assert.equal(result.error.message, "db error");
  });
});

describe("rowToLead", () => {
  it("maps snake_case DB row to camelCase LeadRecord", () => {
    const row = {
      lead_id: "lead_abc",
      first_name: "John",
      last_name: "Smith",
      date_of_birth: "1990-06-15",
      email: "john@test.com",
      phone: "5551234567",
      state: "TX",
      coverage_interest: "mortgage-protection",
      purchase_intent: "protect-family",
      veteran_status: "veteran",
      military_branch: "army",
      consent_tcpa: 1,
      consent_privacy: 1,
      consent_timestamp: "2026-03-12T00:00:00Z",
      consent_text: "I consent",
      consent_ip: "1.2.3.4",
      consent_user_agent: "Mozilla/5.0",
      consent_page_url: "/",
      utm_source: "google",
      utm_medium: "cpc",
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
      created_at: "2026-03-12T10:00:00Z",
    };

    const lead = rowToLead(row);
    assert.equal(lead.leadId, "lead_abc");
    assert.equal(lead.firstName, "John");
    assert.equal(lead.lastName, "Smith");
    assert.equal(lead.dateOfBirth, "1990-06-15");
    assert.equal(lead.email, "john@test.com");
    assert.equal(lead.state, "TX");
    assert.equal(lead.coverageInterest, "mortgage-protection");
    assert.equal(lead.veteranStatus, "veteran");
    assert.equal(lead.consentTcpa, true);
    assert.equal(lead.consentPrivacy, true);
    assert.equal(lead.utmSource, "google");
    assert.equal(lead.utmCampaign, null);
  });

  it("handles missing/null optional fields", () => {
    const row = {
      lead_id: "lead_1",
      first_name: "Jane",
      last_name: "Doe",
      date_of_birth: null,
      email: "jane@test.com",
      phone: "5559876543",
      state: "CA",
      coverage_interest: "final-expense",
      purchase_intent: null,
      veteran_status: "non-military",
      military_branch: null,
      consent_tcpa: 0,
      consent_privacy: 0,
      consent_timestamp: null,
      consent_text: null,
      consent_ip: null,
      consent_user_agent: null,
      consent_page_url: null,
      utm_source: null,
      utm_medium: null,
      utm_campaign: null,
      utm_term: null,
      utm_content: null,
      created_at: null,
    };

    const lead = rowToLead(row);
    assert.equal(lead.dateOfBirth, "");
    assert.equal(lead.purchaseIntent, "");
    assert.equal(lead.militaryBranch, "");
    assert.equal(lead.consentTcpa, false);
    assert.equal(lead.utmSource, null);
    assert.equal(lead.createdAt, "");
  });

  it("boolean coerces consent fields correctly", () => {
    const withConsent = rowToLead({ lead_id: "x", first_name: "A", last_name: "B", email: "a@b.com", phone: "1", state: "TX", coverage_interest: "term", veteran_status: "veteran", consent_tcpa: 1, consent_privacy: true });
    assert.equal(withConsent.consentTcpa, true);
    assert.equal(withConsent.consentPrivacy, true);

    const without = rowToLead({ lead_id: "x", first_name: "A", last_name: "B", email: "a@b.com", phone: "1", state: "TX", coverage_interest: "term", veteran_status: "veteran", consent_tcpa: 0, consent_privacy: false });
    assert.equal(without.consentTcpa, false);
    assert.equal(without.consentPrivacy, false);
  });
});

describe("Duplicate detection", () => {
  it("detects duplicate within 24-hour window", () => {
    const existing = [{
      email: "john@test.com",
      phone: "5551234567",
      createdAt: new Date().toISOString(),
    }];
    assert.equal(isDuplicate(existing, "john@test.com", "5551234567"), true);
  });

  it("does not flag when email differs", () => {
    const existing = [{
      email: "john@test.com",
      phone: "5551234567",
      createdAt: new Date().toISOString(),
    }];
    assert.equal(isDuplicate(existing, "jane@test.com", "5551234567"), false);
  });

  it("does not flag when phone differs", () => {
    const existing = [{
      email: "john@test.com",
      phone: "5551234567",
      createdAt: new Date().toISOString(),
    }];
    assert.equal(isDuplicate(existing, "john@test.com", "9999999999"), false);
  });

  it("does not flag leads older than 24 hours", () => {
    const existing = [{
      email: "john@test.com",
      phone: "5551234567",
      createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000).toISOString(),
    }];
    assert.equal(isDuplicate(existing, "john@test.com", "5551234567"), false);
  });

  it("handles empty existing leads", () => {
    assert.equal(isDuplicate([], "john@test.com", "5551234567"), false);
  });
});
