/**
 * Tests for app/lib/lead-depreciation.ts — calculateDepreciatedPrice, getLeadBuyerStatus.
 *
 * Re-implements depreciation logic for standalone testing.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement depreciation logic (matching app/lib/lead-depreciation.ts) ---

// Default tiers (matching pricing-config.ts defaults)
const DEFAULT_TIERS = [
  { name: "Exclusive", maxBuyers: 1, basePrice: 12000, holdDays: 3, dropAmount: 500, dropInterval: 1 },
  { name: "Semi-Exclusive", maxBuyers: 2, basePrice: 10000, holdDays: 2, dropAmount: 500, dropInterval: 1 },
  { name: "Warm Shared", maxBuyers: 4, basePrice: 8000, holdDays: 1, dropAmount: 300, dropInterval: 1 },
  { name: "Cool Shared", maxBuyers: 6, basePrice: 6000, holdDays: 0, dropAmount: 0, dropInterval: 1 },
];
const PRICE_FLOOR = 6000;

function calculateDepreciatedPrice(ageInDays, config) {
  if (ageInDays <= config.holdDays) return config.maxPrice;
  const steps = Math.floor((ageInDays - config.holdDays) / config.dropInterval);
  const price = config.maxPrice - config.dropAmount * steps;
  return Math.max(config.floor, price);
}

function getLeadBuyerStatus(activeBuyerCount) {
  const availableTiers = DEFAULT_TIERS.map(tier => ({
    ...tier,
    soldOut: activeBuyerCount >= tier.maxBuyers,
  }));

  const currentTier = DEFAULT_TIERS.find(t => activeBuyerCount < t.maxBuyers) || DEFAULT_TIERS[DEFAULT_TIERS.length - 1];
  const soldOut = activeBuyerCount >= DEFAULT_TIERS[DEFAULT_TIERS.length - 1].maxBuyers;

  return { currentTier, soldOut, availableTiers };
}

// --- Tests ---

describe("calculateDepreciatedPrice", () => {
  const exclusiveConfig = { maxPrice: 12000, holdDays: 3, dropAmount: 500, dropInterval: 1, floor: 6000 };

  it("returns full price during hold period", () => {
    assert.equal(calculateDepreciatedPrice(0, exclusiveConfig), 12000);
    assert.equal(calculateDepreciatedPrice(1, exclusiveConfig), 12000);
    assert.equal(calculateDepreciatedPrice(3, exclusiveConfig), 12000);
  });

  it("drops price after hold period", () => {
    assert.equal(calculateDepreciatedPrice(4, exclusiveConfig), 11500); // 1 step
    assert.equal(calculateDepreciatedPrice(5, exclusiveConfig), 11000); // 2 steps
    assert.equal(calculateDepreciatedPrice(6, exclusiveConfig), 10500); // 3 steps
  });

  it("never drops below floor", () => {
    assert.equal(calculateDepreciatedPrice(100, exclusiveConfig), 6000);
    assert.equal(calculateDepreciatedPrice(999, exclusiveConfig), 6000);
  });

  it("reaches floor at the correct step", () => {
    // 12000 - 500*12 = 6000, so floor reached at holdDays + 12 = 15 days
    assert.equal(calculateDepreciatedPrice(15, exclusiveConfig), 6000);
    // One step before floor
    assert.equal(calculateDepreciatedPrice(14, exclusiveConfig), 6500);
  });

  it("handles zero hold days (Cool Shared)", () => {
    const coolConfig = { maxPrice: 6000, holdDays: 0, dropAmount: 0, dropInterval: 1, floor: 6000 };
    assert.equal(calculateDepreciatedPrice(0, coolConfig), 6000);
    assert.equal(calculateDepreciatedPrice(30, coolConfig), 6000); // No depreciation
  });

  it("handles semi-exclusive depreciation", () => {
    const semiConfig = { maxPrice: 10000, holdDays: 2, dropAmount: 500, dropInterval: 1, floor: 6000 };
    assert.equal(calculateDepreciatedPrice(2, semiConfig), 10000); // Still holding
    assert.equal(calculateDepreciatedPrice(3, semiConfig), 9500);  // 1 step
    assert.equal(calculateDepreciatedPrice(4, semiConfig), 9000);  // 2 steps
  });

  it("handles warm shared depreciation", () => {
    const warmConfig = { maxPrice: 8000, holdDays: 1, dropAmount: 300, dropInterval: 1, floor: 6000 };
    assert.equal(calculateDepreciatedPrice(1, warmConfig), 8000);
    assert.equal(calculateDepreciatedPrice(2, warmConfig), 7700);
    assert.equal(calculateDepreciatedPrice(3, warmConfig), 7400);
  });

  it("handles fractional days (floor operation)", () => {
    // 3.5 days: holdDays=3, so steps = floor(0.5/1) = 0 → full price
    assert.equal(calculateDepreciatedPrice(3.5, exclusiveConfig), 12000);
    // 4.9 days: steps = floor(1.9/1) = 1 → 11500
    assert.equal(calculateDepreciatedPrice(4.9, exclusiveConfig), 11500);
  });
});

describe("getLeadBuyerStatus", () => {
  it("returns exclusive tier for 0 buyers", () => {
    const status = getLeadBuyerStatus(0);
    assert.equal(status.currentTier.name, "Exclusive");
    assert.equal(status.soldOut, false);
  });

  it("returns semi-exclusive tier for 1 buyer", () => {
    const status = getLeadBuyerStatus(1);
    assert.equal(status.currentTier.name, "Semi-Exclusive");
    assert.equal(status.soldOut, false);
  });

  it("returns warm shared for 2-3 buyers", () => {
    assert.equal(getLeadBuyerStatus(2).currentTier.name, "Warm Shared");
    assert.equal(getLeadBuyerStatus(3).currentTier.name, "Warm Shared");
  });

  it("returns cool shared for 4-5 buyers", () => {
    assert.equal(getLeadBuyerStatus(4).currentTier.name, "Cool Shared");
    assert.equal(getLeadBuyerStatus(5).currentTier.name, "Cool Shared");
  });

  it("marks soldOut when max buyers reached", () => {
    const status = getLeadBuyerStatus(6);
    assert.equal(status.soldOut, true);
  });

  it("returns correct availableTiers with soldOut flags", () => {
    const status = getLeadBuyerStatus(3);
    assert.equal(status.availableTiers[0].soldOut, true);  // Exclusive (maxBuyers: 1)
    assert.equal(status.availableTiers[1].soldOut, true);  // Semi-Exclusive (maxBuyers: 2)
    assert.equal(status.availableTiers[2].soldOut, false); // Warm Shared (maxBuyers: 4)
    assert.equal(status.availableTiers[3].soldOut, false); // Cool Shared (maxBuyers: 6)
  });

  it("has 4 tiers", () => {
    const status = getLeadBuyerStatus(0);
    assert.equal(status.availableTiers.length, 4);
  });
});
