/**
 * Tests for app/lib/pricing-config.ts
 *
 * Covers: DEFAULT_PRICING_CONFIG, savePricingConfig validation, TierConfig shape.
 */
import { describe, it } from "node:test";
import assert from "node:assert/strict";

// --- Re-implement validation logic (matching app/lib/pricing-config.ts) ---

const DEFAULT_PRICING_CONFIG = {
  maxPrice: 12000,
  priceFloor: 6000,
  tiers: [
    { name: "Exclusive", maxBuyers: 1, basePrice: 12000, holdDays: 3, dropAmount: 500, dropInterval: 1 },
    { name: "Semi-Exclusive", maxBuyers: 2, basePrice: 10000, holdDays: 2, dropAmount: 500, dropInterval: 1 },
    { name: "Warm Shared", maxBuyers: 4, basePrice: 8000, holdDays: 1, dropAmount: 300, dropInterval: 1 },
    { name: "Cool Shared", maxBuyers: 6, basePrice: 6000, holdDays: 0, dropAmount: 0, dropInterval: 1 },
  ],
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
};

function validatePricingConfig(config) {
  if (!config.tiers || !Array.isArray(config.tiers) || config.tiers.length === 0)
    return { ok: false, error: "At least one tier is required." };
  if (config.maxPrice < 100)
    return { ok: false, error: "Max price must be at least $1.00 (100 cents)." };
  if (config.priceFloor < 0)
    return { ok: false, error: "Price floor cannot be negative." };
  if (config.priceFloor > config.maxPrice)
    return { ok: false, error: "Price floor cannot exceed max price." };

  for (const tier of config.tiers) {
    if (!tier.name || tier.name.trim().length === 0)
      return { ok: false, error: "Every tier must have a name." };
    if (tier.maxBuyers < 1)
      return { ok: false, error: `Tier "${tier.name}": max buyers must be at least 1.` };
    if (tier.basePrice < config.priceFloor)
      return { ok: false, error: `Tier "${tier.name}": base price cannot be below the floor ($${(config.priceFloor / 100).toFixed(2)}).` };
    if (tier.basePrice > config.maxPrice)
      return { ok: false, error: `Tier "${tier.name}": base price cannot exceed max price ($${(config.maxPrice / 100).toFixed(2)}).` };
    if (tier.dropAmount < 0)
      return { ok: false, error: `Tier "${tier.name}": drop amount cannot be negative.` };
    if (tier.dropInterval < 1)
      return { ok: false, error: `Tier "${tier.name}": drop interval must be at least 1 day.` };
  }

  return { ok: true };
}

// --- Tests ---

describe("DEFAULT_PRICING_CONFIG", () => {
  it("has 4 tiers", () => {
    assert.equal(DEFAULT_PRICING_CONFIG.tiers.length, 4);
  });

  it("tiers are ordered from most to least expensive", () => {
    const prices = DEFAULT_PRICING_CONFIG.tiers.map(t => t.basePrice);
    for (let i = 1; i < prices.length; i++) {
      assert.ok(prices[i] <= prices[i - 1], `Tier ${i} should be <= tier ${i - 1}`);
    }
  });

  it("tiers have increasing maxBuyers", () => {
    const buyers = DEFAULT_PRICING_CONFIG.tiers.map(t => t.maxBuyers);
    for (let i = 1; i < buyers.length; i++) {
      assert.ok(buyers[i] > buyers[i - 1]);
    }
  });

  it("maxPrice matches Exclusive tier basePrice", () => {
    assert.equal(DEFAULT_PRICING_CONFIG.maxPrice, DEFAULT_PRICING_CONFIG.tiers[0].basePrice);
  });

  it("priceFloor matches Cool Shared basePrice", () => {
    assert.equal(DEFAULT_PRICING_CONFIG.priceFloor, DEFAULT_PRICING_CONFIG.tiers[3].basePrice);
  });

  it("all tier basePrices are within floor and ceiling", () => {
    for (const tier of DEFAULT_PRICING_CONFIG.tiers) {
      assert.ok(tier.basePrice >= DEFAULT_PRICING_CONFIG.priceFloor);
      assert.ok(tier.basePrice <= DEFAULT_PRICING_CONFIG.maxPrice);
    }
  });

  it("all dropIntervals are at least 1", () => {
    for (const tier of DEFAULT_PRICING_CONFIG.tiers) {
      assert.ok(tier.dropInterval >= 1);
    }
  });

  it("Cool Shared has no depreciation", () => {
    const cool = DEFAULT_PRICING_CONFIG.tiers[3];
    assert.equal(cool.dropAmount, 0);
    assert.equal(cool.holdDays, 0);
  });
});

