import { NextRequest, NextResponse } from "next/server";
import { verifyAdmin } from "@/app/lib/admin-auth";
import {
  createClient,
  getClientByEmail,
  generateClientId,
  upsertClientFilters,
} from "@/app/lib/client-database";
import type { ClientRecord } from "@/app/lib/client-database";
import { hashPassword } from "@/app/lib/password";

/**
 * Seed Client Accounts API
 *
 * POST /api/admin/seed-client — Creates the admin owner client and a test client.
 * Protected by admin auth. Idempotent — won't duplicate if already exists.
 */

// Admin owner account — full access to inspect the agent portal
const ADMIN_CLIENT_EMAIL = "admin@valorlegacies.xyz";
const ADMIN_CLIENT_PASSWORD = "ValorOwner2026!";

// Test buyer account
const TEST_EMAIL = "testclient@valorlegacies.com";
const TEST_PASSWORD = "AgentPortal2026!";

interface SeedSpec {
  email: string;
  password: string;
  companyName: string;
  contactName: string;
  phone: string;
  pricingTier: string;
  pricePerLead: number;
  exclusivePrice: number;
  stateLicenses: string[];
  dailyCap: number;
  monthlyCap: number;
}

const SEED_ACCOUNTS: SeedSpec[] = [
  {
    email: ADMIN_CLIENT_EMAIL,
    password: ADMIN_CLIENT_PASSWORD,
    companyName: "Valor Legacies (Owner)",
    contactName: "Admin Owner",
    phone: "5550000001",
    pricingTier: "enterprise",
    pricePerLead: 0,
    exclusivePrice: 0,
    stateLicenses: ["TX", "FL", "CA", "NY", "PA", "GA", "NC", "VA", "OH", "IL", "AZ", "CO", "WA", "OR", "NV"],
    dailyCap: 9999,
    monthlyCap: 99999,
  },
  {
    email: TEST_EMAIL,
    password: TEST_PASSWORD,
    companyName: "Valor Test Agency",
    contactName: "Test Buyer",
    phone: "5551234567",
    pricingTier: "standard",
    pricePerLead: 2500,
    exclusivePrice: 5000,
    stateLicenses: ["TX", "FL", "CA", "NY", "PA", "GA", "NC", "VA", "OH", "IL"],
    dailyCap: 50,
    monthlyCap: 1000,
  },
];

const ALL_COVERAGE_TYPES = ["mortgage-protection", "income-replacement", "final-expense", "legacy", "retirement-savings", "guaranteed-income"];

async function seedAccount(spec: SeedSpec): Promise<{ created: boolean; clientId: string; email: string; password: string; error?: string }> {
  const existing = await getClientByEmail(spec.email);
  if (existing.ok && existing.value) {
    return { created: false, clientId: existing.value.clientId, email: spec.email, password: spec.password };
  }

  const now = new Date().toISOString();
  const clientId = generateClientId();

  const client: ClientRecord = {
    clientId,
    companyName: spec.companyName,
    contactName: spec.contactName,
    email: spec.email,
    phone: spec.phone,
    passwordHash: await hashPassword(spec.password),
    status: "active",
    pricingTier: spec.pricingTier,
    pricePerLead: spec.pricePerLead,
    exclusivePrice: spec.exclusivePrice,
    stateLicenses: JSON.stringify(spec.stateLicenses),
    coverageTypes: JSON.stringify(ALL_COVERAGE_TYPES),
    dailyCap: spec.dailyCap,
    monthlyCap: spec.monthlyCap,
    minScore: 0,
    balance: 0,
    createdAt: now,
    updatedAt: now,
  };

  const result = await createClient(client);
  if (!result.ok) {
    return { created: false, clientId: "", email: spec.email, password: spec.password, error: String(result.error) };
  }

  await upsertClientFilters({
    clientId,
    states: JSON.stringify([]),
    coverageTypes: JSON.stringify([]),
    veteranOnly: false,
    minScore: 0,
    maxLeadAge: 72,
    distributionMode: "shared",
  });

  return { created: true, clientId, email: spec.email, password: spec.password };
}

export async function POST(req: NextRequest) {
  const authError = verifyAdmin(req);
  if (authError) return authError;

  const results = await Promise.all(SEED_ACCOUNTS.map(seedAccount));

  const accounts = results.map((r) => ({
    email: r.email,
    password: r.password,
    clientId: r.clientId,
    status: r.error ? `error: ${r.error}` : r.created ? "created" : "already exists",
  }));

  return NextResponse.json({
    success: results.every((r) => !r.error),
    message: "Client accounts seeded.",
    accounts,
  });
}
