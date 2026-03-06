/**
 * Client Database — Lead Buyer Management Layer
 *
 * Extends the dual-mode persistence pattern (PostgreSQL / SQLite) from database.ts
 * to support client accounts, lead purchases, billing, and delivery filters.
 *
 * Tables:
 *   clients        — buyer accounts with pricing, caps, and licensing
 *   client_filters  — saved delivery preferences per client
 *   lead_purchases  — transaction ledger (lead ↔ client)
 *   client_billing  — invoice/billing period records
 */

import path from "path";
import { createHmac, randomBytes } from "crypto";

// --- Result type (mirrors database.ts) ---
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };
function Ok<T>(value: T): Result<T, never> { return { ok: true, value }; }
function Err<E>(error: E): Result<never, E> { return { ok: false, error }; }

// =============================================================================
// Types
// =============================================================================

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

// =============================================================================
// Helpers
// =============================================================================

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

// =============================================================================
// Row mappers
// =============================================================================

function rowToClient(row: Record<string, unknown>): ClientRecord {
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

function rowToFilters(row: Record<string, unknown>): ClientFilters {
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

function rowToPurchase(row: Record<string, unknown>): LeadPurchase {
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

function rowToBilling(row: Record<string, unknown>): ClientBilling {
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

// =============================================================================
// Database Adapter Interface
// =============================================================================

interface ClientDbAdapter {
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
  updateBillingStatus(billingId: string, status: ClientBilling["paymentStatus"]): Promise<Result<{ updated: boolean }, string>>;

  // Stats
  getClientStats(): Promise<Result<ClientStats, string>>;
  getRevenueByClient(): Promise<Result<Array<{ clientId: string; companyName: string; totalRevenue: number; totalPurchases: number }>, string>>;

  // Balance
  updateClientBalance(clientId: string, amount: number): Promise<Result<{ newBalance: number }, string>>;
}

// =============================================================================
// PostgreSQL Adapter
// =============================================================================

class PostgresClientAdapter implements ClientDbAdapter {
  private pool: import("pg").Pool | null = null;
  private initialized = false;

  private async getPool(): Promise<import("pg").Pool> {
    if (this.pool) return this.pool;
    const { Pool } = await import("pg");
    this.pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ssl: process.env.DATABASE_URL?.includes("sslmode=require")
        || process.env.DATABASE_SSL === "true"
        || process.env.NODE_ENV === "production"
        ? { rejectUnauthorized: false }
        : undefined,
    });
    return this.pool;
  }

  async initialize(): Promise<void> {
    if (this.initialized) return;
    const pool = await this.getPool();

    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        client_id TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        pricing_tier TEXT NOT NULL DEFAULT 'standard',
        price_per_lead INTEGER NOT NULL DEFAULT 2500,
        exclusive_price INTEGER NOT NULL DEFAULT 5000,
        state_licenses TEXT NOT NULL DEFAULT '[]',
        coverage_types TEXT NOT NULL DEFAULT '[]',
        daily_cap INTEGER NOT NULL DEFAULT 50,
        monthly_cap INTEGER NOT NULL DEFAULT 1000,
        min_score INTEGER NOT NULL DEFAULT 0,
        balance INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
        updated_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_filters (
        id SERIAL PRIMARY KEY,
        client_id TEXT UNIQUE NOT NULL REFERENCES clients(client_id),
        states TEXT NOT NULL DEFAULT '[]',
        coverage_types TEXT NOT NULL DEFAULT '[]',
        veteran_only BOOLEAN NOT NULL DEFAULT FALSE,
        min_score INTEGER NOT NULL DEFAULT 0,
        max_lead_age INTEGER NOT NULL DEFAULT 72,
        distribution_mode TEXT NOT NULL DEFAULT 'shared'
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS lead_purchases (
        id SERIAL PRIMARY KEY,
        purchase_id TEXT UNIQUE NOT NULL,
        lead_id TEXT NOT NULL,
        client_id TEXT NOT NULL REFERENCES clients(client_id),
        price_paid INTEGER NOT NULL DEFAULT 0,
        purchased_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
        status TEXT NOT NULL DEFAULT 'delivered',
        exclusive BOOLEAN NOT NULL DEFAULT FALSE,
        return_reason TEXT NOT NULL DEFAULT '',
        return_deadline TEXT NOT NULL DEFAULT ''
      )
    `);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_billing (
        id SERIAL PRIMARY KEY,
        billing_id TEXT UNIQUE NOT NULL,
        client_id TEXT NOT NULL REFERENCES clients(client_id),
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        leads_purchased INTEGER NOT NULL DEFAULT 0,
        total_amount INTEGER NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'pending',
        invoice_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
      )
    `);

    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchases_client ON lead_purchases(client_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchases_lead ON lead_purchases(lead_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_purchases_status ON lead_purchases(status)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_billing_client ON client_billing(client_id)`);

    this.initialized = true;
  }

  async insertClient(client: ClientRecord): Promise<Result<{ clientId: string }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      await pool.query(
        `INSERT INTO clients (client_id, company_name, contact_name, email, phone, password_hash, status, pricing_tier, price_per_lead, exclusive_price, state_licenses, coverage_types, daily_cap, monthly_cap, min_score, balance, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)`,
        [client.clientId, client.companyName, client.contactName, client.email, client.phone, client.passwordHash, client.status, client.pricingTier, client.pricePerLead, client.exclusivePrice, client.stateLicenses, client.coverageTypes, client.dailyCap, client.monthlyCap, client.minScore, client.balance, client.createdAt, client.updatedAt]
      );
      return Ok({ clientId: client.clientId });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Insert failed");
    }
  }

  async getClientById(clientId: string): Promise<Result<ClientRecord | null, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query("SELECT * FROM clients WHERE client_id = $1", [clientId]);
      return Ok(r.rows.length ? rowToClient(r.rows[0]) : null);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query("SELECT * FROM clients WHERE LOWER(email) = LOWER($1)", [email]);
      return Ok(r.rows.length ? rowToClient(r.rows[0]) : null);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async updateClient(clientId: string, updates: Partial<ClientRecord>): Promise<Result<{ updated: boolean }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const fields: string[] = [];
      const values: unknown[] = [];
      let idx = 1;

      const fieldMap: Record<string, string> = {
        companyName: "company_name", contactName: "contact_name", email: "email", phone: "phone",
        status: "status", pricingTier: "pricing_tier", pricePerLead: "price_per_lead",
        exclusivePrice: "exclusive_price", stateLicenses: "state_licenses", coverageTypes: "coverage_types",
        dailyCap: "daily_cap", monthlyCap: "monthly_cap", minScore: "min_score", balance: "balance",
        passwordHash: "password_hash",
      };

      for (const [key, col] of Object.entries(fieldMap)) {
        if (key in updates) {
          fields.push(`${col} = $${idx++}`);
          values.push((updates as Record<string, unknown>)[key]);
        }
      }

      if (fields.length === 0) return Ok({ updated: false });

      fields.push(`updated_at = $${idx++}`);
      values.push(new Date().toISOString());
      values.push(clientId);

      await pool.query(`UPDATE clients SET ${fields.join(", ")} WHERE client_id = $${idx}`, values);
      return Ok({ updated: true });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }

  async getFilteredClients(filters: ClientListFilters): Promise<Result<{ clients: ClientRecord[]; total: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const conditions: string[] = [];
      const params: unknown[] = [];
      let idx = 1;

      if (filters.status) { conditions.push(`status = $${idx++}`); params.push(filters.status); }
      if (filters.search) {
        conditions.push(`(company_name ILIKE $${idx} OR contact_name ILIKE $${idx} OR email ILIKE $${idx})`);
        idx++;
        params.push(`%${filters.search}%`);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;

      const countR = await pool.query(`SELECT COUNT(*) as count FROM clients ${where}`, params);
      const dataR = await pool.query(
        `SELECT * FROM clients ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
        [...params, limit, offset]
      );

      return Ok({ clients: dataR.rows.map(rowToClient), total: parseInt(countR.rows[0].count, 10) });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientFilters(clientId: string): Promise<Result<ClientFilters | null, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query("SELECT * FROM client_filters WHERE client_id = $1", [clientId]);
      return Ok(r.rows.length ? rowToFilters(r.rows[0]) : null);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async upsertClientFilters(filters: ClientFilters): Promise<Result<{ saved: boolean }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      await pool.query(
        `INSERT INTO client_filters (client_id, states, coverage_types, veteran_only, min_score, max_lead_age, distribution_mode)
         VALUES ($1,$2,$3,$4,$5,$6,$7)
         ON CONFLICT (client_id) DO UPDATE SET states=$2, coverage_types=$3, veteran_only=$4, min_score=$5, max_lead_age=$6, distribution_mode=$7`,
        [filters.clientId, filters.states, filters.coverageTypes, filters.veteranOnly, filters.minScore, filters.maxLeadAge, filters.distributionMode]
      );
      return Ok({ saved: true });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Upsert failed");
    }
  }

  async insertPurchase(purchase: LeadPurchase): Promise<Result<{ purchaseId: string }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      await pool.query(
        `INSERT INTO lead_purchases (purchase_id, lead_id, client_id, price_paid, purchased_at, status, exclusive, return_reason, return_deadline)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [purchase.purchaseId, purchase.leadId, purchase.clientId, purchase.pricePaid, purchase.purchasedAt, purchase.status, purchase.exclusive, purchase.returnReason, purchase.returnDeadline]
      );
      return Ok({ purchaseId: purchase.purchaseId });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Insert failed");
    }
  }

  async getPurchasesByClient(clientId: string, limit = 50, offset = 0): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const countR = await pool.query("SELECT COUNT(*) as count FROM lead_purchases WHERE client_id = $1", [clientId]);
      const dataR = await pool.query(
        "SELECT * FROM lead_purchases WHERE client_id = $1 ORDER BY purchased_at DESC LIMIT $2 OFFSET $3",
        [clientId, limit, offset]
      );
      return Ok({ purchases: dataR.rows.map(rowToPurchase), total: parseInt(countR.rows[0].count, 10) });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getPurchasesByLead(leadId: string): Promise<Result<LeadPurchase[], string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query("SELECT * FROM lead_purchases WHERE lead_id = $1 ORDER BY purchased_at DESC", [leadId]);
      return Ok(r.rows.map(rowToPurchase));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async updatePurchaseStatus(purchaseId: string, status: LeadPurchase["status"], returnReason?: string): Promise<Result<{ updated: boolean }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      if (returnReason) {
        await pool.query("UPDATE lead_purchases SET status = $1, return_reason = $2 WHERE purchase_id = $3", [status, returnReason, purchaseId]);
      } else {
        await pool.query("UPDATE lead_purchases SET status = $1 WHERE purchase_id = $2", [status, purchaseId]);
      }
      return Ok({ updated: true });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }

  async getAllPurchases(limit = 50, offset = 0, status?: string): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const where = status ? "WHERE status = $1" : "";
      const params = status ? [status] : [];
      const countR = await pool.query(`SELECT COUNT(*) as count FROM lead_purchases ${where}`, params);
      const idx = params.length + 1;
      const dataR = await pool.query(
        `SELECT * FROM lead_purchases ${where} ORDER BY purchased_at DESC LIMIT $${idx} OFFSET $${idx + 1}`,
        [...params, limit, offset]
      );
      return Ok({ purchases: dataR.rows.map(rowToPurchase), total: parseInt(countR.rows[0].count, 10) });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientDailyPurchaseCount(clientId: string): Promise<Result<number, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query(
        "SELECT COUNT(*) as c FROM lead_purchases WHERE client_id = $1 AND purchased_at::date = CURRENT_DATE AND status != 'returned'",
        [clientId]
      );
      return Ok(parseInt(r.rows[0].c, 10));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientMonthlyPurchaseCount(clientId: string): Promise<Result<number, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query(
        "SELECT COUNT(*) as c FROM lead_purchases WHERE client_id = $1 AND purchased_at::date >= CURRENT_DATE - INTERVAL '30 days' AND status != 'returned'",
        [clientId]
      );
      return Ok(parseInt(r.rows[0].c, 10));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async insertBilling(billing: ClientBilling): Promise<Result<{ billingId: string }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      await pool.query(
        `INSERT INTO client_billing (billing_id, client_id, period_start, period_end, leads_purchased, total_amount, payment_status, invoice_url, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [billing.billingId, billing.clientId, billing.periodStart, billing.periodEnd, billing.leadsPurchased, billing.totalAmount, billing.paymentStatus, billing.invoiceUrl, billing.createdAt]
      );
      return Ok({ billingId: billing.billingId });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Insert failed");
    }
  }

  async getBillingByClient(clientId: string, limit = 12): Promise<Result<ClientBilling[], string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query(
        "SELECT * FROM client_billing WHERE client_id = $1 ORDER BY created_at DESC LIMIT $2",
        [clientId, limit]
      );
      return Ok(r.rows.map(rowToBilling));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async updateBillingStatus(billingId: string, status: ClientBilling["paymentStatus"]): Promise<Result<{ updated: boolean }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      await pool.query("UPDATE client_billing SET payment_status = $1 WHERE billing_id = $2", [status, billingId]);
      return Ok({ updated: true });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }

  async getClientStats(): Promise<Result<ClientStats, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const totalClients = parseInt((await pool.query("SELECT COUNT(*) as c FROM clients")).rows[0].c, 10);
      const activeClients = parseInt((await pool.query("SELECT COUNT(*) as c FROM clients WHERE status = 'active'")).rows[0].c, 10);
      const totalPurchases = parseInt((await pool.query("SELECT COUNT(*) as c FROM lead_purchases")).rows[0].c, 10);
      const totalRevR = await pool.query("SELECT COALESCE(SUM(price_paid),0) as s FROM lead_purchases WHERE status != 'returned'");
      const totalRevenue = parseInt(totalRevR.rows[0].s, 10);
      const monthRevR = await pool.query("SELECT COALESCE(SUM(price_paid),0) as s FROM lead_purchases WHERE status != 'returned' AND purchased_at::date >= CURRENT_DATE - INTERVAL '30 days'");
      const revenueThisMonth = parseInt(monthRevR.rows[0].s, 10);
      const monthPurchR = await pool.query("SELECT COUNT(*) as c FROM lead_purchases WHERE purchased_at::date >= CURRENT_DATE - INTERVAL '30 days'");
      const purchasesThisMonth = parseInt(monthPurchR.rows[0].c, 10);
      const disputesR = await pool.query("SELECT COUNT(*) as c FROM lead_purchases WHERE status = 'disputed'");
      const disputesOpen = parseInt(disputesR.rows[0].c, 10);

      return Ok({ totalClients, activeClients, totalPurchases, totalRevenue, revenueThisMonth, purchasesThisMonth, disputesOpen });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Stats failed");
    }
  }

  async getRevenueByClient(): Promise<Result<Array<{ clientId: string; companyName: string; totalRevenue: number; totalPurchases: number }>, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query(
        `SELECT c.client_id, c.company_name, COALESCE(SUM(p.price_paid),0) as total_revenue, COUNT(p.id) as total_purchases
         FROM clients c LEFT JOIN lead_purchases p ON c.client_id = p.client_id AND p.status != 'returned'
         GROUP BY c.client_id, c.company_name ORDER BY total_revenue DESC`
      );
      return Ok(r.rows.map((row: Record<string, unknown>) => ({
        clientId: row.client_id as string,
        companyName: row.company_name as string,
        totalRevenue: parseInt(row.total_revenue as string, 10),
        totalPurchases: parseInt(row.total_purchases as string, 10),
      })));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async updateClientBalance(clientId: string, amount: number): Promise<Result<{ newBalance: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query(
        "UPDATE clients SET balance = balance + $1, updated_at = $2 WHERE client_id = $3 RETURNING balance",
        [amount, new Date().toISOString(), clientId]
      );
      if (r.rows.length === 0) return Err("Client not found");
      return Ok({ newBalance: parseInt(r.rows[0].balance, 10) });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }
}

