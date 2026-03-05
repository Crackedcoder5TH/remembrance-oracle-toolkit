/**
 * A/B Testing Infrastructure
 *
 * Provides deterministic experiment variant assignment using cookies.
 * Variants are assigned via weighted random selection and persisted
 * in cookies for 30 days to ensure consistent user experience.
 *
 * Conversions are tracked through the analytics layer (analytics.ts).
 */

import { trackEvent } from "./analytics";

// ─── Types ───

export type Experiment = {
  id: string;
  variants: string[];
  weights?: number[];
};

// ─── Cookie Helpers ───

/**
 * Get the value of a cookie by name.
 * Returns null if not found or if running on the server.
 */
function getCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const match = document.cookie.match(
    new RegExp("(?:^|;\\s*)" + name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") + "=([^;]*)"),
  );
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Set a cookie with the given name, value, and expiry in days.
 */
function setCookie(name: string, value: string, days: number): void {
  if (typeof document === "undefined") return;
  const expires = new Date(Date.now() + days * 864e5).toUTCString();
  document.cookie = `${name}=${encodeURIComponent(value)}; expires=${expires}; path=/; SameSite=Lax`;
}

// ─── Variant Assignment ───

/**
 * Select a variant using weighted random assignment.
 *
 * @param variants - Array of variant names (e.g. ["control", "variant-a", "variant-b"])
 * @param weights  - Optional array of weights (must match variants length).
 *                   Defaults to equal weighting if omitted.
 * @returns The selected variant name.
 */
function weightedRandom(variants: string[], weights?: number[]): string {
  if (variants.length === 0) {
    throw new Error("[ab-testing] variants array must not be empty");
  }

  // Default to equal weights
  const w = weights && weights.length === variants.length
    ? weights
    : variants.map(() => 1 / variants.length);

  // Normalize weights to sum to 1
  const total = w.reduce((sum, v) => sum + v, 0);
  const normalized = w.map((v) => v / total);

  // Weighted random selection
  const rand = Math.random();
  let cumulative = 0;
  for (let i = 0; i < normalized.length; i++) {
    cumulative += normalized[i];
    if (rand < cumulative) {
      return variants[i];
    }
  }

  // Fallback — should only happen due to floating point rounding
  return variants[variants.length - 1];
}

/**
 * Get the assigned variant for an experiment.
 *
 * If the user already has a cookie for this experiment, returns the stored variant.
 * Otherwise, assigns a new variant using weighted random selection, stores it
 * in a cookie for 30 days, and returns it.
 *
 * @param experimentId - Unique experiment identifier (used as cookie suffix)
 * @param variants     - Array of variant names
 * @param weights      - Optional array of weights for each variant
 * @returns The assigned variant name
 */
export function getVariant(
  experimentId: string,
  variants: string[],
  weights?: number[],
): string {
  const cookieName = `ab_${experimentId}`;

  // Check for existing assignment
  const existing = getCookie(cookieName);
  if (existing && variants.includes(existing)) {
    return existing;
  }

  // Assign new variant
  const variant = weightedRandom(variants, weights);
  setCookie(cookieName, variant, 30);

  // Track the assignment event
  trackEvent({
    event: "experiment_assigned",
    category: "ab_test",
    label: experimentId,
    metadata: { variant },
  });

  return variant;
}

/**
 * Track a conversion event for an experiment.
 *
 * Fires an analytics event with the experiment ID and assigned variant,
 * allowing you to measure which variant drove the conversion.
 *
 * @param experimentId - The experiment that produced the conversion
 * @param variant      - The variant the user was assigned to
 */
export function trackExperimentConversion(
  experimentId: string,
  variant: string,
): void {
  trackEvent({
    event: "experiment_conversion",
    category: "ab_test",
    label: experimentId,
    value: 1,
    metadata: { variant },
  });
}
