/**
 * Lead Price Depreciation Engine
 *
 * Implements time-based step-function depreciation for lead pricing.
 * Hot leads start at maximum price and depreciate in steps as they age.
 *
 * Equation:
 *   P(t) = maxPrice − dropAmount × max(0, ⌊(t − holdDays) / dropInterval⌋)
 *   P(t) = max(floor, P(t))
 *
 * Where:
 *   t          = lead age in days
 *   maxPrice   = starting price (cents)
 *   holdDays   = days at max price before depreciation begins
 *   dropAmount = price drop per step (cents)
 *   dropInterval = days between each price drop
 *   floor      = minimum price (cents) — never goes below this
 */

export interface DepreciationConfig {
  maxPrice: number;      // cents — starting price
  holdDays: number;      // days at max price before drops begin
  dropAmount: number;    // cents per step
  dropInterval: number;  // days between each step
  floor: number;         // cents — minimum price
}

/**
 * Default depreciation configs by lead tier.
 *
 * Hot leads hold value longest and drop slowly.
 * Cool leads start cheaper and depreciate faster.
 */
export const TIER_DEPRECIATION: Record<string, DepreciationConfig> = {
  hot: {
    maxPrice: 10000,   // $100.00
    holdDays: 3,       // holds full price for 3 days
    dropAmount: 500,   // $5.00 per step
    dropInterval: 1,   // drops every day after hold
    floor: 2500,       // never below $25.00
  },
  warm: {
    maxPrice: 7500,    // $75.00
    holdDays: 2,       // holds for 2 days
    dropAmount: 500,   // $5.00 per step
    dropInterval: 1,   // drops daily
    floor: 1500,       // never below $15.00
  },
  standard: {
    maxPrice: 5000,    // $50.00
    holdDays: 1,       // holds for 1 day
    dropAmount: 500,   // $5.00 per step
    dropInterval: 1,   // drops daily
    floor: 1000,       // never below $10.00
  },
  cool: {
    maxPrice: 2500,    // $25.00
    holdDays: 0,       // starts depreciating immediately
    dropAmount: 300,   // $3.00 per step
    dropInterval: 1,   // drops daily
    floor: 500,        // never below $5.00
  },
};

/**
 * Calculate the depreciated price for a lead.
 *
 * @param ageInDays  - How old the lead is (fractional days OK, floored internally)
 * @param config     - Depreciation parameters
 * @returns Price in cents
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
 * Get the current depreciated price for a lead based on its age and tier.
 *
 * @param createdAt  - ISO date string when the lead was created
 * @param tier       - Lead tier (hot, warm, standard, cool)
 * @param overrides  - Optional partial overrides to the tier's default config
 * @returns Object with price, config used, age, and whether it's in hold phase
 */
export function getLeadPrice(
  createdAt: string,
  tier: string,
  overrides?: Partial<DepreciationConfig>
): {
  price: number;
  ageInDays: number;
  isHolding: boolean;
  stepsDown: number;
  config: DepreciationConfig;
} {
  const config: DepreciationConfig = {
    ...(TIER_DEPRECIATION[tier] || TIER_DEPRECIATION.standard),
    ...overrides,
  };

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
 * Calculate the exclusive price from a depreciated shared price.
 * Exclusive leads carry a premium multiplier (default 2x).
 */
export function getExclusivePrice(
  sharedPrice: number,
  multiplier: number = 2.0
): number {
  return Math.round(sharedPrice * multiplier);
}
