/**
 * Client Database — Lead Buyer Management Layer.
 *
 * Dual-mode persistence (PostgreSQL / SQLite, with a no-op fallback) for
 * client accounts, lead purchases, billing, and delivery filters. This
 * barrel keeps the public `@/app/lib/client-database` API stable: types
 * and helpers are re-exported, and every operation is dispatched to the
 * active adapter resolved by getClientAdapter().
 *
 * Tables: clients, client_filters, lead_purchases, client_billing.
 */

import type {
  ClientRecord,
  ClientFilters,
  ClientListFilters,
  LeadPurchase,
  ClientBilling,
  ClientDbAdapter,
} from "./types";
import { PostgresClientAdapter } from "./postgres-adapter";
import { SqliteClientAdapter } from "./sqlite-adapter";
import { NoopClientAdapter } from "./noop-adapter";

export type {
  Result,
  ClientRecord,
  ClientFilters,
  LeadPurchase,
  ClientBilling,
  ClientListFilters,
  ClientStats,
  ClientDbAdapter,
  GuardedPurchaseOutcome,
} from "./types";
export {
  generateClientId,
  generatePurchaseId,
  generateBillingId,
  hashPassword,
  verifyPassword,
} from "./helpers";

// ── Adapter selection — singleton ──

let _clientAdapter: ClientDbAdapter | null = null;

function getClientAdapter(): ClientDbAdapter {
  if (_clientAdapter) return _clientAdapter;

  if (process.env.DATABASE_URL) {
    console.log("[client-database] Using PostgreSQL adapter (DATABASE_URL detected)");
    _clientAdapter = new PostgresClientAdapter();
  } else {
    // Use SQLite for local dev and any environment without DATABASE_URL
    try {
      _clientAdapter = new SqliteClientAdapter();
      console.log("[client-database] Using SQLite adapter (local mode)");
    } catch {
      console.warn("[client-database] SQLite unavailable — using noop adapter");
      _clientAdapter = new NoopClientAdapter();
    }
  }

  return _clientAdapter;
}

// ── Exported functions ──

export async function createClient(client: ClientRecord) { return getClientAdapter().insertClient(client); }
export async function getClientById(clientId: string) { return getClientAdapter().getClientById(clientId); }
export async function getClientByEmail(email: string) { return getClientAdapter().getClientByEmail(email); }
export async function updateClient(clientId: string, updates: Partial<ClientRecord>) { return getClientAdapter().updateClient(clientId, updates); }
export async function getFilteredClients(filters: ClientListFilters) { return getClientAdapter().getFilteredClients(filters); }
export async function getClientFilters(clientId: string) { return getClientAdapter().getClientFilters(clientId); }
export async function upsertClientFilters(filters: ClientFilters) { return getClientAdapter().upsertClientFilters(filters); }
export async function createPurchase(purchase: LeadPurchase) { return getClientAdapter().insertPurchase(purchase); }
export async function createPurchaseGuarded(purchase: LeadPurchase, maxBuyers: number) { return getClientAdapter().insertPurchaseGuarded(purchase, maxBuyers); }
export async function getPurchasesByClient(clientId: string, limit?: number, offset?: number) { return getClientAdapter().getPurchasesByClient(clientId, limit, offset); }
export async function getPurchasesByLead(leadId: string) { return getClientAdapter().getPurchasesByLead(leadId); }
export async function updatePurchaseStatus(purchaseId: string, status: LeadPurchase["status"], returnReason?: string) { return getClientAdapter().updatePurchaseStatus(purchaseId, status, returnReason); }
export async function getAllPurchases(limit?: number, offset?: number, status?: string) { return getClientAdapter().getAllPurchases(limit, offset, status); }
export async function getClientDailyPurchaseCount(clientId: string) { return getClientAdapter().getClientDailyPurchaseCount(clientId); }
export async function getClientMonthlyPurchaseCount(clientId: string) { return getClientAdapter().getClientMonthlyPurchaseCount(clientId); }
export async function createBilling(billing: ClientBilling) { return getClientAdapter().insertBilling(billing); }
export async function getBillingByClient(clientId: string, limit?: number) { return getClientAdapter().getBillingByClient(clientId, limit); }
export async function getBillingById(billingId: string) { return getClientAdapter().getBillingById(billingId); }
export async function updateBillingStatus(billingId: string, status: ClientBilling["paymentStatus"]) { return getClientAdapter().updateBillingStatus(billingId, status); }
export async function getClientStats() { return getClientAdapter().getClientStats(); }
export async function getRevenueByClient() { return getClientAdapter().getRevenueByClient(); }
export async function updateClientBalance(clientId: string, amount: number) { return getClientAdapter().updateClientBalance(clientId, amount); }
