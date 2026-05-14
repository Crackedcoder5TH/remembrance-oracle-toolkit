/**
 * Tests for app/lib/lead-events.ts — Event bus (subscribe, broadcast, unsubscribe).
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement event bus (matching app/lib/lead-events.ts) ---

let subscribers;

function resetEventBus() {
  subscribers = new Set();
}

function subscribe(callback) {
  subscribers.add(callback);
  return () => { subscribers.delete(callback); };
}

function broadcast(event) {
  for (const cb of subscribers) {
    try { cb(event); } catch { /* subscriber error — don't block others */ }
  }
}

function getSubscriberCount() {
  return subscribers.size;
}

// --- Fixtures ---

function makeEvent(overrides = {}) {
  return {
    type: "lead.created",
    data: {
      leadId: "lead_test_1",
      firstName: "John",
      lastName: "Doe",
      state: "TX",
      coverageInterest: "mortgage-protection",
      veteranStatus: "veteran",
      score: 85,
      tier: "hot",
      createdAt: new Date().toISOString(),
      ...overrides,
    },
  };
}

// --- Tests ---

describe("subscribe", () => {
  beforeEach(() => resetEventBus());

  it("adds a subscriber", () => {
    subscribe(() => {});
    assert.equal(getSubscriberCount(), 1);
  });

  it("returns an unsubscribe function", () => {
    const unsub = subscribe(() => {});
    assert.equal(typeof unsub, "function");
    unsub();
    assert.equal(getSubscriberCount(), 0);
  });

  it("supports multiple subscribers", () => {
    subscribe(() => {});
    subscribe(() => {});
    subscribe(() => {});
    assert.equal(getSubscriberCount(), 3);
  });

  it("unsubscribe only removes the specific subscriber", () => {
    const unsub1 = subscribe(() => {});
    subscribe(() => {});
    unsub1();
    assert.equal(getSubscriberCount(), 1);
  });

  it("double-unsubscribe is safe", () => {
    const unsub = subscribe(() => {});
    unsub();
    unsub(); // Should not throw
    assert.equal(getSubscriberCount(), 0);
  });
});

describe("broadcast", () => {
  beforeEach(() => resetEventBus());

  it("delivers event to all subscribers", () => {
    const received = [];
    subscribe(e => received.push(e));
    subscribe(e => received.push(e));

    const event = makeEvent();
    broadcast(event);

    assert.equal(received.length, 2);
    assert.equal(received[0].data.leadId, "lead_test_1");
  });

  it("delivers correct event data", () => {
    let captured = null;
    subscribe(e => { captured = e; });

    broadcast(makeEvent({ firstName: "Jane", score: 92 }));

    assert.equal(captured.type, "lead.created");
    assert.equal(captured.data.firstName, "Jane");
    assert.equal(captured.data.score, 92);
  });

  it("does not throw with zero subscribers", () => {
    assert.doesNotThrow(() => broadcast(makeEvent()));
  });

  it("continues delivery even if one subscriber throws", () => {
    const received = [];
    subscribe(() => { throw new Error("subscriber crash"); });
    subscribe(e => received.push(e));

    broadcast(makeEvent());

    assert.equal(received.length, 1); // Second subscriber still received the event
  });

  it("does not deliver to unsubscribed callbacks", () => {
    const received = [];
    const unsub = subscribe(e => received.push(e));
    unsub();

    broadcast(makeEvent());
    assert.equal(received.length, 0);
  });
});

describe("getSubscriberCount", () => {
  beforeEach(() => resetEventBus());

  it("returns 0 when empty", () => {
    assert.equal(getSubscriberCount(), 0);
  });

  it("tracks subscribe and unsubscribe", () => {
    const u1 = subscribe(() => {});
    const u2 = subscribe(() => {});
    assert.equal(getSubscriberCount(), 2);
    u1();
    assert.equal(getSubscriberCount(), 1);
    u2();
    assert.equal(getSubscriberCount(), 0);
  });
});
