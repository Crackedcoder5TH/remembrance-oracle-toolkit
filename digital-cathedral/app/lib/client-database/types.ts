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
  /** Lifecycle:
   *   "pending"   — self-registered, awaiting admin license verification.
   *                 Can sign in to see the pending state, but verifyClient
   *                 rejects any /api/client/* call until promoted to active.
   *   "active"    — license verified by admin; full marketplace access.
   *   "suspended" — temporarily blocked (compliance issue / refund dispute).
   *   "closed"    — terminal state, account never returns. */
  status: "pending" | "active" | "suspended" | "closed";
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

export interface ClientListFilters {
  status?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface ClientStats {
  totalClients: number;
  activeClients: number;
  /** Buyers self-registered + awaiting admin license verification.
   *  Surfaced as a count badge on /admin so operators see the queue. */
  pendingClients: number;
  totalPurchases: number;
  totalRevenue: number;
  revenueThisMonth: number;
  purchasesThisMonth: number;
  disputesOpen: number;
}

/**
 * Outcome of a capacity-guarded purchase insert. `sold_out` means the lead's
 * exclusivity rule or buyer cap was already reached when the insert ran, so
 * no row was written.
 */
export type GuardedPurchaseOutcome =
  | { outcome: "inserted"; purchase: LeadPurchase }
  | { outcome: "duplicate"; purchase: LeadPurchase }
  | { outcome: "sold_out" };

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
  /**
   * Insert a purchase only if the lead still has capacity, checked and
   * committed atomically so concurrent checkouts cannot both pass the cap.
   */
  insertPurchaseGuarded(purchase: LeadPurchase, maxBuyers: number): Promise<Result<GuardedPurchaseOutcome, string>>;
  getPurchasesByClient(clientId: string, limit?: number, offset?: number): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>>;
  getPurchasesByLead(leadId: string): Promise<Result<LeadPurchase[], string>>;
  updatePurchaseStatus(purchaseId: string, status: LeadPurchase["status"], returnReason?: string): Promise<Result<{ updated: boolean }, string>>;
  getAllPurchases(limit?: number, offset?: number, status?: string): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>>;
  getClientDailyPurchaseCount(clientId: string): Promise<Result<number, string>>;
  getClientMonthlyPurchaseCount(clientId: string): Promise<Result<number, string>>;

  // Stats
  getClientStats(): Promise<Result<ClientStats, string>>;
  getRevenueByClient(): Promise<Result<Array<{ clientId: string; companyName: string; totalRevenue: number; totalPurchases: number }>, string>>;
}
