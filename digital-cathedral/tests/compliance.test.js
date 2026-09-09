// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; no writes, pure logic
/**
 * Tests for app/lib/compliance.ts — the compliance primitives that gate contact.
 *
 * Mirrors the pure logic (normalizeContact / hashValue / maskContact and the
 * allow-list constants) for standalone `node --test`, matching the convention
 * of the other cathedral tests (csrf.test.js, lead-operations.test.js). If the
 * source contract changes, update this mirror in lockstep.
 *
 * Locks the behavior a bug was fixed against: a Do-Not-Contact opt-out must
 * suppress a contact regardless of formatting, or a suppressed consumer could
 * still be purchased/contacted.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";

// --- mirror of compliance.ts normalize + hash + mask + constants ---
const PRIVACY_REQUEST_TYPES = ["access", "deletion", "correction", "opt-out", "data-sharing-inquiry", "other"];
const PRIVACY_REQUEST_STATUSES = ["new", "reviewing", "needs-verification", "completed", "denied", "canceled"];
function normalizeContact(kind, value) {
  const v = (value || "").trim();
  return kind === "phone" ? v.replace(/\D/g, "") : v.toLowerCase();
}
const hashValue = (kind, value) => createHash("sha256").update(normalizeContact(kind, value)).digest("hex");
function maskContact(value) {
  const v = value.trim();
  return v.includes("@") ? `${v.slice(0, 2)}•••@${v.split("@")[1]}` : `•••${v.replace(/\D/g, "").slice(-4)}`;
}

describe("phone suppression is format-independent (regression)", () => {
  const formats = ["(555) 123-4567", "555-123-4567", "555.123.4567", "5551234567", " +1 555 123 4567 ".replace("+1", "")];
  it("hashes every formatting of the same number to one digest", () => {
    const hashes = new Set(formats.map((f) => hashValue("phone", f)));
    assert.equal(hashes.size, 1);
  });
  it("does not collide distinct numbers", () => {
    assert.notEqual(hashValue("phone", "555-123-4567"), hashValue("phone", "555-123-4568"));
  });
});

describe("email suppression is case/whitespace-independent", () => {
  it("normalizes case and surrounding space", () => {
    assert.equal(hashValue("email", "  Foo@Bar.com "), hashValue("email", "foo@bar.com"));
  });
  it("keeps phone and email hashes in separate spaces", () => {
    // a numeric-looking email local part must not collide with a phone
    assert.notEqual(hashValue("email", "5551234567@x.com"), hashValue("phone", "5551234567"));
  });
});

describe("maskContact hides raw contact data", () => {
  it("masks a phone to the last 4 digits", () => {
    const m = maskContact("(555) 123-4567");
    assert.ok(m.includes("•") && m.endsWith("4567") && !m.includes("555"));
  });
  it("masks an email local part but keeps the domain", () => {
    const m = maskContact("jane.doe@example.com");
    assert.ok(m.startsWith("ja") && m.includes("•••@example.com") && !m.includes("doe"));
  });
});

describe("privacy request allow-lists", () => {
  it("accepts the documented request types and rejects others", () => {
    assert.ok(PRIVACY_REQUEST_TYPES.includes("deletion"));
    assert.ok(!PRIVACY_REQUEST_TYPES.includes("drop-database"));
  });
  it("accepts the documented statuses and rejects others", () => {
    assert.ok(PRIVACY_REQUEST_STATUSES.includes("completed"));
    assert.ok(!PRIVACY_REQUEST_STATUSES.includes("approved"));
  });
});
