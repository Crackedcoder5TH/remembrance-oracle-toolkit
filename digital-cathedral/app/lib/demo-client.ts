/**
 * Demo Client Data
 *
 * Hardcoded admin owner client for the agent portal when no DATABASE_URL is configured.
 * Password is pre-hashed so verifyPassword("ValorOwner2026!", hash) returns true.
 *
 * Credentials (local dev):
 *   Email:    admin@valorlegacies.xyz
 *   Password: ValorOwner2026!
 */

import { createHmac } from "crypto";
import type { ClientRecord, ClientFilters, LeadPurchase, ClientBilling, ClientStats } from "./client-database";

// Pre-compute a deterministic hash so we don't need randomBytes at import time
const DEMO_SALT = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const DEMO_HASH = createHmac("sha256", DEMO_SALT).update("ValorOwner2026!").digest("hex");

const now = new Date().toISOString();

export const DEMO_CLIENT: ClientRecord = {
  clientId: "client_demo_admin",
  companyName: "Valor Legacies (Owner)",
  contactName: "Admin Owner",
  email: "admin@valorlegacies.xyz",
  phone: "5550000001",
  passwordHash: `${DEMO_SALT}:${DEMO_HASH}`,
  status: "active",
  pricingTier: "enterprise",
  pricePerLead: 0,
  exclusivePrice: 0,
  stateLicenses: JSON.stringify(["TX", "FL", "CA", "NY", "PA", "GA", "NC", "VA", "OH", "IL", "AZ", "CO", "WA", "OR", "NV"]),
  coverageTypes: JSON.stringify(["mortgage-protection", "income-replacement", "final-expense", "legacy", "retirement-savings", "guaranteed-income"]),
  dailyCap: 9999,
  monthlyCap: 99999,
  minScore: 0,
  balance: 0,
  createdAt: now,
  updatedAt: now,
};

export const DEMO_CLIENT_FILTERS: ClientFilters = {
  clientId: "client_demo_001",
  states: JSON.stringify([]),
  coverageTypes: JSON.stringify([]),
  veteranOnly: false,
  minScore: 0,
  maxLeadAge: 72,
  distributionMode: "shared",
};

export function getDemoClientStats(): ClientStats {
  return {
    totalClients: 1,
    activeClients: 1,
    totalPurchases: 0,
    totalRevenue: 0,
    revenueThisMonth: 0,
    purchasesThisMonth: 0,
    disputesOpen: 0,
  };
}

export const DEMO_PURCHASES: LeadPurchase[] = [];
export const DEMO_BILLING: ClientBilling[] = [];
