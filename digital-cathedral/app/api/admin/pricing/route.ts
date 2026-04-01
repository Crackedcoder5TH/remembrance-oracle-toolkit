import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import { getPricingConfig, savePricingConfig, type PricingConfig } from "@/app/lib/pricing-config";

/**
 * Admin Pricing Config API
 *
 * GET  /api/admin/pricing — Returns current pricing configuration
 * PUT  /api/admin/pricing — Updates pricing configuration
 */

export async function GET(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const config = getPricingConfig();
  return NextResponse.json({ success: true, config });
}

export async function PUT(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();

    const config: PricingConfig = {
      maxPrice: parseInt(String(body.maxPrice)) || 12000,
      priceFloor: parseInt(String(body.priceFloor)) || 6000,
      tiers: (body.tiers || []).map((t: Record<string, unknown>) => ({
        name: String(t.name || "").trim(),
        maxBuyers: parseInt(String(t.maxBuyers)) || 1,
        basePrice: parseInt(String(t.basePrice)) || 6000,
        holdDays: parseInt(String(t.holdDays)) || 0,
        dropAmount: parseInt(String(t.dropAmount)) || 0,
        dropInterval: Math.max(1, parseInt(String(t.dropInterval)) || 1),
      })),
      updatedAt: new Date().toISOString(),
      updatedBy: "admin",
    };

    const result = savePricingConfig(config);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error }, { status: 400 });
    }

    return NextResponse.json({ success: true, config });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request body." }, { status: 400 });
  }
}
