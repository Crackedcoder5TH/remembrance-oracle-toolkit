import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  createClient,
  getFilteredClients,
  generateClientId,
  hashPassword,
} from "@/app/lib/client-database";
import type { ClientRecord } from "@/app/lib/client-database";

export const dynamic = "force-dynamic";

/**
 * Admin Client Management API
 *
 * GET  /api/admin/clients — List clients with filters
 * POST /api/admin/clients — Create a new client
 */

export async function GET(req: NextRequest) {
  const authError = await verifyAdmin(req);
  if (authError) return authError;

  const params = req.nextUrl.searchParams;
  const result = await getFilteredClients({
    status: params.get("status") || undefined,
    search: params.get("search") || undefined,
    limit: Math.min(parseInt(params.get("limit") || "50") || 50, 200),
    offset: parseInt(params.get("offset") || "0") || 0,
  });

  if (!result.ok) {
    return NextResponse.json({ success: false, message: "Failed to fetch clients." }, { status: 500 });
  }

  // Strip password hashes from response
  const clients = result.value.clients.map(({ passwordHash, ...rest }) => rest);

  return NextResponse.json({ success: true, clients, total: result.value.total });
}

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req);
  if (authError) return authError;

  try {
    const body = await req.json();
    const { companyName, contactName, email, phone, password, pricingTier, pricePerLead, exclusivePrice, stateLicenses, coverageTypes, dailyCap, monthlyCap, minScore, balance } = body;

    if (!companyName || !contactName || !email || !password) {
      return NextResponse.json(
        { success: false, message: "Company name, contact name, email, and password are required." },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const client: ClientRecord = {
      clientId: generateClientId(),
      companyName,
      contactName,
      email: email.trim().toLowerCase(),
      phone: phone || "",
      passwordHash: hashPassword(password),
      status: "active",
      pricingTier: pricingTier || "standard",
      pricePerLead: pricePerLead || 2500,
      exclusivePrice: exclusivePrice || 5000,
      stateLicenses: JSON.stringify(stateLicenses || []),
      coverageTypes: JSON.stringify(coverageTypes || []),
      dailyCap: dailyCap || 50,
      monthlyCap: monthlyCap || 1000,
      minScore: minScore || 0,
      balance: balance || 0,
      createdAt: now,
      updatedAt: now,
    };

    const result = await createClient(client);
    if (!result.ok) {
      return NextResponse.json({ success: false, message: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true, clientId: result.value.clientId });
  } catch {
    return NextResponse.json({ success: false, message: "Invalid request." }, { status: 400 });
  }
}
