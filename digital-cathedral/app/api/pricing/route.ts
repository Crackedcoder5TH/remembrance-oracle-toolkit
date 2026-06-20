import { NextResponse } from "next/server";
import { getPricingConfig } from "@/app/lib/pricing-config";

export const dynamic = "force-dynamic";

/**
 * Public lead price list — the single source of truth for the pricing tiers the
 * marketplace shows agents. Reads the admin-adjustable pricing-config so the
 * displayed tiers always match what the admin set (no more hardcoded numbers in
 * the page). Returns cents; the client formats. No PII, safe to be public.
 */
export async function GET() {
  const cfg = getPricingConfig();
  return NextResponse.json(
    {
      tiers: cfg.tiers.map((t) => ({ name: t.name, maxBuyers: t.maxBuyers, basePrice: t.basePrice })),
      maxPrice: cfg.maxPrice,
      priceFloor: cfg.priceFloor,
      updatedAt: cfg.updatedAt,
    },
    { headers: { "cache-control": "public, s-maxage=60, stale-while-revalidate=300" } },
  );
}
