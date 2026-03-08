/**
 * Pricing Configuration — Admin-Adjustable Settings
 *
 * Stores and loads the pricing/depreciation configuration as JSON.
 * The admin portal can update these values at any time.
 *
 * Storage: JSON file at .data/pricing-config.json (persists across restarts)
 * Fallback: hardcoded defaults if file doesn't exist
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";

// =============================================================================
// Types
// =============================================================================

export interface TierConfig {
  name: string;
  maxBuyers: number;
  basePrice: number;    // cents
  holdDays: number;
  dropAmount: number;   // cents per step
  dropInterval: number; // days between each step
}

export interface PricingConfig {
  maxPrice: number;     // cents — absolute ceiling
  priceFloor: number;   // cents — absolute minimum
  tiers: TierConfig[];
  updatedAt: string;
  updatedBy: string;
}

// =============================================================================
// Defaults — used when no config file exists
// =============================================================================

export const DEFAULT_PRICING_CONFIG: PricingConfig = {
  maxPrice: 12000,    // $120.00
  priceFloor: 6000,   // $60.00
  tiers: [
    { name: "Exclusive",      maxBuyers: 1, basePrice: 12000, holdDays: 3, dropAmount: 500, dropInterval: 1 },
    { name: "Semi-Exclusive",  maxBuyers: 2, basePrice: 10000, holdDays: 2, dropAmount: 500, dropInterval: 1 },
    { name: "Warm Shared",    maxBuyers: 4, basePrice: 8000,  holdDays: 1, dropAmount: 300, dropInterval: 1 },
    { name: "Cool Shared",    maxBuyers: 6, basePrice: 6000,  holdDays: 0, dropAmount: 0,   dropInterval: 1 },
  ],
  updatedAt: new Date().toISOString(),
  updatedBy: "system",
};

// =============================================================================
// File path
// =============================================================================

const DATA_DIR = path.join(process.cwd(), ".data");
const CONFIG_FILE = path.join(DATA_DIR, "pricing-config.json");

// =============================================================================
// Read / Write
// =============================================================================

/** In-memory cache to avoid reading the file on every request. */
let _cache: PricingConfig | null = null;
let _cacheTime = 0;
const CACHE_TTL_MS = 5000; // 5 seconds

/**
 * Load the current pricing config. Returns cached version if fresh.
 */
export function getPricingConfig(): PricingConfig {
  const now = Date.now();
  if (_cache && now - _cacheTime < CACHE_TTL_MS) {
    return _cache;
  }

  try {
    if (existsSync(CONFIG_FILE)) {
      const raw = readFileSync(CONFIG_FILE, "utf-8");
      const parsed = JSON.parse(raw) as PricingConfig;
      // Validate structure minimally
      if (parsed.tiers && Array.isArray(parsed.tiers) && parsed.tiers.length > 0) {
        _cache = parsed;
        _cacheTime = now;
        return parsed;
      }
    }
  } catch {
    // Corrupted file — fall through to defaults
  }

  _cache = DEFAULT_PRICING_CONFIG;
  _cacheTime = now;
  return DEFAULT_PRICING_CONFIG;
}

/**
 * Save a new pricing config. Validates before writing.
 */
export function savePricingConfig(config: PricingConfig): { ok: true } | { ok: false; error: string } {
  // Validate
  if (!config.tiers || !Array.isArray(config.tiers) || config.tiers.length === 0) {
    return { ok: false, error: "At least one tier is required." };
  }

  if (config.maxPrice < 100) {
    return { ok: false, error: "Max price must be at least $1.00 (100 cents)." };
  }

  if (config.priceFloor < 0) {
    return { ok: false, error: "Price floor cannot be negative." };
  }

  if (config.priceFloor > config.maxPrice) {
    return { ok: false, error: "Price floor cannot exceed max price." };
  }

  for (const tier of config.tiers) {
    if (!tier.name || tier.name.trim().length === 0) {
      return { ok: false, error: "Every tier must have a name." };
    }
    if (tier.maxBuyers < 1) {
      return { ok: false, error: `Tier "${tier.name}": max buyers must be at least 1.` };
    }
    if (tier.basePrice < config.priceFloor) {
      return { ok: false, error: `Tier "${tier.name}": base price cannot be below the floor ($${(config.priceFloor / 100).toFixed(2)}).` };
    }
    if (tier.basePrice > config.maxPrice) {
      return { ok: false, error: `Tier "${tier.name}": base price cannot exceed max price ($${(config.maxPrice / 100).toFixed(2)}).` };
    }
    if (tier.dropAmount < 0) {
      return { ok: false, error: `Tier "${tier.name}": drop amount cannot be negative.` };
    }
    if (tier.dropInterval < 1) {
      return { ok: false, error: `Tier "${tier.name}": drop interval must be at least 1 day.` };
    }
  }

  try {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), "utf-8");
    // Invalidate cache
    _cache = config;
    _cacheTime = Date.now();
    return { ok: true };
  } catch (err) {
    return { ok: false, error: `Failed to write config: ${err instanceof Error ? err.message : "unknown error"}` };
  }
}
