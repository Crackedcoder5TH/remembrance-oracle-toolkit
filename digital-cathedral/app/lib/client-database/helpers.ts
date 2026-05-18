/**
 * Client Database — id generation, password hashing, and row mappers.
 */

import { createHmac, randomBytes } from "crypto";
import type { ClientRecord, ClientFilters, LeadPurchase, ClientBilling } from "./types";

export function generateClientId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `client_${ts}_${rand}`;
}

export function generatePurchaseId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `purchase_${ts}_${rand}`;
}

export function generateBillingId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).slice(2, 8);
  return `billing_${ts}_${rand}`;
}

export function hashPassword(password: string): string {
  const salt = randomBytes(16).toString("hex");
  const hash = createHmac("sha256", salt).update(password).digest("hex");
  return `${salt}:${hash}`;
}

export function verifyPassword(password: string, stored: string): boolean {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const computed = createHmac("sha256", salt).update(password).digest("hex");
  if (computed.length !== hash.length) return false;
  let mismatch = 0;
  for (let i = 0; i < computed.length; i++) {
    mismatch |= computed.charCodeAt(i) ^ hash.charCodeAt(i);
  }
  return mismatch === 0;
}

export function rowToClient(row: Record<string, unknown>): ClientRecord {
  return {
    clientId: row.client_id as string,
    companyName: row.company_name as string,
    contactName: row.contact_name as string,
    email: row.email as string,
    phone: row.phone as string,
    passwordHash: row.password_hash as string,
    status: row.status as ClientRecord["status"],
    pricingTier: row.pricing_tier as string,
    pricePerLead: Number(row.price_per_lead),
    exclusivePrice: Number(row.exclusive_price),
    stateLicenses: row.state_licenses as string,
    coverageTypes: row.coverage_types as string,
    dailyCap: Number(row.daily_cap),
    monthlyCap: Number(row.monthly_cap),
    minScore: Number(row.min_score),
    balance: Number(row.balance),
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

export function rowToFilters(row: Record<string, unknown>): ClientFilters {
  return {
    clientId: row.client_id as string,
    states: row.states as string,
    coverageTypes: row.coverage_types as string,
    veteranOnly: row.veteran_only === 1 || row.veteran_only === true,
    minScore: Number(row.min_score),
    maxLeadAge: Number(row.max_lead_age),
    distributionMode: row.distribution_mode as ClientFilters["distributionMode"],
  };
}

export function rowToPurchase(row: Record<string, unknown>): LeadPurchase {
  return {
    purchaseId: row.purchase_id as string,
    leadId: row.lead_id as string,
    clientId: row.client_id as string,
    pricePaid: Number(row.price_paid),
    purchasedAt: row.purchased_at as string,
    status: row.status as LeadPurchase["status"],
    exclusive: row.exclusive === 1 || row.exclusive === true,
    returnReason: (row.return_reason as string) || "",
    returnDeadline: (row.return_deadline as string) || "",
  };
}

export function rowToBilling(row: Record<string, unknown>): ClientBilling {
  return {
    billingId: row.billing_id as string,
    clientId: row.client_id as string,
    periodStart: row.period_start as string,
    periodEnd: row.period_end as string,
    leadsPurchased: Number(row.leads_purchased),
    totalAmount: Number(row.total_amount),
    paymentStatus: row.payment_status as ClientBilling["paymentStatus"],
    invoiceUrl: (row.invoice_url as string) || "",
    createdAt: row.created_at as string,
  };
}
