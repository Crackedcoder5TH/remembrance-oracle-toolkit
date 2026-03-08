/**
 * Lead Price Depreciation Engine
 *
 * Reads pricing tiers and depreciation settings from admin-configurable storage.
 * All values are adjustable via the Admin Portal > Pricing page.
 *
 * Default pricing tiers (buyer exclusivity):
 *   - Exclusive   (1 buyer):    $120
 *   - Semi-exclusive (2 buyers): $100
 *   - Warm shared (3–4 buyers):  $80
 *   - Cool shared (5–6 buyers):  $60
 *
 * Time-based depreciation:
 *   P(t) = basePrice − dropAmount × max(0, ⌊(t − holdDays) / dropInterval⌋)
 *   P(t) = max(floor, P(t))
 */

import { getPricingConfig, type TierConfig, type PricingConfig } from "./pricing-config";

// Re-export types for convenience
export type { TierConfig, PricingConfig };

// =============================================================================
// Public interface (matches the shapes consumers expect)
// =============================================================================

export interface PurchaseTier {
  name: string;
  maxBuyers: number;
  basePrice: number;
}

export interface DepreciationConfig {
  maxPrice: number;
  holdDays: number;
  dropAmount: number;
  dropInterval: number;
  floor: number;
}

// =============================================================================
// Config accessors — always read from the admin-configurable store
// =============================================================================

/** Get all purchase tiers from the current config. */
export function getPurchaseTiers(): PurchaseTier[] {
  const config = getPricingConfig();
  return config.tiers.map((t) => ({
    name: t.name,
    maxBuyers: t.maxBuyers,
    basePrice: t.basePrice,
  }));
}

/** Convenience: PURCHASE_TIERS as a getter for backwards compatibility. */
export const PURCHASE_TIERS = new Proxy([] as PurchaseTier[], {
  get(_target, prop) {
    const tiers = getPurchaseTiers();
    if (prop === "length") return tiers.length;
    if (prop === Symbol.iterator) return tiers[Symbol.iterator].bind(tiers);
    if (prop === "map") return tiers.map.bind(tiers);
    if (prop === "find") return tiers.find.bind(tiers);
    if (prop === "filter") return tiers.filter.bind(tiers);
    if (prop === "every") return tiers.every.bind(tiers);
    if (prop === "forEach") return tiers.forEach.bind(tiers);
    if (typeof prop === "string" && !isNaN(Number(prop))) {
      return tiers[Number(prop)];
    }
    return (tiers as Record<string | symbol, unknown>)[prop];
  },
});

/** Get the max price ceiling from config. */
export function getMaxPrice(): number {
  return getPricingConfig().maxPrice;
}

/** Get the price floor from config. */
export function getPriceFloor(): number {
  return getPricingConfig().priceFloor;
}

/** Get a tier by its index (clamped to valid range). */
export function getTierByIndex(tierIndex: number): PurchaseTier {
  const tiers = getPurchaseTiers();
  const idx = Math.max(0, Math.min(tierIndex, tiers.length - 1));
  return tiers[idx];
}

/** Build a DepreciationConfig for a given tier name. */
function getDepreciationForTier(tierName: string): DepreciationConfig {
  const config = getPricingConfig();
  const tier = config.tiers.find((t) => t.name === tierName);
  if (tier) {
    return {
      maxPrice: tier.basePrice,
      holdDays: tier.holdDays,
      dropAmount: tier.dropAmount,
      dropInterval: tier.dropInterval,
      floor: config.priceFloor,
    };
  }
  // Fallback to last tier (cheapest)
  const fallback = config.tiers[config.tiers.length - 1];
  return {
    maxPrice: fallback.basePrice,
    holdDays: fallback.holdDays,
    dropAmount: fallback.dropAmount,
    dropInterval: fallback.dropInterval,
    floor: config.priceFloor,
  };
}

// =============================================================================
// Buyer-count status
// =============================================================================

/**
 * Determine buyer status for a lead based on active buyer count.
 */
export function getLeadBuyerStatus(activeBuyerCount: number): {
  currentTier: PurchaseTier;
  soldOut: boolean;
  availableTiers: Array<PurchaseTier & { soldOut: boolean }>;
} {
  const tiers = getPurchaseTiers();
  const availableTiers = tiers.map((tier) => ({
    ...tier,
    soldOut: activeBuyerCount >= tier.maxBuyers,
  }));

  const currentTier = tiers.find((t) => activeBuyerCount < t.maxBuyers)
    || tiers[tiers.length - 1];

  const soldOut = activeBuyerCount >= tiers[tiers.length - 1].maxBuyers;

  return { currentTier, soldOut, availableTiers };
}

// =============================================================================
// Depreciation calculation
// =============================================================================

/**
 * Calculate the depreciated price for a lead at a given age.
 */
export function calculateDepreciatedPrice(
  ageInDays: number,
  config: DepreciationConfig
): number {
  if (ageInDays <= config.holdDays) {
    return config.maxPrice;
  }
  const steps = Math.floor((ageInDays - config.holdDays) / config.dropInterval);
  const price = config.maxPrice - config.dropAmount * steps;
  return Math.max(config.floor, price);
}

/**
 * Get the current price for a specific purchase tier, factoring in lead age.
 */
export function getLeadPrice(
  createdAt: string,
  tierName: string,
): {
  price: number;
  ageInDays: number;
  isHolding: boolean;
  stepsDown: number;
  config: DepreciationConfig;
} {
  const config = getDepreciationForTier(tierName);
  const ageMs = Date.now() - new Date(createdAt).getTime();
  const ageInDays = Math.max(0, ageMs / (1000 * 60 * 60 * 24));

  const price = calculateDepreciatedPrice(ageInDays, config);
  const isHolding = ageInDays <= config.holdDays;
  const stepsDown = isHolding
    ? 0
    : Math.floor((ageInDays - config.holdDays) / config.dropInterval);

  return { price, ageInDays, isHolding, stepsDown, config };
}

/**
 * Get all tier prices for a lead at its current age.
 */
export function getAllTierPrices(
  createdAt: string,
  activeBuyerCount: number
): Array<{
  tier: PurchaseTier;
  price: number;
  soldOut: boolean;
  isHolding: boolean;
  stepsDown: number;
}> {
  const { availableTiers } = getLeadBuyerStatus(activeBuyerCount);

  return availableTiers.map((t) => {
    const { price, isHolding, stepsDown } = getLeadPrice(createdAt, t.name);
    return {
      tier: { name: t.name, maxBuyers: t.maxBuyers, basePrice: t.basePrice },
      price,
      soldOut: t.soldOut,
      isHolding,
      stepsDown,
    };
  });
}
