import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  createClient,
  getClientByEmail,
  generateClientId,
  hashPassword,
  upsertClientFilters,
} from "@/app/lib/client-database";
import type { ClientRecord } from "@/app/lib/client-database";

/**
 * Seed Test Client API
 *
 * POST /api/admin/seed-client — Creates a test client for portal access.
 * Protected by admin auth. Idempotent — won't duplicate if already exists.
 */

const TEST_EMAIL = "testclient@valorlegacies.com";
const TEST_PASSWORD = "ClientPortal2026!";

export async function POST(req: NextRequest) {
  const authError = await verifyAdmin(req);
  if (authError) return authError;

  // Check if test client already exists
  const existing = await getClientByEmail(TEST_EMAIL);
  if (existing.ok && existing.value) {
    return NextResponse.json({
      success: true,
      message: "Test client already exists.",
      credentials: { email: TEST_EMAIL, password: TEST_PASSWORD },
      clientId: existing.value.clientId,
    });
  }

  const now = new Date().toISOString();
  const clientId = generateClientId();

  const client: ClientRecord = {
    clientId,
    companyName: "Valor Test Agency",
    contactName: "Test Buyer",
    email: TEST_EMAIL,
    phone: "5551234567",
    passwordHash: hashPassword(TEST_PASSWORD),
    status: "active",
    pricingTier: "standard",
    pricePerLead: 2500,       // $25.00
    exclusivePrice: 5000,     // $50.00
    stateLicenses: JSON.stringify(["TX", "FL", "CA", "NY", "PA", "GA", "NC", "VA", "OH", "IL"]),
    coverageTypes: JSON.stringify(["mortgage-protection", "income-replacement", "final-expense", "legacy", "retirement-savings", "guaranteed-income"]),
    dailyCap: 50,
    monthlyCap: 1000,
    minScore: 0,
    balance: 0,
    createdAt: now,
    updatedAt: now,
  };

  const result = await createClient(client);
  if (!result.ok) {
    return NextResponse.json({ success: false, message: result.error }, { status: 500 });
  }

  // Set default filters
  await upsertClientFilters({
    clientId,
    states: JSON.stringify([]),
    coverageTypes: JSON.stringify([]),
    veteranOnly: false,
    minScore: 0,
    maxLeadAge: 72,
    distributionMode: "shared",
  });

  return NextResponse.json({
    success: true,
    message: "Test client created successfully.",
    credentials: { email: TEST_EMAIL, password: TEST_PASSWORD },
    clientId,
    details: {
      companyName: client.companyName,
      balance: "$0.00",
      pricePerLead: "$25.00",
      exclusivePrice: "$50.00",
      licensedStates: 10,
    },
  });
}
