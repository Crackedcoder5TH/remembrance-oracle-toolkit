/**
 * Client Database — shared types.
 *
 * The Result type, the data records (clients, filters, purchases, billing),
 * and the storage-adapter interface every backend implements.
 */

// --- Result type (mirrors database.ts) ---
export type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
export function Ok<T>(value: T): Result<T, never> { return { ok: true, value }; }
export function Err<E>(error: E): Result<never, E> { return { ok: false, error }; }

export interface ClientRecord {
  clientId: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string;
  passwordHash: string;
  status: "active" | "suspended" | "closed";
  pricingTier: string; // e.g. "standard", "premium", "enterprise"
  pricePerLead: number; // cents
  exclusivePrice: number; // cents — price for exclusive leads
  stateLicenses: string; // JSON array of state codes
  coverageTypes: string; // JSON array of coverage types
  dailyCap: number;
  monthlyCap: number;
  minScore: number;
  balance: number; // prepaid balance in cents
  createdAt: string;
  updatedAt: string;
}

export interface ClientFilters {
  clientId: string;
  states: string; // JSON array
  coverageTypes: string; // JSON array
  veteranOnly: boolean;
  minScore: number;
  maxLeadAge: number; // hours
  distributionMode: "exclusive" | "shared" | "round-robin";
}

export interface LeadPurchase {
  purchaseId: string;
  leadId: string;
  clientId: string;
  pricePaid: number; // cents
  purchasedAt: string;
  status: "delivered" | "returned" | "disputed";
  exclusive: boolean;
  returnReason: string;
  returnDeadline: string;
}

export interface ClientBilling {
  billingId: string;
  clientId: string;
  periodStart: string;
  periodEnd: string;
  leadsPurchased: number;
  totalAmount: number; // cents
  paymentStatus: "pending" | "paid" | "overdue";
  invoiceUrl: string;
  createdAt: string;
}

export interface ClientListFilters {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ClientStats {
  totalClients: number;
  activeClients: number;
  totalPurchases: number;
  totalRevenue: number;
  revenueThisMonth: number;
  purchasesThisMonth: number;
  disputesOpen: number;
}

export interface ClientDbAdapter {
  initialize(): Promise<void>;

  // Client CRUD
  insertClient(client: ClientRecord): Promise<Result<{ clientId: string }, string>>;
  getClientById(clientId: string): Promise<Result<ClientRecord | null, string>>;
  getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>>;
  updateClient(clientId: string, updates: Partial<ClientRecord>): Promise<Result<{ updated: boolean }, string>>;
  getFilteredClients(filters: ClientListFilters): Promise<Result<{ clients: ClientRecord[]; total: number }, string>>;

  // Client Filters
  getClientFilters(clientId: string): Promise<Result<ClientFilters | null, string>>;
  upsertClientFilters(filters: ClientFilters): Promise<Result<{ saved: boolean }, string>>;

  // Lead Purchases
  insertPurchase(purchase: LeadPurchase): Promise<Result<{ purchaseId: string }, string>>;
  getPurchasesByClient(clientId: string, limit?: number, offset?: number): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>>;
  getPurchasesByLead(leadId: string): Promise<Result<LeadPurchase[], string>>;
  updatePurchaseStatus(purchaseId: string, status: LeadPurchase["status"], returnReason?: string): Promise<Result<{ updated: boolean }, string>>;
  getAllPurchases(limit?: number, offset?: number, status?: string): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>>;
  getClientDailyPurchaseCount(clientId: string): Promise<Result<number, string>>;
  getClientMonthlyPurchaseCount(clientId: string): Promise<Result<number, string>>;

  // Billing
  insertBilling(billing: ClientBilling): Promise<Result<{ billingId: string }, string>>;
  getBillingByClient(clientId: string, limit?: number): Promise<Result<ClientBilling[], string>>;
  getBillingById(billingId: string): Promise<Result<ClientBilling | null, string>>;
  updateBillingStatus(billingId: string, status: ClientBilling["paymentStatus"]): Promise<Result<{ updated: boolean }, string>>;

  // Stats
  getClientStats(): Promise<Result<ClientStats, string>>;
  getRevenueByClient(): Promise<Result<Array<{ clientId: string; companyName: string; totalRevenue: number; totalPurchases: number }>, string>>;

  // Balance
  updateClientBalance(clientId: string, amount: number): Promise<Result<{ newBalance: number }, string>>;
}
