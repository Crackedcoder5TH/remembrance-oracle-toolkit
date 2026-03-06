import { NextRequest, NextResponse } from "next/server";
import { verifyClient } from "@/app/lib/client-auth";
import { getClientFilters, upsertClientFilters } from "@/app/lib/client-database";
import type { ClientFilters } from "@/app/lib/client-database";

/**
 * Client Filters API
 *
 * GET /api/client/filters — Get saved delivery preferences
 * PUT /api/client/filters — Update delivery preferences
 */
export async function GET(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  const result = await getClientFilters(auth.clientId);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: "Failed to fetch filters." }, { status: 500 });
  }

  return NextResponse.json({
    success: true,
    filters: result.value || {
      clientId: auth.clientId,
      states: "[]",
      coverageTypes: "[]",
      veteranOnly: false,
      minScore: 0,
      maxLeadAge: 72,
      distributionMode: "shared",
    },
  });
}

export async function PUT(req: NextRequest) {
  const auth = await verifyClient(req);
  if (auth instanceof NextResponse) return auth;

  try {
    const body = await req.json();

    const filters: ClientFilters = {
      clientId: auth.clientId,
      states: JSON.stringify(body.states || []),
      coverageTypes: JSON.stringify(body.coverageTypes || []),
      veteranOnly: body.veteranOnly || false,
      minScore: body.minScore || 0,
      maxLeadAge: body.maxLeadAge || 72,
      distributionMode: body.distributionMode || "shared",
    };

    const result = await upsertClientFilters(filters);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: "Failed to save filters." }, { status: 500 });
    }

    return NextResponse.json({ success: true, filters });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