// =============================================================================
// SQLite Adapter
// =============================================================================

class SqliteClientAdapter implements ClientDbAdapter {
  private db: import("better-sqlite3").Database | null = null;

  private getDb(): import("better-sqlite3").Database {
    if (this.db) return this.db;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const fs = require("fs");
    const IS_VERCEL = !!process.env.VERCEL;
    const DB_DIR = IS_VERCEL ? path.join("/tmp", ".cathedral") : path.join(process.cwd(), ".cathedral");
    const DB_PATH = path.join(DB_DIR, "leads.db");
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    this.db = new Database(DB_PATH);
    this.db!.pragma("journal_mode = WAL");
    this.db!.pragma("foreign_keys = ON");
    return this.db!;
  }

  async initialize(): Promise<void> {
    const db = this.getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT UNIQUE NOT NULL,
        company_name TEXT NOT NULL,
        contact_name TEXT NOT NULL,
        email TEXT UNIQUE NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        pricing_tier TEXT NOT NULL DEFAULT 'standard',
        price_per_lead INTEGER NOT NULL DEFAULT 2500,
        exclusive_price INTEGER NOT NULL DEFAULT 5000,
        state_licenses TEXT NOT NULL DEFAULT '[]',
        coverage_types TEXT NOT NULL DEFAULT '[]',
        daily_cap INTEGER NOT NULL DEFAULT 50,
        monthly_cap INTEGER NOT NULL DEFAULT 1000,
        min_score INTEGER NOT NULL DEFAULT 0,
        balance INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE TABLE IF NOT EXISTS client_filters (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id TEXT UNIQUE NOT NULL REFERENCES clients(client_id),
        states TEXT NOT NULL DEFAULT '[]',
        coverage_types TEXT NOT NULL DEFAULT '[]',
        veteran_only INTEGER NOT NULL DEFAULT 0,
        min_score INTEGER NOT NULL DEFAULT 0,
        max_lead_age INTEGER NOT NULL DEFAULT 72,
        distribution_mode TEXT NOT NULL DEFAULT 'shared'
      );

      CREATE TABLE IF NOT EXISTS lead_purchases (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_id TEXT UNIQUE NOT NULL,
        lead_id TEXT NOT NULL,
        client_id TEXT NOT NULL REFERENCES clients(client_id),
        price_paid INTEGER NOT NULL DEFAULT 0,
        purchased_at TEXT NOT NULL DEFAULT (datetime('now')),
        status TEXT NOT NULL DEFAULT 'delivered',
        exclusive INTEGER NOT NULL DEFAULT 0,
        return_reason TEXT NOT NULL DEFAULT '',
        return_deadline TEXT NOT NULL DEFAULT ''
      );

      CREATE TABLE IF NOT EXISTS client_billing (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        billing_id TEXT UNIQUE NOT NULL,
        client_id TEXT NOT NULL REFERENCES clients(client_id),
        period_start TEXT NOT NULL,
        period_end TEXT NOT NULL,
        leads_purchased INTEGER NOT NULL DEFAULT 0,
        total_amount INTEGER NOT NULL DEFAULT 0,
        payment_status TEXT NOT NULL DEFAULT 'pending',
        invoice_url TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
      CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
      CREATE INDEX IF NOT EXISTS idx_purchases_client ON lead_purchases(client_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_lead ON lead_purchases(lead_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_status ON lead_purchases(status);
      CREATE INDEX IF NOT EXISTS idx_billing_client ON client_billing(client_id);
    `);
  }

  async insertClient(client: ClientRecord): Promise<Result<{ clientId: string }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      db.prepare(
        `INSERT INTO clients (client_id, company_name, contact_name, email, phone, password_hash, status, pricing_tier, price_per_lead, exclusive_price, state_licenses, coverage_types, daily_cap, monthly_cap, min_score, balance, created_at, updated_at)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
      ).run(client.clientId, client.companyName, client.contactName, client.email, client.phone, client.passwordHash, client.status, client.pricingTier, client.pricePerLead, client.exclusivePrice, client.stateLicenses, client.coverageTypes, client.dailyCap, client.monthlyCap, client.minScore, client.balance, client.createdAt, client.updatedAt);
      return Ok({ clientId: client.clientId });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Insert failed");
    }
  }

  async getClientById(clientId: string): Promise<Result<ClientRecord | null, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const row = db.prepare("SELECT * FROM clients WHERE client_id = ?").get(clientId) as Record<string, unknown> | undefined;
      return Ok(row ? rowToClient(row) : null);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const row = db.prepare("SELECT * FROM clients WHERE LOWER(email) = LOWER(?)").get(email) as Record<string, unknown> | undefined;
      return Ok(row ? rowToClient(row) : null);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async updateClient(clientId: string, updates: Partial<ClientRecord>): Promise<Result<{ updated: boolean }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const fields: string[] = [];
      const values: unknown[] = [];

      const fieldMap: Record<string, string> = {
        companyName: "company_name", contactName: "contact_name", email: "email", phone: "phone",
        status: "status", pricingTier: "pricing_tier", pricePerLead: "price_per_lead",
        exclusivePrice: "exclusive_price", stateLicenses: "state_licenses", coverageTypes: "coverage_types",
        dailyCap: "daily_cap", monthlyCap: "monthly_cap", minScore: "min_score", balance: "balance",
        passwordHash: "password_hash",
      };

      for (const [key, col] of Object.entries(fieldMap)) {
        if (key in updates) {
          fields.push(`${col} = ?`);
          values.push((updates as Record<string, unknown>)[key]);
        }
      }

      if (fields.length === 0) return Ok({ updated: false });

      fields.push("updated_at = ?");
      values.push(new Date().toISOString());
      values.push(clientId);

      db.prepare(`UPDATE clients SET ${fields.join(", ")} WHERE client_id = ?`).run(...values);
      return Ok({ updated: true });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }

