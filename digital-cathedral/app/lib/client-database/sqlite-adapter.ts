/**
 * Client Database — SQLite adapter (better-sqlite3).
 *
 * Used for local dev and any environment without DATABASE_URL. The driver
 * is loaded lazily inside getDb() so production never pulls better-sqlite3.
 */

import path from "path";
import type {
  ClientRecord,
  ClientFilters,
  LeadPurchase,
  ClientListFilters,
  ClientStats,
  ClientDbAdapter,
  GuardedPurchaseOutcome,
  Result,
} from "./types";
import { Ok, Err } from "./types";
import { rowToClient, rowToFilters, rowToPurchase } from "./helpers";

export class SqliteClientAdapter implements ClientDbAdapter {
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

      CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);
      CREATE INDEX IF NOT EXISTS idx_clients_status ON clients(status);
      CREATE INDEX IF NOT EXISTS idx_purchases_client ON lead_purchases(client_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_lead ON lead_purchases(lead_id);
      CREATE INDEX IF NOT EXISTS idx_purchases_status ON lead_purchases(status);
    `);

    // Seed demo client if table is empty (local dev without DATABASE_URL)
    const count = db.prepare("SELECT COUNT(*) as n FROM clients").get() as { n: number };
    if (count.n === 0) {
      try {
        const { DEMO_CLIENT } = await import("../demo-client");
        db.prepare(
          `INSERT INTO clients (client_id, company_name, contact_name, email, phone, password_hash, status, pricing_tier, price_per_lead, exclusive_price, state_licenses, coverage_types, daily_cap, monthly_cap, min_score, balance, created_at, updated_at)
           VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`
        ).run(DEMO_CLIENT.clientId, DEMO_CLIENT.companyName, DEMO_CLIENT.contactName, DEMO_CLIENT.email, DEMO_CLIENT.phone, DEMO_CLIENT.passwordHash, DEMO_CLIENT.status, DEMO_CLIENT.pricingTier, DEMO_CLIENT.pricePerLead, DEMO_CLIENT.exclusivePrice, DEMO_CLIENT.stateLicenses, DEMO_CLIENT.coverageTypes, DEMO_CLIENT.dailyCap, DEMO_CLIENT.monthlyCap, DEMO_CLIENT.minScore, DEMO_CLIENT.balance, DEMO_CLIENT.createdAt, DEMO_CLIENT.updatedAt);
        console.log("[client-database] Seeded demo client: testclient@valorlegacies.com");
      } catch {
        // Demo client seeding is best-effort
      }
    }
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

  async insertPurchaseGuarded(purchase: LeadPurchase, maxBuyers: number): Promise<Result<GuardedPurchaseOutcome, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      // BEGIN IMMEDIATE takes the write lock up front, so the capacity read
      // and the insert are one atomic step — a concurrent fulfillment for the
      // same lead waits here rather than racing the check.
      const txn = db.transaction((): GuardedPurchaseOutcome => {
        const dup = db.prepare("SELECT * FROM lead_purchases WHERE purchase_id = ?").get(purchase.purchaseId) as Record<string, unknown> | undefined;
        if (dup) return { outcome: "duplicate", purchase: rowToPurchase(dup) };

        const delivered = db.prepare("SELECT exclusive FROM lead_purchases WHERE lead_id = ? AND status = 'delivered'").all(purchase.leadId) as Array<{ exclusive: number }>;
        const exclusiveHeld = delivered.some((r) => r.exclusive === 1);
        const blocked = purchase.exclusive
          ? delivered.length > 0
          : exclusiveHeld || delivered.length >= maxBuyers;
        if (blocked) return { outcome: "sold_out" };

        db.prepare(
          `INSERT INTO lead_purchases (purchase_id, lead_id, client_id, price_paid, purchased_at, status, exclusive, return_reason, return_deadline)
           VALUES (?,?,?,?,?,?,?,?,?)`
        ).run(purchase.purchaseId, purchase.leadId, purchase.clientId, purchase.pricePaid, purchase.purchasedAt, purchase.status, purchase.exclusive ? 1 : 0, purchase.returnReason, purchase.returnDeadline);
        return { outcome: "inserted", purchase };
      });
      return Ok(txn.immediate());
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

}
