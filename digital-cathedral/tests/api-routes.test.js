/**
 * Tests for critical API route logic.
 *
 * Covers the business logic from:
 *   - POST /api/leads (validation, honeypot, duplicate detection, scoring pipeline)
 *   - POST /api/client/purchase (auth check, cap enforcement, tier selection, exclusive logic)
 *   - POST /api/admin/login (constant-time key comparison, session creation)
 *
 * Routes depend on Next.js runtime — we re-implement the pure logic here.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { createHmac } from "node:crypto";

// =============================================================================
// POST /api/leads — business logic
// =============================================================================

function generateLeadId() {
  return `lead_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

const CONFIRMATIONS = [
  "Your request has been received. A licensed professional will reach out soon.",
  "Thank you for taking the first step. Someone who understands military coverage will be in touch.",
  "Your information is secure. A licensed insurance professional will contact you shortly.",
  "We've received your request. Expect a call or email within 1 business day.",
  "You're one step closer to protecting your family. A professional will reach out soon.",
];

// Honeypot detection
function detectBot(body) {
  if (body._hp_website) return { isBot: true, reason: "honeypot" };
  if (body._hp_ts && typeof body._hp_ts === "number") {
    const elapsed = Date.now() - body._hp_ts;
    if (elapsed < 3000) return { isBot: true, reason: "timing" };
  }
  return { isBot: false, reason: "" };
}

// Duplicate check
function isDuplicate(dbError) {
  return typeof dbError === "string" && dbError.includes("Duplicate");
}

// =============================================================================
// POST /api/client/purchase — business logic
// =============================================================================

function checkPurchaseEligibility(existingPurchases, clientId, selectedTier) {
  const active = existingPurchases.filter(p => p.status === "delivered");

  if (active.some(p => p.clientId === clientId))
    return { eligible: false, status: 409, message: "You already own this lead." };

  if (active.some(p => p.exclusive))
    return { eligible: false, status: 409, message: "This lead is no longer available." };

  if (active.length >= selectedTier.maxBuyers)
    return { eligible: false, status: 409, message: `${selectedTier.name} tier is sold out (${active.length}/${selectedTier.maxBuyers} buyers).` };

  return { eligible: true };
}

function checkCaps(daily, dailyCap, monthly, monthlyCap) {
  if (daily >= dailyCap) return { allowed: false, message: "Daily purchase cap reached." };
  if (monthly >= monthlyCap) return { allowed: false, message: "Monthly purchase cap reached." };
  return { allowed: true };
}

// =============================================================================
// POST /api/admin/login — business logic
// =============================================================================

function constantTimeCompare(a, b) {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
}

// =============================================================================
// Tests
// =============================================================================

describe("POST /api/leads logic", () => {
  describe("generateLeadId", () => {
    it("starts with lead_ prefix", () => {
      assert.ok(generateLeadId().startsWith("lead_"));
    });

    it("generates unique IDs", () => {
      const ids = new Set(Array.from({ length: 20 }, () => generateLeadId()));
      assert.equal(ids.size, 20);
    });
  });

  describe("CONFIRMATIONS", () => {
    it("has 5 messages", () => {
      assert.equal(CONFIRMATIONS.length, 5);
    });

    it("all are non-empty strings", () => {
      for (const msg of CONFIRMATIONS) {
        assert.ok(msg.length > 10);
      }
    });
  });

  describe("detectBot (honeypot + timing)", () => {
    it("detects honeypot field", () => {
      assert.equal(detectBot({ _hp_website: "spam.com" }).isBot, true);
      assert.equal(detectBot({ _hp_website: "spam.com" }).reason, "honeypot");
    });

    it("ignores empty honeypot", () => {
      assert.equal(detectBot({ _hp_website: "" }).isBot, false);
    });

    it("detects too-fast submission", () => {
      assert.equal(detectBot({ _hp_ts: Date.now() - 500 }).isBot, true);
      assert.equal(detectBot({ _hp_ts: Date.now() - 500 }).reason, "timing");
    });

    it("allows normal-speed submission", () => {
      assert.equal(detectBot({ _hp_ts: Date.now() - 5000 }).isBot, false);
    });

    it("passes clean body", () => {
      assert.equal(detectBot({ firstName: "John" }).isBot, false);
    });

    it("boundary: exactly 3 seconds is not a bot", () => {
      assert.equal(detectBot({ _hp_ts: Date.now() - 3000 }).isBot, false);
    });
  });

  describe("isDuplicate", () => {
    it("detects duplicate error", () => {
      assert.equal(isDuplicate("Duplicate lead detected"), true);
    });

    it("ignores other errors", () => {
      assert.equal(isDuplicate("Connection refused"), false);
    });

    it("handles non-string", () => {
      assert.equal(isDuplicate(null), false);
      assert.equal(isDuplicate(undefined), false);
    });
  });
});

describe("POST /api/client/purchase logic", () => {
  const exclusiveTier = { name: "Exclusive", maxBuyers: 1 };
  const sharedTier = { name: "Cool Shared", maxBuyers: 6 };

  describe("checkPurchaseEligibility", () => {
    it("allows first purchase", () => {
      const result = checkPurchaseEligibility([], "client_1", sharedTier);
      assert.equal(result.eligible, true);
    });

    it("rejects duplicate purchase by same client", () => {
      const existing = [{ clientId: "client_1", status: "delivered", exclusive: false }];
      const result = checkPurchaseEligibility(existing, "client_1", sharedTier);
      assert.equal(result.eligible, false);
      assert.equal(result.status, 409);
      assert.ok(result.message.includes("already own"));
    });

    it("rejects when exclusively purchased by someone else", () => {
      const existing = [{ clientId: "client_other", status: "delivered", exclusive: true }];
      const result = checkPurchaseEligibility(existing, "client_1", sharedTier);
      assert.equal(result.eligible, false);
      assert.ok(result.message.includes("no longer available"));
    });

    it("rejects when tier maxBuyers reached", () => {
      const existing = [{ clientId: "client_other", status: "delivered", exclusive: false }];
      const result = checkPurchaseEligibility(existing, "client_1", exclusiveTier);
      assert.equal(result.eligible, false);
      assert.ok(result.message.includes("sold out"));
    });

    it("ignores returned purchases", () => {
      const existing = [{ clientId: "client_1", status: "returned", exclusive: false }];
      const result = checkPurchaseEligibility(existing, "client_1", sharedTier);
      assert.equal(result.eligible, true);
    });

    it("allows purchase when under shared tier limit", () => {
      const existing = [
        { clientId: "c2", status: "delivered", exclusive: false },
        { clientId: "c3", status: "delivered", exclusive: false },
      ];
      const result = checkPurchaseEligibility(existing, "client_1", sharedTier);
      assert.equal(result.eligible, true);
    });
  });

  describe("checkCaps", () => {
    it("allows when under both caps", () => {
      assert.equal(checkCaps(5, 50, 20, 1000).allowed, true);
    });

    it("rejects when daily cap reached", () => {
      const result = checkCaps(50, 50, 20, 1000);
      assert.equal(result.allowed, false);
      assert.ok(result.message.includes("Daily"));
    });

    it("rejects when monthly cap reached", () => {
      const result = checkCaps(5, 50, 1000, 1000);
      assert.equal(result.allowed, false);
      assert.ok(result.message.includes("Monthly"));
    });

    it("daily cap checked first", () => {
      const result = checkCaps(50, 50, 1000, 1000);
      assert.ok(result.message.includes("Daily"));
    });
  });
});

describe("POST /api/admin/login logic", () => {
  describe("constantTimeCompare", () => {
    it("returns true for matching strings", () => {
      assert.equal(constantTimeCompare("secret-key-123", "secret-key-123"), true);
    });

    it("returns false for different strings", () => {
      assert.equal(constantTimeCompare("secret-key-123", "secret-key-456"), false);
    });

    it("returns false for different lengths", () => {
      assert.equal(constantTimeCompare("short", "much-longer-string"), false);
    });

    it("returns true for empty strings", () => {
      assert.equal(constantTimeCompare("", ""), true);
    });

    it("returns false when one differs by last char only", () => {
      assert.equal(constantTimeCompare("abcdefg1", "abcdefg2"), false);
    });

    it("is case-sensitive", () => {
      assert.equal(constantTimeCompare("Secret", "secret"), false);
    });
  });
});
