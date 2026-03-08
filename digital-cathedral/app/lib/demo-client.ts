/**
 * Demo Client Data
 *
 * Hardcoded test client for the client portal when no DATABASE_URL is configured.
 * Password is pre-hashed so verifyPassword("ClientPortal2026!", hash) returns true.
 */

import { createHmac } from "crypto";
import type { ClientRecord, ClientFilters, LeadPurchase, ClientBilling, ClientStats } from "./client-database";

// Pre-compute a deterministic hash so we don't need randomBytes at import time
const DEMO_SALT = "a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6";
const DEMO_HASH = createHmac("sha256", DEMO_SALT).update("ClientPortal2026!").digest("hex");

const now = new Date().toISOString();

export const DEMO_CLIENT: ClientRecord = {
  clientId: "client_demo_001",
  companyName: "Valor Test Agency",
  contactName: "Test Buyer",
  email: "testclient@valorlegacies.com",
  phone: "5551234567",
  passwordHash: `${DEMO_SALT}:${DEMO_HASH}`,
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