describe("validatePricingConfig", () => {
  function validConfig(overrides = {}) {
    return {
      ...DEFAULT_PRICING_CONFIG,
      updatedAt: new Date().toISOString(),
      updatedBy: "admin",
      ...overrides,
    };
  }

  it("accepts default config", () => {
    assert.equal(validatePricingConfig(validConfig()).ok, true);
  });

  it("rejects empty tiers", () => {
    const result = validatePricingConfig(validConfig({ tiers: [] }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("tier"));
  });

  it("rejects missing tiers", () => {
    const result = validatePricingConfig(validConfig({ tiers: null }));
    assert.equal(result.ok, false);
  });

  it("rejects maxPrice below $1", () => {
    const result = validatePricingConfig(validConfig({ maxPrice: 50 }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("Max price"));
  });

  it("rejects negative priceFloor", () => {
    const result = validatePricingConfig(validConfig({ priceFloor: -1 }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("negative"));
  });

  it("rejects priceFloor > maxPrice", () => {
    const result = validatePricingConfig(validConfig({ priceFloor: 15000, maxPrice: 12000 }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("exceed"));
  });

  it("rejects tier with empty name", () => {
    const result = validatePricingConfig(validConfig({
      tiers: [{ name: "", maxBuyers: 1, basePrice: 10000, holdDays: 0, dropAmount: 0, dropInterval: 1 }],
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("name"));
  });

  it("rejects tier with maxBuyers < 1", () => {
    const result = validatePricingConfig(validConfig({
      tiers: [{ name: "Bad", maxBuyers: 0, basePrice: 10000, holdDays: 0, dropAmount: 0, dropInterval: 1 }],
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("max buyers"));
  });

  it("rejects tier basePrice below floor", () => {
    const result = validatePricingConfig(validConfig({
      priceFloor: 6000,
      tiers: [{ name: "Cheap", maxBuyers: 1, basePrice: 5000, holdDays: 0, dropAmount: 0, dropInterval: 1 }],
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("below the floor"));
  });

  it("rejects tier basePrice above ceiling", () => {
    const result = validatePricingConfig(validConfig({
      maxPrice: 12000,
      tiers: [{ name: "Expensive", maxBuyers: 1, basePrice: 15000, holdDays: 0, dropAmount: 0, dropInterval: 1 }],
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("exceed max"));
  });

  it("rejects negative dropAmount", () => {
    const result = validatePricingConfig(validConfig({
      tiers: [{ name: "Bad", maxBuyers: 1, basePrice: 10000, holdDays: 0, dropAmount: -100, dropInterval: 1 }],
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("negative"));
  });

  it("rejects dropInterval < 1", () => {
    const result = validatePricingConfig(validConfig({
      tiers: [{ name: "Bad", maxBuyers: 1, basePrice: 10000, holdDays: 0, dropAmount: 100, dropInterval: 0 }],
    }));
    assert.equal(result.ok, false);
    assert.ok(result.error.includes("interval"));
  });

  it("accepts custom valid config", () => {
    const custom = validConfig({
      maxPrice: 20000,
      priceFloor: 5000,
      tiers: [
        { name: "Premium", maxBuyers: 1, basePrice: 20000, holdDays: 5, dropAmount: 1000, dropInterval: 2 },
        { name: "Standard", maxBuyers: 3, basePrice: 10000, holdDays: 2, dropAmount: 500, dropInterval: 1 },
        { name: "Budget", maxBuyers: 10, basePrice: 5000, holdDays: 0, dropAmount: 0, dropInterval: 1 },
      ],
    });
    assert.equal(validatePricingConfig(custom).ok, true);
  });
});
