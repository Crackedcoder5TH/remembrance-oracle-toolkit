import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  getClientById,
  updateClient,
  getPurchasesByClient,
  getClientFilters,
  hashPassword,
} from "@/app/lib/client-database";

export const dynamic = "force-dynamic";

/**
 * Admin Client Detail API
 *
 * GET  /api/admin/clients/[id] — Get client details + purchases + filters
 * PUT  /api/admin/clients/[id] — Update client
 */

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const { id } = await params;
  const clientResult = await getClientById(id);
  if (!clientResult.ok) {
    return NextResponse.json({ success: false, message: "Failed to fetch client." }, { status: 500 });
  }
  if (!clientResult.value) {
    return NextResponse.json({ success: false, message: "Client not found." }, { status: 404 });
  }

  const { passwordHash, ...client } = clientResult.value;

  const searchParams = req.nextUrl.searchParams;
  const limit = Math.min(parseInt(searchParams.get("limit") || "25") || 25, 100);
  const offset = parseInt(searchParams.get("offset") || "0") || 0;

  const [purchasesResult, filtersResult] = await Promise.all([
    getPurchasesByClient(id, limit, offset),
    getClientFilters(id),
  ]);

  return NextResponse.json({
    success: true,
    client,
    purchases: purchasesResult.ok ? purchasesResult.value : { purchases: [], total: 0 },
    filters: filtersResult.ok ? filtersResult.value : null,
  });
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const { id } = await params;

  try {
    const body = await req.json();
    const updates: Record<string, unknown> = {};

    // Allow updating these fields
    const allowedFields = [
      "companyName", "contactName", "email", "phone", "status",
      "pricingTier", "pricePerLead", "exclusivePrice",
      "dailyCap", "monthlyCap", "minScore", "balance",
    ];

    for (const field of allowedFields) {
      if (field in body) updates[field] = body[field];
    }

    // Validate numeric fields have reasonable bounds
    const numericBounds: Record<string, { min: number; max: number }> = {
      dailyCap: { min: 0, max: 10_000 },
      monthlyCap: { min: 0, max: 100_000 },
      minScore: { min: 0, max: 100 },
      balance: { min: 0, max: 100_000_00 }, // cents
      pricePerLead: { min: 0, max: 100_000 },
      exclusivePrice: { min: 0, max: 100_000 },
    };
    for (const [field, bounds] of Object.entries(numericBounds)) {
      if (field in updates) {
        const val = updates[field];
        if (typeof val !== "number" || !Number.isFinite(val) || val < bounds.min || val > bounds.max) {
          return NextResponse.json(
            { success: false, message: `${field} must be a number between ${bounds.min} and ${bounds.max}.` },
            { status: 400 },
          );
        }
      }
    }

    // Handle JSON array fields
    if ("stateLicenses" in body) updates.stateLicenses = JSON.stringify(body.stateLicenses);
    if ("coverageTypes" in body) updates.coverageTypes = JSON.stringify(body.coverageTypes);

    // Handle password change
    if (body.password) updates.passwordHash = hashPassword(body.password);

    const result = await updateClient(id, updates);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, updated: result.value.updated });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
