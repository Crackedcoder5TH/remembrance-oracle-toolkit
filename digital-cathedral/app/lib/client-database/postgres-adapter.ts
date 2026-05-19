/**
 * Client Database — PostgreSQL adapter.
 *
 * Used in production / any environment with DATABASE_URL set. The `pg`
 * Pool is loaded lazily so non-Postgres deploys never pull the driver.
 */

import type {
  ClientRecord,
  ClientFilters,
  LeadPurchase,
  ClientBilling,
  ClientListFilters,
  ClientStats,
  ClientDbAdapter,
  GuardedPurchaseOutcome,
  Result,
} from "./types";
import { Ok, Err } from "./types";
import { rowToClient, rowToFilters, rowToPurchase, rowToBilling } from "./helpers";

export class PostgresClientAdapter implements ClientDbAdapter {
  private pool: import("pg").Pool | null = null;
  // Memoize the in-flight init so concurrent callers share one Pool.
  private poolInit: Promise<import("pg").Pool> | null = null;
  private initialized = false;

  private getPool(): Promise<import("pg").Pool> {
    if (this.pool) return Promise.resolve(this.pool);
    if (this.poolInit) return this.poolInit;

    this.poolInit = (async () => {
      const { Pool } = await import("pg");
      const created = new Pool({
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
      this.pool = created;
      return created;
    })();
    this.poolInit.catch(() => { this.poolInit = null; });
    return this.poolInit;
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

  async insertPurchaseGuarded(purchase: LeadPurchase, maxBuyers: number): Promise<Result<GuardedPurchaseOutcome, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        // Serialize fulfillment per lead: concurrent transactions for the same
        // lead queue on this advisory lock (released at COMMIT/ROLLBACK), so
        // the capacity check and insert below cannot interleave. Different
        // leads hash to different keys and never block each other.
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [purchase.leadId]);

        const dup = await client.query("SELECT * FROM lead_purchases WHERE purchase_id = $1", [purchase.purchaseId]);
        if (dup.rows.length > 0) {
          await client.query("COMMIT");
          return Ok({ outcome: "duplicate", purchase: rowToPurchase(dup.rows[0]) });
        }

        const delivered = await client.query("SELECT exclusive FROM lead_purchases WHERE lead_id = $1 AND status = 'delivered'", [purchase.leadId]);
        const exclusiveHeld = delivered.rows.some((r: { exclusive: boolean }) => r.exclusive);
        const blocked = purchase.exclusive
          ? delivered.rows.length > 0
          : exclusiveHeld || delivered.rows.length >= maxBuyers;
        if (blocked) {
          await client.query("COMMIT");
          return Ok({ outcome: "sold_out" });
        }

        await client.query(
          `INSERT INTO lead_purchases (purchase_id, lead_id, client_id, price_paid, purchased_at, status, exclusive, return_reason, return_deadline)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
          [purchase.purchaseId, purchase.leadId, purchase.clientId, purchase.pricePaid, purchase.purchasedAt, purchase.status, purchase.exclusive, purchase.returnReason, purchase.returnDeadline]
        );
        await client.query("COMMIT");
        return Ok({ outcome: "inserted", purchase });
      } catch (err) {
        await client.query("ROLLBACK").catch(() => {});
        return Err(err instanceof Error ? err.message : "Insert failed");
      } finally {
        client.release();
      }
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

  async getBillingById(billingId: string): Promise<Result<ClientBilling | null, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const r = await pool.query("SELECT * FROM client_billing WHERE billing_id = $1", [billingId]);
      return Ok(r.rows.length > 0 ? rowToBilling(r.rows[0]) : null);
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