  async getFilteredClients(filters: ClientListFilters): Promise<Result<{ clients: ClientRecord[]; total: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters.status) { conditions.push("status = ?"); params.push(filters.status); }
      if (filters.search) {
        conditions.push("(company_name LIKE ? OR contact_name LIKE ? OR email LIKE ?)");
        const term = `%${filters.search}%`;
        params.push(term, term, term);
      }

      const where = conditions.length ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;

      const countRow = db.prepare(`SELECT COUNT(*) as count FROM clients ${where}`).get(...params) as { count: number };
      const rows = db.prepare(`SELECT * FROM clients ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Record<string, unknown>[];

      return Ok({ clients: rows.map(rowToClient), total: countRow.count });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientFilters(clientId: string): Promise<Result<ClientFilters | null, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const row = db.prepare("SELECT * FROM client_filters WHERE client_id = ?").get(clientId) as Record<string, unknown> | undefined;
      return Ok(row ? rowToFilters(row) : null);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async upsertClientFilters(filters: ClientFilters): Promise<Result<{ saved: boolean }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      db.prepare(
        `INSERT INTO client_filters (client_id, states, coverage_types, veteran_only, min_score, max_lead_age, distribution_mode)
         VALUES (?,?,?,?,?,?,?)
         ON CONFLICT (client_id) DO UPDATE SET states=excluded.states, coverage_types=excluded.coverage_types, veteran_only=excluded.veteran_only, min_score=excluded.min_score, max_lead_age=excluded.max_lead_age, distribution_mode=excluded.distribution_mode`
      ).run(filters.clientId, filters.states, filters.coverageTypes, filters.veteranOnly ? 1 : 0, filters.minScore, filters.maxLeadAge, filters.distributionMode);
      return Ok({ saved: true });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Upsert failed");
    }
  }

  async insertPurchase(purchase: LeadPurchase): Promise<Result<{ purchaseId: string }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      db.prepare(
        `INSERT INTO lead_purchases (purchase_id, lead_id, client_id, price_paid, purchased_at, status, exclusive, return_reason, return_deadline)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run(purchase.purchaseId, purchase.leadId, purchase.clientId, purchase.pricePaid, purchase.purchasedAt, purchase.status, purchase.exclusive ? 1 : 0, purchase.returnReason, purchase.returnDeadline);
      return Ok({ purchaseId: purchase.purchaseId });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Insert failed");
    }
  }

  async getPurchasesByClient(clientId: string, limit = 50, offset = 0): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const countRow = db.prepare("SELECT COUNT(*) as count FROM lead_purchases WHERE client_id = ?").get(clientId) as { count: number };
      const rows = db.prepare("SELECT * FROM lead_purchases WHERE client_id = ? ORDER BY purchased_at DESC LIMIT ? OFFSET ?").all(clientId, limit, offset) as Record<string, unknown>[];
      return Ok({ purchases: rows.map(rowToPurchase), total: countRow.count });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getPurchasesByLead(leadId: string): Promise<Result<LeadPurchase[], string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const rows = db.prepare("SELECT * FROM lead_purchases WHERE lead_id = ? ORDER BY purchased_at DESC").all(leadId) as Record<string, unknown>[];
      return Ok(rows.map(rowToPurchase));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async updatePurchaseStatus(purchaseId: string, status: LeadPurchase["status"], returnReason?: string): Promise<Result<{ updated: boolean }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      if (returnReason) {
        db.prepare("UPDATE lead_purchases SET status = ?, return_reason = ? WHERE purchase_id = ?").run(status, returnReason, purchaseId);
      } else {
        db.prepare("UPDATE lead_purchases SET status = ? WHERE purchase_id = ?").run(status, purchaseId);
      }
      return Ok({ updated: true });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }

  async getAllPurchases(limit = 50, offset = 0, status?: string): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const where = status ? "WHERE status = ?" : "";
      const params = status ? [status] : [];
      const countRow = db.prepare(`SELECT COUNT(*) as count FROM lead_purchases ${where}`).get(...params) as { count: number };
      const rows = db.prepare(`SELECT * FROM lead_purchases ${where} ORDER BY purchased_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Record<string, unknown>[];
      return Ok({ purchases: rows.map(rowToPurchase), total: countRow.count });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientDailyPurchaseCount(clientId: string): Promise<Result<number, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const row = db.prepare("SELECT COUNT(*) as c FROM lead_purchases WHERE client_id = ? AND purchased_at >= date('now') AND status != 'returned'").get(clientId) as { c: number };
      return Ok(row.c);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientMonthlyPurchaseCount(clientId: string): Promise<Result<number, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const row = db.prepare("SELECT COUNT(*) as c FROM lead_purchases WHERE client_id = ? AND purchased_at >= date('now', '-30 days') AND status != 'returned'").get(clientId) as { c: number };
      return Ok(row.c);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async insertBilling(billing: ClientBilling): Promise<Result<{ billingId: string }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      db.prepare(
        `INSERT INTO client_billing (billing_id, client_id, period_start, period_end, leads_purchased, total_amount, payment_status, invoice_url, created_at)
         VALUES (?,?,?,?,?,?,?,?,?)`
      ).run(billing.billingId, billing.clientId, billing.periodStart, billing.periodEnd, billing.leadsPurchased, billing.totalAmount, billing.paymentStatus, billing.invoiceUrl, billing.createdAt);
      return Ok({ billingId: billing.billingId });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Insert failed");
    }
  }

  async getBillingByClient(clientId: string, limit = 12): Promise<Result<ClientBilling[], string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const rows = db.prepare("SELECT * FROM client_billing WHERE client_id = ? ORDER BY created_at DESC LIMIT ?").all(clientId, limit) as Record<string, unknown>[];
      return Ok(rows.map(rowToBilling));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async updateBillingStatus(billingId: string, status: ClientBilling["paymentStatus"]): Promise<Result<{ updated: boolean }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      db.prepare("UPDATE client_billing SET payment_status = ? WHERE billing_id = ?").run(status, billingId);
      return Ok({ updated: true });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }

  async getClientStats(): Promise<Result<ClientStats, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const totalClients = (db.prepare("SELECT COUNT(*) as c FROM clients").get() as { c: number }).c;
      const activeClients = (db.prepare("SELECT COUNT(*) as c FROM clients WHERE status = 'active'").get() as { c: number }).c;
      const totalPurchases = (db.prepare("SELECT COUNT(*) as c FROM lead_purchases").get() as { c: number }).c;
      const totalRevenue = (db.prepare("SELECT COALESCE(SUM(price_paid),0) as s FROM lead_purchases WHERE status != 'returned'").get() as { s: number }).s;
      const revenueThisMonth = (db.prepare("SELECT COALESCE(SUM(price_paid),0) as s FROM lead_purchases WHERE status != 'returned' AND purchased_at >= date('now', '-30 days')").get() as { s: number }).s;
      const purchasesThisMonth = (db.prepare("SELECT COUNT(*) as c FROM lead_purchases WHERE purchased_at >= date('now', '-30 days')").get() as { c: number }).c;
      const disputesOpen = (db.prepare("SELECT COUNT(*) as c FROM lead_purchases WHERE status = 'disputed'").get() as { c: number }).c;

      return Ok({ totalClients, activeClients, totalPurchases, totalRevenue, revenueThisMonth, purchasesThisMonth, disputesOpen });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Stats failed");
    }
  }

  async getRevenueByClient(): Promise<Result<Array<{ clientId: string; companyName: string; totalRevenue: number; totalPurchases: number }>, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const rows = db.prepare(
        `SELECT c.client_id, c.company_name, COALESCE(SUM(p.price_paid),0) as total_revenue, COUNT(p.id) as total_purchases
         FROM clients c LEFT JOIN lead_purchases p ON c.client_id = p.client_id AND p.status != 'returned'
         GROUP BY c.client_id, c.company_name ORDER BY total_revenue DESC`
      ).all() as Array<Record<string, unknown>>;
      return Ok(rows.map((row) => ({
        clientId: row.client_id as string,
        companyName: row.company_name as string,
        totalRevenue: Number(row.total_revenue),
        totalPurchases: Number(row.total_purchases),
      })));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async updateClientBalance(clientId: string, amount: number): Promise<Result<{ newBalance: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      db.prepare("UPDATE clients SET balance = balance + ?, updated_at = ? WHERE client_id = ?").run(amount, new Date().toISOString(), clientId);
      const row = db.prepare("SELECT balance FROM clients WHERE client_id = ?").get(clientId) as { balance: number } | undefined;
      if (!row) return Err("Client not found");
      return Ok({ newBalance: row.balance });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }
}

// =============================================================================
// Noop Adapter
// =============================================================================

class NoopClientAdapter implements ClientDbAdapter {
  async initialize(): Promise<void> {}

  insertClient(client: ClientRecord): Promise<Result<{ clientId: string }, string>> {
    return Promise.resolve(Ok({ clientId: client.clientId }));
  }

  async getClientById(clientId: string): Promise<Result<ClientRecord | null, string>> {
    const { DEMO_CLIENT } = await import("./demo-client");
    return Ok(clientId === DEMO_CLIENT.clientId ? DEMO_CLIENT : null);
  }

  async getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>> {
    const { DEMO_CLIENT } = await import("./demo-client");
    return Ok(email === DEMO_CLIENT.email ? DEMO_CLIENT : null);
  }

  updateClient(): Promise<Result<{ updated: boolean }, string>> {
    return Promise.resolve(Ok({ updated: true }));
  }

  async getFilteredClients(): Promise<Result<{ clients: ClientRecord[]; total: number }, string>> {
    const { DEMO_CLIENT } = await import("./demo-client");
    return Ok({ clients: [DEMO_CLIENT], total: 1 });
  }

  async getClientFilters(clientId: string): Promise<Result<ClientFilters | null, string>> {
    const { DEMO_CLIENT_FILTERS } = await import("./demo-client");
    return Ok(clientId === DEMO_CLIENT_FILTERS.clientId ? DEMO_CLIENT_FILTERS : null);
  }

  upsertClientFilters(): Promise<Result<{ saved: boolean }, string>> {
    return Promise.resolve(Ok({ saved: true }));
  }

  insertPurchase(): Promise<Result<{ purchaseId: string }, string>> {
    return Promise.resolve(Ok({ purchaseId: "purchase_demo_001" }));
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

  insertBilling(): Promise<Result<{ billingId: string }, string>> {
    return Promise.resolve(Ok({ billingId: "billing_demo_001" }));
  }

  async getBillingByClient(): Promise<Result<ClientBilling[], string>> {
    return Ok([]);
  }

  updateBillingStatus(): Promise<Result<{ updated: boolean }, string>> {
    return Promise.resolve(Ok({ updated: true }));
  }

  async getClientStats(): Promise<Result<ClientStats, string>> {
    const { getDemoClientStats } = await import("./demo-client");
    return Ok(getDemoClientStats());
  }

  async getRevenueByClient(): Promise<Result<Array<{ clientId: string; companyName: string; totalRevenue: number; totalPurchases: number }>, string>> {
    const { DEMO_CLIENT } = await import("./demo-client");
    return Ok([{ clientId: DEMO_CLIENT.clientId, companyName: DEMO_CLIENT.companyName, totalRevenue: 0, totalPurchases: 0 }]);
  }

  updateClientBalance(): Promise<Result<{ newBalance: number }, string>> {
    return Promise.resolve(Ok({ newBalance: 50000 }));
  }
}

// =============================================================================
// Adapter Selection — singleton
// =============================================================================

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

// =============================================================================
// Exported functions
// =============================================================================

export async function createClient(client: ClientRecord) { return getClientAdapter().insertClient(client); }
export async function getClientById(clientId: string) { return getClientAdapter().getClientById(clientId); }
export async function getClientByEmail(email: string) { return getClientAdapter().getClientByEmail(email); }
export async function updateClient(clientId: string, updates: Partial<ClientRecord>) { return getClientAdapter().updateClient(clientId, updates); }
export async function getFilteredClients(filters: ClientListFilters) { return getClientAdapter().getFilteredClients(filters); }
export async function getClientFilters(clientId: string) { return getClientAdapter().getClientFilters(clientId); }
export async function upsertClientFilters(filters: ClientFilters) { return getClientAdapter().upsertClientFilters(filters); }
export async function createPurchase(purchase: LeadPurchase) { return getClientAdapter().insertPurchase(purchase); }
export async function getPurchasesByClient(clientId: string, limit?: number, offset?: number) { return getClientAdapter().getPurchasesByClient(clientId, limit, offset); }
export async function getPurchasesByLead(leadId: string) { return getClientAdapter().getPurchasesByLead(leadId); }
export async function updatePurchaseStatus(purchaseId: string, status: LeadPurchase["status"], returnReason?: string) { return getClientAdapter().updatePurchaseStatus(purchaseId, status, returnReason); }
export async function getAllPurchases(limit?: number, offset?: number, status?: string) { return getClientAdapter().getAllPurchases(limit, offset, status); }
export async function getClientDailyPurchaseCount(clientId: string) { return getClientAdapter().getClientDailyPurchaseCount(clientId); }
export async function getClientMonthlyPurchaseCount(clientId: string) { return getClientAdapter().getClientMonthlyPurchaseCount(clientId); }
export async function createBilling(billing: ClientBilling) { return getClientAdapter().insertBilling(billing); }
export async function getBillingByClient(clientId: string, limit?: number) { return getClientAdapter().getBillingByClient(clientId, limit); }
export async function updateBillingStatus(billingId: string, status: ClientBilling["paymentStatus"]) { return getClientAdapter().updateBillingStatus(billingId, status); }
export async function getClientStats() { return getClientAdapter().getClientStats(); }
export async function getRevenueByClient() { return getClientAdapter().getRevenueByClient(); }
export async function updateClientBalance(clientId: string, amount: number) { return getClientAdapter().updateClientBalance(clientId, amount); }
