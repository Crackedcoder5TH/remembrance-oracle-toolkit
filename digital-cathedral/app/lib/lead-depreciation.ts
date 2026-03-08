/**
 * Lead Price Depreciation Engine
 *
 * Fixed pricing tiers based on buyer exclusivity:
 *   - Exclusive   (1 buyer):    $120
 *   - Semi-exclusive (2 buyers): $100
 *   - Warm shared (3–4 buyers):  $80
 *   - Cool shared (5–6 buyers):  $60
 *
 * Time-based depreciation still applies via the step-function:
 *   P(t) = basePrice − dropAmount × max(0, ⌊(t − holdDays) / dropInterval⌋)
 *   P(t) = max(floor, P(t))
 *
 * All leads: max $120.00, floor $60.00
 */

// =============================================================================
// Buyer-count pricing tiers
// =============================================================================

export interface PurchaseTier {
  name: string;
  maxBuyers: number;
  basePrice: number;  // cents
}

/** Fixed pricing tiers ordered from most to least exclusive. */
export const PURCHASE_TIERS: PurchaseTier[] = [
  { name: "Exclusive",      maxBuyers: 1, basePrice: 12000 }, // $120
  { name: "Semi-Exclusive",  maxBuyers: 2, basePrice: 10000 }, // $100
  { name: "Warm Shared",    maxBuyers: 4, basePrice: 8000 },  // $80
  { name: "Cool Shared",    maxBuyers: 6, basePrice: 6000 },  // $60
];

/** Maximum price any lead can be (cents). */
export const MAX_PRICE = 12000; // $120.00

/** Minimum price any lead can be (cents). */
export const PRICE_FLOOR = 6000; // $60.00

/**
 * Get the purchase tier and price based on how many buyers to allow.
 * The `tierIndex` maps to PURCHASE_TIERS: 0 = exclusive, 1 = semi, 2 = warm, 3 = cool.
 */
export function getTierByIndex(tierIndex: number): PurchaseTier {
  return PURCHASE_TIERS[Math.max(0, Math.min(tierIndex, PURCHASE_TIERS.length - 1))];
}

/**
 * Determine which tier a lead is currently in based on active buyer count.
 * Returns the tier info and whether the lead is sold out at this tier.
 */
export function getLeadBuyerStatus(activeBuyerCount: number): {
  currentTier: PurchaseTier;
  soldOut: boolean;
  availableTiers: Array<PurchaseTier & { soldOut: boolean }>;
} {
  // Find which tiers are still available
  const availableTiers = PURCHASE_TIERS.map((tier) => ({
    ...tier,
    soldOut: activeBuyerCount >= tier.maxBuyers,
  }));

  // The "current" tier is the smallest tier the lead hasn't exceeded
  const currentTier = PURCHASE_TIERS.find((t) => activeBuyerCount < t.maxBuyers)
    || PURCHASE_TIERS[PURCHASE_TIERS.length - 1];

  const soldOut = activeBuyerCount >= PURCHASE_TIERS[PURCHASE_TIERS.length - 1].maxBuyers;

  return { currentTier, soldOut, availableTiers };
}

// =============================================================================
// Time-based depreciation (applied on top of tier pricing)
// =============================================================================

export interface DepreciationConfig {
  maxPrice: number;      // cents — starting price
  holdDays: number;      // days at max price before drops begin
  dropAmount: number;    // cents per step
  dropInterval: number;  // days between each step
  floor: number;         // cents — minimum price
}

/**
 * Depreciation config for each buyer-count tier.
 * All tiers share the same $60 floor but start at different base prices.
 */
export const TIER_DEPRECIATION: Record<string, DepreciationConfig> = {
  Exclusive: {
    maxPrice: 12000,   // $120.00
    holdDays: 3,       // holds full price for 3 days
    dropAmount: 500,   // $5.00 per step
    dropInterval: 1,   // drops every day after hold
    floor: 6000,       // never below $60.00
  },
  "Semi-Exclusive": {
    maxPrice: 10000,   // $100.00
    holdDays: 2,       // holds for 2 days
    dropAmount: 500,   // $5.00 per step
    dropInterval: 1,   // drops daily
    floor: 6000,       // never below $60.00
  },
  "Warm Shared": {
    maxPrice: 8000,    // $80.00
    holdDays: 1,       // holds for 1 day
    dropAmount: 300,   // $3.00 per step
    dropInterval: 1,   // drops daily
    floor: 6000,       // never below $60.00
  },
  "Cool Shared": {
    maxPrice: 6000,    // $60.00 (already at floor)
    holdDays: 0,
    dropAmount: 0,
    dropInterval: 1,
    floor: 6000,       // $60.00 flat
  },
};

/**
 * Calculate the depreciated price for a lead.
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
  const config: DepreciationConfig =
    TIER_DEPRECIATION[tierName] || TIER_DEPRECIATION["Cool Shared"];

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
 * Returns each tier with its depreciated price and sold-out status.
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
