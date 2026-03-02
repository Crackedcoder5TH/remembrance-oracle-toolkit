"use client";

/**
 * useExperiment — React hook for A/B testing.
 *
 * Returns the assigned variant for an experiment. The variant is
 * deterministically assigned on first render (stored in a cookie)
 * and remains consistent for 30 days.
 *
 * Usage:
 *   const variant = useExperiment("hero-cta", ["control", "variant-a"]);
 *   // variant === "control" or "variant-a"
 *
 *   const variant = useExperiment("pricing", ["low", "mid", "high"], [0.5, 0.3, 0.2]);
 *   // weighted: 50% "low", 30% "mid", 20% "high"
 */

import { useState, useEffect } from "react";
import { getVariant } from "./ab-testing";

/**
 * Hook that assigns and returns a stable experiment variant.
 *
 * @param experimentId - Unique experiment identifier
 * @param variants     - Array of variant names (e.g. ["control", "variant-a"])
 * @param weights      - Optional weights for each variant (defaults to equal)
 * @returns The assigned variant name (empty string during SSR, then stable on client)
 */
export function useExperiment(
  experimentId: string,
  variants: string[],
  weights?: number[],
): string {
  const [variant, setVariant] = useState<string>("");

  useEffect(() => {
    const assigned = getVariant(experimentId, variants, weights);
    setVariant(assigned);
    // Only re-run if the experiment configuration changes
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [experimentId, JSON.stringify(variants), JSON.stringify(weights)]);

  return variant;
}
