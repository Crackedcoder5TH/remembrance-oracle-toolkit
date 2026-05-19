/**
 * Client Database — no-op / demo adapter.
 *
 * Fallback when neither Postgres nor SQLite is available. Serves the
 * demo client so the UI renders without a real datastore.
 */

import type {
  ClientRecord,
  ClientFilters,
  LeadPurchase,
  ClientStats,
  ClientDbAdapter,
  GuardedPurchaseOutcome,
  Result,
} from "./types";
import { Ok } from "./types";

export class NoopClientAdapter implements ClientDbAdapter {
  async initialize(): Promise<void> {}

  insertClient(client: ClientRecord): Promise<Result<{ clientId: string }, string>> {
    return Promise.resolve(Ok({ clientId: client.clientId }));
  }

  async getClientById(clientId: string): Promise<Result<ClientRecord | null, string>> {
    const { DEMO_CLIENT } = await import("../demo-client");
    return Ok(clientId === DEMO_CLIENT.clientId ? DEMO_CLIENT : null);
  }

  async getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>> {
    const { DEMO_CLIENT } = await import("../demo-client");
    return Ok(email === DEMO_CLIENT.email ? DEMO_CLIENT : null);
  }

  updateClient(): Promise<Result<{ updated: boolean }, string>> {
    return Promise.resolve(Ok({ updated: true }));
  }

  async getFilteredClients(): Promise<Result<{ clients: ClientRecord[]; total: number }, string>> {
    const { DEMO_CLIENT } = await import("../demo-client");
    return Ok({ clients: [DEMO_CLIENT], total: 1 });
  }

  async getClientFilters(clientId: string): Promise<Result<ClientFilters | null, string>> {
    const { DEMO_CLIENT_FILTERS } = await import("../demo-client");
    return Ok(clientId === DEMO_CLIENT_FILTERS.clientId ? DEMO_CLIENT_FILTERS : null);
  }

  upsertClientFilters(): Promise<Result<{ saved: boolean }, string>> {
    return Promise.resolve(Ok({ saved: true }));
  }

  insertPurchase(): Promise<Result<{ purchaseId: string }, string>> {
    return Promise.resolve(Ok({ purchaseId: "purchase_demo_001" }));
  }

  insertPurchaseGuarded(purchase: LeadPurchase): Promise<Result<GuardedPurchaseOutcome, string>> {
    return Promise.resolve(Ok({ outcome: "inserted", purchase }));
  }

  async getPurchasesByClient(): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>> {
    return Ok({ purchases: [], total: 0 });
  }

  async getPurchasesByLead(): Promise<Result<LeadPurchase[], string>> {
    return Ok([]);
  }

  updatePurchaseStatus(): Promise<Result<{ updated: boolean }, string>> {
    return Promise.resolve(Ok({ updated: true }));
  }

  async getAllPurchases(): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>> {
    return Ok({ purchases: [], total: 0 });
  }

  getClientDailyPurchaseCount(): Promise<Result<number, string>> { return Promise.resolve(Ok(0)); }
  getClientMonthlyPurchaseCount(): Promise<Result<number, string>> { return Promise.resolve(Ok(0)); }

  async getClientStats(): Promise<Result<ClientStats, string>> {
    const { getDemoClientStats } = await import("../demo-client");
    return Ok(getDemoClientStats());
  }

  async getRevenueByClient(): Promise<Result<Array<{ clientId: string; companyName: string; totalRevenue: number; totalPurchases: number }>, string>> {
    const { DEMO_CLIENT } = await import("../demo-client");
    return Ok([{ clientId: DEMO_CLIENT.clientId, companyName: DEMO_CLIENT.companyName, totalRevenue: 0, totalPurchases: 0 }]);
  }

}
