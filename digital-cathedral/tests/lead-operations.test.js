// @oracle-infrastructure — test harness — its functions are test cases, not substrate periodic-table elements; no writes, pure logic
/**
 * Tests for app/lib/lead-operations.ts — the operations-update derivation.
 *
 * Mirrors deriveOpsMutation() (the pure function shared by the relational and
 * substrate persistence paths) for standalone testing under `node --test`,
 * matching the convention of the other cathedral tests (see csrf.test.js). If
 * the source contract changes, update this mirror in lockstep.
 *
 * Locks the behavior that two bugs were fixed against:
 *   - eventType is allow-listed (arbitrary strings never reach the activity log)
 *   - a non-string eventType is ignored, not passed to .replaceAll (no 500)
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

const AGENT_EVENT_TYPES = ["call_clicked", "text_clicked", "email_clicked"];

// --- mirror of deriveOpsMutation(update, actorRole) ---
function deriveOpsMutation(update, actorRole) {
  const status = update.status;
  const doNotContact = status === "Do Not Contact";
  const dispute = status === "Bad Lead / Dispute Requested" ? "requested" : null;
  const events = [];
  if (status) events.push(["status_changed", `Status changed to ${status}`]);
  if (update.nextFollowUpAt !== undefined) events.push(["follow_up_set", update.nextFollowUpAt ? "Follow-up scheduled" : "Follow-up cleared"]);
  if (update.appointmentAt !== undefined) events.push(["appointment_set", update.appointmentAt ? "Appointment scheduled or updated" : "Appointment canceled"]);
  if (update.contacted) events.push(["contacted", "Lead marked contacted"]);
  if (update.note?.trim()) events.push(["note_added", actorRole === "admin" ? "Admin note added" : "Agent note added"]);
  if (update.eventType && AGENT_EVENT_TYPES.includes(update.eventType)) events.push([update.eventType, update.eventType.replaceAll("_", " ")]);
  return { status, doNotContact, dispute, events };
}
const types = (m) => m.events.map((e) => e[0]);

describe("deriveOpsMutation — status flags", () => {
  it("sets doNotContact only for the Do Not Contact status", () => {
    assert.equal(deriveOpsMutation({ status: "Do Not Contact" }, "agent").doNotContact, true);
    assert.equal(deriveOpsMutation({ status: "Contacted" }, "agent").doNotContact, false);
    assert.equal(deriveOpsMutation({}, "agent").doNotContact, false);
  });
  it("raises a dispute only for the dispute status", () => {
    assert.equal(deriveOpsMutation({ status: "Bad Lead / Dispute Requested" }, "agent").dispute, "requested");
    assert.equal(deriveOpsMutation({ status: "Won" }, "agent").dispute, null);
  });
});

describe("deriveOpsMutation — event emission", () => {
  it("emits a status_changed event when status is set", () => {
    assert.deepEqual(types(deriveOpsMutation({ status: "Contacted" }, "agent")), ["status_changed"]);
  });
  it("distinguishes set vs cleared for follow-up and appointment", () => {
    assert.ok(deriveOpsMutation({ nextFollowUpAt: "2026-01-01T00:00:00Z" }, "agent").events[0][1].includes("scheduled"));
    assert.ok(deriveOpsMutation({ nextFollowUpAt: null }, "agent").events[0][1].includes("cleared"));
    assert.ok(deriveOpsMutation({ appointmentAt: null }, "agent").events[0][1].includes("canceled"));
  });
  it("labels notes by actor role", () => {
    assert.ok(deriveOpsMutation({ note: "hi" }, "admin").events.some((e) => e[1] === "Admin note added"));
    assert.ok(deriveOpsMutation({ note: "hi" }, "agent").events.some((e) => e[1] === "Agent note added"));
  });
  it("ignores a blank note", () => {
    assert.equal(types(deriveOpsMutation({ note: "   " }, "agent")).length, 0);
  });
});

describe("deriveOpsMutation — eventType hardening (regression)", () => {
  it("records each allow-listed event with a humanized label", () => {
    for (const et of AGENT_EVENT_TYPES) {
      const m = deriveOpsMutation({ eventType: et }, "agent");
      assert.deepEqual(m.events, [[et, et.replaceAll("_", " ")]]);
    }
  });
  it("ignores an eventType that is not allow-listed", () => {
    assert.equal(types(deriveOpsMutation({ eventType: "drop_table" }, "agent")).length, 0);
  });
  it("ignores a non-string eventType instead of crashing on .replaceAll", () => {
    assert.doesNotThrow(() => deriveOpsMutation({ eventType: 123 }, "agent"));
    assert.equal(types(deriveOpsMutation({ eventType: 123 }, "agent")).length, 0);
    assert.doesNotThrow(() => deriveOpsMutation({ eventType: { evil: true } }, "agent"));
  });
});

describe("deriveOpsMutation — combined update", () => {
  it("emits one event per changed field, in order", () => {
    const m = deriveOpsMutation(
      { status: "Contacted", nextFollowUpAt: "2026-02-01T00:00:00Z", contacted: true, note: "called", eventType: "call_clicked" },
      "agent",
    );
    assert.deepEqual(types(m), ["status_changed", "follow_up_set", "contacted", "note_added", "call_clicked"]);
  });
});
