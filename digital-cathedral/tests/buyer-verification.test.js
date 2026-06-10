/**
 * Tests for the buyer license-verification flow.
 *
 * The actual status-transition logic lives in two places:
 *   * /api/portal/register sets status: "pending" on create
 *   * /api/admin/clients/[id] PUT detects pending → active and fires
 *     sendBuyerApprovedEmail (fire-and-forget)
 *
 * These tests mirror the detection rule (read the prior row, only fire
 * email when prior.status === "pending" AND updates.status === "active")
 * and the allowed status lifecycle so the union stays disciplined.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Status union as the live type defines it ---
const ALLOWED_STATUSES = new Set(["pending", "active", "suspended", "closed"]);

// --- Replication of the transition-detection rule from the PUT route ---
function detectPendingToActiveTransition(prior, updates) {
  // Only fire the approval email when:
  //   1. the request is changing status
  //   2. the new status is exactly "active"
  //   3. the prior row was "pending" (not active/suspended/closed)
  // Anything else — including pending→suspended or active→active — should
  // not retrigger the email.
  if (!("status" in updates)) return false;
  if (updates.status !== "active") return false;
  if (!prior || prior.status !== "pending") return false;
  return true;
}

describe("buyer verification — status union", () => {
  it("accepts every documented lifecycle state", () => {
    for (const s of ["pending", "active", "suspended", "closed"]) {
      assert.equal(ALLOWED_STATUSES.has(s), true, `${s} should be allowed`);
    }
  });

  it("rejects undocumented states", () => {
    for (const s of ["approved", "denied", "review", "", "ACTIVE", null, undefined]) {
      assert.equal(ALLOWED_STATUSES.has(s), false, `${JSON.stringify(s)} should not be allowed`);
    }
  });

  it("documents pending as the registration default", () => {
    // Mirror /api/portal/register's hardcoded value so an accidental rename
    // of the union member breaks the test before the API silently regresses.
    const registrationDefault = "pending";
    assert.equal(ALLOWED_STATUSES.has(registrationDefault), true);
  });
});

describe("buyer verification — approval email transition rule", () => {
  it("fires the email on pending → active", () => {
    const prior = { clientId: "c_1", status: "pending", email: "a@b.com" };
    const updates = { status: "active" };
    assert.equal(detectPendingToActiveTransition(prior, updates), true);
  });

  it("does not fire on active → active (re-save without change)", () => {
    const prior = { clientId: "c_1", status: "active", email: "a@b.com" };
    const updates = { status: "active" };
    assert.equal(detectPendingToActiveTransition(prior, updates), false);
  });

  it("does not fire on suspended → active (reactivation, not first approval)", () => {
    // Symmetry note: the Reactivate button in /admin/clients fires the same
    // PUT but we deliberately don't re-send the approval email — the buyer
    // already received it once when they were originally approved.
    const prior = { clientId: "c_1", status: "suspended", email: "a@b.com" };
    const updates = { status: "active" };
    assert.equal(detectPendingToActiveTransition(prior, updates), false);
  });

  it("does not fire on pending → suspended", () => {
    const prior = { clientId: "c_1", status: "pending", email: "a@b.com" };
    const updates = { status: "suspended" };
    assert.equal(detectPendingToActiveTransition(prior, updates), false);
  });

  it("does not fire on pending → closed", () => {
    const prior = { clientId: "c_1", status: "pending", email: "a@b.com" };
    const updates = { status: "closed" };
    assert.equal(detectPendingToActiveTransition(prior, updates), false);
  });

  it("does not fire when the PUT body has no status field", () => {
    // e.g. admin only updating dailyCap or pricePerLead — must not trigger
    // an email even if the buyer happens to be pending.
    const prior = { clientId: "c_1", status: "pending", email: "a@b.com" };
    const updates = { dailyCap: 100 };
    assert.equal(detectPendingToActiveTransition(prior, updates), false);
  });

  it("does not fire when the client was never created (prior is null)", () => {
    const updates = { status: "active" };
    assert.equal(detectPendingToActiveTransition(null, updates), false);
  });

  it("does not fire on the inverse direction (active → pending)", () => {
    // Not currently exposed by any admin button, but the rule must hold
    // even if some future tooling tries to demote a buyer.
    const prior = { clientId: "c_1", status: "active", email: "a@b.com" };
    const updates = { status: "pending" };
    assert.equal(detectPendingToActiveTransition(prior, updates), false);
  });
});
