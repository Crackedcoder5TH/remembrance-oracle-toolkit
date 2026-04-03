/**
 * Lead Database — Dual-Mode Persistence Layer
 *
 * Adapter pattern:
 * - When DATABASE_URL is set → PostgreSQL via `pg` (node-postgres) with connection pooling
 * - When DATABASE_URL is not set → SQLite via better-sqlite3 (local dev fallback)
 *
 * All exported functions are async (return Promise<Result<...>>).
 */
import path from "path";

// --- Result type for typed error handling ---
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
}

// --- Client (portal user) record types ---
export interface ClientRecord {
  id: number;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string;
  phone: string;
  state: string;
  status: "active" | "suspended";
  createdAt: string;
  updatedAt: string;
}

export interface ClientMessage {
  id: number;
  clientId: number;
  direction: "inbound" | "outbound";
  subject: string;
  body: string;
  read: boolean;
  createdAt: string;
}

export interface ClientDocument {
  id: number;
  clientId: number;
  name: string;
  type: string;
  url: string;
  uploadedAt: string;
}

// --- Lead record types ---
export interface LeadRecord {
  leadId: string;
  firstName: string;
  lastName: string;
  dateOfBirth: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  purchaseIntent: string;
  veteranStatus: string;
  militaryBranch: string;
  consentTcpa: boolean;
  consentPrivacy: boolean;
  consentTimestamp: string;
  consentText: string;
  consentIp: string;
  consentUserAgent: string;
  consentPageUrl: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmTerm: string | null;
  utmContent: string | null;
  createdAt: string;
}

// --- Admin filter and stats types ---
export interface LeadFilters {
  state?: string;
  coverageInterest?: string;
  veteranStatus?: string;
  search?: string; // search firstName, lastName, or email
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface LeadStats {
  total: number;
  today: number;
  thisWeek: number;
  thisMonth: number;
  byState: Record<string, number>;
  byCoverage: Record<string, number>;
  byVeteranStatus: Record<string, number>;
}

// =============================================================================
// Database Adapter Interface
// =============================================================================

interface DbAdapter {
  initialize(): Promise<void>;
  insertLead(lead: LeadRecord): Promise<Result<{ id: number; leadId: string }, string>>;
  getLeadById(leadId: string): Promise<Result<LeadRecord | null, string>>;
  getLeadsByEmail(email: string): Promise<Result<LeadRecord[], string>>;
  getRecentLeads(limit: number): Promise<Result<LeadRecord[], string>>;
  getLeadCount(): Promise<Result<number, string>>;
  getFilteredLeads(filters: LeadFilters): Promise<Result<{ leads: LeadRecord[]; total: number }, string>>;
  getLeadStats(): Promise<Result<LeadStats, string>>;
  deleteLeadByEmail(email: string): Promise<Result<{ deleted: number }, string>>;
  deleteLeadById(leadId: string): Promise<Result<{ deleted: number }, string>>;

  // --- Client (portal) methods ---
  createClient(client: Omit<ClientRecord, "id" | "status" | "createdAt" | "updatedAt">): Promise<Result<{ id: number }, string>>;
  getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>>;
  getClientById(id: number): Promise<Result<ClientRecord | null, string>>;
  getClientLeads(email: string): Promise<Result<LeadRecord[], string>>;
  getClientMessages(clientId: number): Promise<Result<ClientMessage[], string>>;
  createClientMessage(msg: Omit<ClientMessage, "id" | "read" | "createdAt">): Promise<Result<{ id: number }, string>>;
  markMessageRead(messageId: number, clientId: number): Promise<Result<void, string>>;
  getClientDocuments(clientId: number): Promise<Result<ClientDocument[], string>>;
  createClientDocument(doc: Omit<ClientDocument, "id" | "uploadedAt">): Promise<Result<{ id: number }, string>>;
}

// =============================================================================
// Row mapper (shared between adapters)
// =============================================================================

function rowToLead(row: Record<string, unknown>): LeadRecord {
  return {
    leadId: row.lead_id as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    dateOfBirth: (row.date_of_birth as string) || "",
    email: row.email as string,
    phone: row.phone as string,
    state: row.state as string,
    coverageInterest: row.coverage_interest as string,
    purchaseIntent: (row.purchase_intent as string) || "",
    veteranStatus: (row.veteran_status as string) || "",
    militaryBranch: (row.military_branch as string) || "",
    consentTcpa: row.consent_tcpa === 1 || row.consent_tcpa === true,
    consentPrivacy: row.consent_privacy === 1 || row.consent_privacy === true,
    consentTimestamp: row.consent_timestamp as string,
    consentText: row.consent_text as string,
    consentIp: row.consent_ip as string,
    consentUserAgent: row.consent_user_agent as string,
    consentPageUrl: row.consent_page_url as string,
    utmSource: (row.utm_source as string) || null,
    utmMedium: (row.utm_medium as string) || null,
    utmCampaign: (row.utm_campaign as string) || null,
    utmTerm: (row.utm_term as string) || null,
    utmContent: (row.utm_content as string) || null,
    createdAt: row.created_at as string,
  };
}

function rowToClient(row: Record<string, unknown>): ClientRecord {
  return {
    id: row.id as number,
    email: row.email as string,
    passwordHash: row.password_hash as string,
    firstName: row.first_name as string,
    lastName: row.last_name as string,
    phone: (row.phone as string) || "",
    state: (row.state as string) || "",
    status: (row.status as "active" | "suspended") || "active",
    createdAt: row.created_at as string,
    updatedAt: row.updated_at as string,
  };
}

function rowToMessage(row: Record<string, unknown>): ClientMessage {
  return {
    id: row.id as number,
    clientId: row.client_id as number,
    direction: row.direction as "inbound" | "outbound",
    subject: (row.subject as string) || "",
    body: row.body as string,
    read: row.read === true || row.read === 1,
    createdAt: row.created_at as string,
  };
}

function rowToDocument(row: Record<string, unknown>): ClientDocument {
  return {
    id: row.id as number,
    clientId: row.client_id as number,
    name: row.name as string,
    type: row.type as string,
    url: row.url as string,
    uploadedAt: row.uploaded_at as string,
  };
}

// =============================================================================
// PostgreSQL Adapter (production — Vercel / any hosted environment)
// =============================================================================

class PostgresAdapter implements DbAdapter {
  private pool: import("pg").Pool | null = null;
  private initialized = false;

  private async getPool(): Promise<import("pg").Pool> {
    if (this.pool) return this.pool;

    // Dynamic import so pg is only loaded when DATABASE_URL is set
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
      CREATE TABLE IF NOT EXISTS leads (
        id SERIAL PRIMARY KEY,
        lead_id TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        date_of_birth TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        state TEXT NOT NULL,
        coverage_interest TEXT NOT NULL,
        purchase_intent TEXT NOT NULL DEFAULT '',
        veteran_status TEXT NOT NULL DEFAULT '',
        military_branch TEXT NOT NULL DEFAULT '',
        consent_tcpa BOOLEAN NOT NULL DEFAULT FALSE,
        consent_privacy BOOLEAN NOT NULL DEFAULT FALSE,
        consent_timestamp TEXT NOT NULL,
        consent_text TEXT NOT NULL,
        consent_ip TEXT NOT NULL DEFAULT 'unknown',
        consent_user_agent TEXT NOT NULL DEFAULT 'unknown',
        consent_page_url TEXT NOT NULL DEFAULT '/',
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        utm_term TEXT,
        utm_content TEXT,
        created_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
        updated_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
      )
    `);

    // Create indexes (IF NOT EXISTS is supported in PG 9.5+)
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_leads_lead_id ON leads(lead_id)`);

    // Migration: add columns if they don't exist
    const colCheck = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'leads'
    `);
    const columnNames = new Set(colCheck.rows.map((r: { column_name: string }) => r.column_name));

    if (!columnNames.has("date_of_birth")) {
      await pool.query("ALTER TABLE leads ADD COLUMN date_of_birth TEXT NOT NULL DEFAULT ''");
    }
    if (!columnNames.has("purchase_intent")) {
      await pool.query("ALTER TABLE leads ADD COLUMN purchase_intent TEXT NOT NULL DEFAULT ''");
    }
    if (!columnNames.has("veteran_status")) {
      await pool.query("ALTER TABLE leads ADD COLUMN veteran_status TEXT NOT NULL DEFAULT ''");
    }
    if (!columnNames.has("military_branch")) {
      await pool.query("ALTER TABLE leads ADD COLUMN military_branch TEXT NOT NULL DEFAULT ''");
    }

    // --- Client portal tables ---
    await pool.query(`
      CREATE TABLE IF NOT EXISTS clients (
        id SERIAL PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (NOW()::TEXT),
        updated_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_messages (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        direction TEXT NOT NULL DEFAULT 'inbound',
        subject TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        read BOOLEAN NOT NULL DEFAULT FALSE,
        created_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_client_messages_client ON client_messages(client_id)`);

    await pool.query(`
      CREATE TABLE IF NOT EXISTS client_documents (
        id SERIAL PRIMARY KEY,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'document',
        url TEXT NOT NULL,
        uploaded_at TEXT NOT NULL DEFAULT (NOW()::TEXT)
      )
    `);
    await pool.query(`CREATE INDEX IF NOT EXISTS idx_client_documents_client ON client_documents(client_id)`);

    this.initialized = true;
  }

  async insertLead(lead: LeadRecord): Promise<Result<{ id: number; leadId: string }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();

      // Duplicate check — same email + phone within 24 hours
      const dupResult = await pool.query(
        `SELECT lead_id FROM leads
         WHERE email = $1 AND phone = $2
         AND created_at::timestamp > NOW() - INTERVAL '24 hours'`,
        [lead.email, lead.phone],
      );

      if (dupResult.rows.length > 0) {
        return Err(`Duplicate lead detected (${dupResult.rows[0].lead_id}). Same contact submitted within 24 hours.`);
      }

      const result = await pool.query(
        `INSERT INTO leads (
          lead_id, first_name, last_name, date_of_birth, email, phone, state,
          coverage_interest, purchase_intent, veteran_status, military_branch,
          consent_tcpa, consent_privacy,
          consent_timestamp, consent_text, consent_ip,
          consent_user_agent, consent_page_url,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          created_at
        ) VALUES (
          $1, $2, $3, $4, $5, $6, $7,
          $8, $9, $10, $11,
          $12, $13,
          $14, $15, $16,
          $17, $18,
          $19, $20, $21, $22, $23,
          $24
        ) RETURNING id`,
        [
          lead.leadId, lead.firstName, lead.lastName, lead.dateOfBirth,
          lead.email, lead.phone, lead.state,
          lead.coverageInterest, lead.purchaseIntent, lead.veteranStatus, lead.militaryBranch,
          lead.consentTcpa, lead.consentPrivacy,
          lead.consentTimestamp, lead.consentText, lead.consentIp,
          lead.consentUserAgent, lead.consentPageUrl,
          lead.utmSource, lead.utmMedium, lead.utmCampaign, lead.utmTerm, lead.utmContent,
          lead.createdAt,
        ],
      );

      return Ok({ id: result.rows[0].id as number, leadId: lead.leadId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown database error";
      return Err(message);
    }
  }

  async getLeadById(leadId: string): Promise<Result<LeadRecord | null, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query("SELECT * FROM leads WHERE lead_id = $1", [leadId]);
      if (result.rows.length === 0) return Ok(null);
      return Ok(rowToLead(result.rows[0]));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getLeadsByEmail(email: string): Promise<Result<LeadRecord[], string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        "SELECT * FROM leads WHERE email = $1 ORDER BY created_at DESC",
        [email],
      );
      return Ok(result.rows.map(rowToLead));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getRecentLeads(limit: number): Promise<Result<LeadRecord[], string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        "SELECT * FROM leads ORDER BY created_at DESC LIMIT $1",
        [limit],
      );
      return Ok(result.rows.map(rowToLead));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getLeadCount(): Promise<Result<number, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query("SELECT COUNT(*) as count FROM leads");
      return Ok(parseInt(result.rows[0].count, 10));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getFilteredLeads(filters: LeadFilters): Promise<Result<{ leads: LeadRecord[]; total: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const conditions: string[] = [];
      const params: unknown[] = [];
      let paramIndex = 1;

      if (filters.state) {
        conditions.push(`state = $${paramIndex++}`);
        params.push(filters.state);
      }
      if (filters.coverageInterest) {
        conditions.push(`coverage_interest = $${paramIndex++}`);
        params.push(filters.coverageInterest);
      }
      if (filters.veteranStatus) {
        conditions.push(`veteran_status = $${paramIndex++}`);
        params.push(filters.veteranStatus);
      }
      if (filters.search) {
        conditions.push(`(first_name ILIKE $${paramIndex} OR last_name ILIKE $${paramIndex} OR email ILIKE $${paramIndex})`);
        paramIndex++;
        params.push(`%${filters.search}%`);
      }
      if (filters.startDate) {
        conditions.push(`created_at >= $${paramIndex++}`);
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        conditions.push(`created_at <= $${paramIndex++}`);
        params.push(filters.endDate);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;

      const countResult = await pool.query(
        `SELECT COUNT(*) as count FROM leads ${where}`,
        params,
      );

      const dataResult = await pool.query(
        `SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
        [...params, limit, offset],
      );

      return Ok({
        leads: dataResult.rows.map(rowToLead),
        total: parseInt(countResult.rows[0].count, 10),
      });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getLeadStats(): Promise<Result<LeadStats, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();

      const total = (await pool.query("SELECT COUNT(*) as c FROM leads")).rows[0].c;
      const today = (await pool.query("SELECT COUNT(*) as c FROM leads WHERE created_at::date = CURRENT_DATE")).rows[0].c;
      const thisWeek = (await pool.query("SELECT COUNT(*) as c FROM leads WHERE created_at::date >= CURRENT_DATE - INTERVAL '7 days'")).rows[0].c;
      const thisMonth = (await pool.query("SELECT COUNT(*) as c FROM leads WHERE created_at::date >= CURRENT_DATE - INTERVAL '30 days'")).rows[0].c;

      const byState: Record<string, number> = {};
      const stateRows = (await pool.query("SELECT state, COUNT(*) as c FROM leads GROUP BY state ORDER BY c DESC")).rows;
      for (const r of stateRows) byState[r.state] = parseInt(r.c, 10);

      const byCoverage: Record<string, number> = {};
      const covRows = (await pool.query("SELECT coverage_interest, COUNT(*) as c FROM leads GROUP BY coverage_interest ORDER BY c DESC")).rows;
      for (const r of covRows) byCoverage[r.coverage_interest] = parseInt(r.c, 10);

      const byVeteranStatus: Record<string, number> = {};
      const vetRows = (await pool.query("SELECT veteran_status, COUNT(*) as c FROM leads GROUP BY veteran_status ORDER BY c DESC")).rows;
      for (const r of vetRows) byVeteranStatus[r.veteran_status] = parseInt(r.c, 10);

      return Ok({
        total: parseInt(total, 10),
        today: parseInt(today, 10),
        thisWeek: parseInt(thisWeek, 10),
        thisMonth: parseInt(thisMonth, 10),
        byState,
        byCoverage,
        byVeteranStatus,
      });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async deleteLeadByEmail(email: string): Promise<Result<{ deleted: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        "DELETE FROM leads WHERE email = $1",
        [email.trim().toLowerCase()],
      );
      return Ok({ deleted: result.rowCount ?? 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      return Err(message);
    }
  }

  async deleteLeadById(leadId: string): Promise<Result<{ deleted: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        "DELETE FROM leads WHERE lead_id = $1",
        [leadId],
      );
      return Ok({ deleted: result.rowCount ?? 0 });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      return Err(message);
    }
  }

  // --- Client portal methods ---

  async createClient(client: Omit<ClientRecord, "id" | "status" | "createdAt" | "updatedAt">): Promise<Result<{ id: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        `INSERT INTO clients (email, password_hash, first_name, last_name, phone, state)
         VALUES ($1, $2, $3, $4, $5, $6)
         RETURNING id`,
        [client.email.trim().toLowerCase(), client.passwordHash, client.firstName, client.lastName, client.phone, client.state],
      );
      return Ok({ id: result.rows[0].id as number });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create client failed";
      if (msg.includes("unique") || msg.includes("duplicate")) {
        return Err("An account with this email already exists.");
      }
      return Err(msg);
    }
  }

  async getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query("SELECT * FROM clients WHERE email = $1", [email.trim().toLowerCase()]);
      if (result.rows.length === 0) return Ok(null);
      return Ok(rowToClient(result.rows[0]));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientById(id: number): Promise<Result<ClientRecord | null, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query("SELECT * FROM clients WHERE id = $1", [id]);
      if (result.rows.length === 0) return Ok(null);
      return Ok(rowToClient(result.rows[0]));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientLeads(email: string): Promise<Result<LeadRecord[], string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        "SELECT * FROM leads WHERE email = $1 ORDER BY created_at DESC",
        [email.trim().toLowerCase()],
      );
      return Ok(result.rows.map(rowToLead));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientMessages(clientId: number): Promise<Result<ClientMessage[], string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        "SELECT * FROM client_messages WHERE client_id = $1 ORDER BY created_at DESC",
        [clientId],
      );
      return Ok(result.rows.map(rowToMessage));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async createClientMessage(msg: Omit<ClientMessage, "id" | "read" | "createdAt">): Promise<Result<{ id: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        `INSERT INTO client_messages (client_id, direction, subject, body)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [msg.clientId, msg.direction, msg.subject, msg.body],
      );
      return Ok({ id: result.rows[0].id as number });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Send failed");
    }
  }

  async markMessageRead(messageId: number, clientId: number): Promise<Result<void, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      await pool.query(
        "UPDATE client_messages SET read = TRUE WHERE id = $1 AND client_id = $2",
        [messageId, clientId],
      );
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }

  async getClientDocuments(clientId: number): Promise<Result<ClientDocument[], string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        "SELECT * FROM client_documents WHERE client_id = $1 ORDER BY uploaded_at DESC",
        [clientId],
      );
      return Ok(result.rows.map(rowToDocument));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async createClientDocument(doc: Omit<ClientDocument, "id" | "uploadedAt">): Promise<Result<{ id: number }, string>> {
    try {
      await this.initialize();
      const pool = await this.getPool();
      const result = await pool.query(
        `INSERT INTO client_documents (client_id, name, type, url)
         VALUES ($1, $2, $3, $4) RETURNING id`,
        [doc.clientId, doc.name, doc.type, doc.url],
      );
      return Ok({ id: result.rows[0].id as number });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Upload failed");
    }
  }
}

// =============================================================================
// SQLite Adapter (local development fallback)
// =============================================================================

class SqliteAdapter implements DbAdapter {
  private db: import("better-sqlite3").Database | null = null;

  private getDb(): import("better-sqlite3").Database {
    if (this.db) return this.db;

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Database = require("better-sqlite3");
    const fs = require("fs");

    const IS_VERCEL = !!process.env.VERCEL;
    const DB_DIR = IS_VERCEL
      ? path.join("/tmp", ".cathedral")
      : path.join(process.cwd(), ".cathedral");
    const DB_PATH = path.join(DB_DIR, "leads.db");

    if (!fs.existsSync(DB_DIR)) {
      fs.mkdirSync(DB_DIR, { recursive: true });
    }

    this.db = new Database(DB_PATH);
    this.db!.pragma("journal_mode = WAL");
    this.db!.pragma("foreign_keys = ON");

    return this.db!;
  }

  async initialize(): Promise<void> {
    const db = this.getDb();

    db.exec(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id TEXT UNIQUE NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        date_of_birth TEXT NOT NULL DEFAULT '',
        email TEXT NOT NULL,
        phone TEXT NOT NULL,
        state TEXT NOT NULL,
        coverage_interest TEXT NOT NULL,
        purchase_intent TEXT NOT NULL DEFAULT '',
        veteran_status TEXT NOT NULL DEFAULT '',
        military_branch TEXT NOT NULL DEFAULT '',
        consent_tcpa INTEGER NOT NULL DEFAULT 0,
        consent_privacy INTEGER NOT NULL DEFAULT 0,
        consent_timestamp TEXT NOT NULL,
        consent_text TEXT NOT NULL,
        consent_ip TEXT NOT NULL DEFAULT 'unknown',
        consent_user_agent TEXT NOT NULL DEFAULT 'unknown',
        consent_page_url TEXT NOT NULL DEFAULT '/',
        utm_source TEXT,
        utm_medium TEXT,
        utm_campaign TEXT,
        utm_term TEXT,
        utm_content TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );

      CREATE INDEX IF NOT EXISTS idx_leads_email ON leads(email);
      CREATE INDEX IF NOT EXISTS idx_leads_phone ON leads(phone);
      CREATE INDEX IF NOT EXISTS idx_leads_state ON leads(state);
      CREATE INDEX IF NOT EXISTS idx_leads_created ON leads(created_at);
      CREATE INDEX IF NOT EXISTS idx_leads_lead_id ON leads(lead_id);

      CREATE TABLE IF NOT EXISTS clients (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        first_name TEXT NOT NULL,
        last_name TEXT NOT NULL,
        phone TEXT NOT NULL DEFAULT '',
        state TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_clients_email ON clients(email);

      CREATE TABLE IF NOT EXISTS client_messages (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        direction TEXT NOT NULL DEFAULT 'inbound',
        subject TEXT NOT NULL DEFAULT '',
        body TEXT NOT NULL,
        read INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_client_messages_client ON client_messages(client_id);

      CREATE TABLE IF NOT EXISTS client_documents (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        client_id INTEGER NOT NULL REFERENCES clients(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL DEFAULT 'document',
        url TEXT NOT NULL,
        uploaded_at TEXT NOT NULL DEFAULT (datetime('now'))
      );
      CREATE INDEX IF NOT EXISTS idx_client_documents_client ON client_documents(client_id);
    `);

    // Migration: add columns to existing databases that lack them
    const columns = db.prepare("PRAGMA table_info(leads)").all() as Array<{ name: string }>;
    const columnNames = new Set(columns.map((col) => col.name));

    if (!columnNames.has("date_of_birth")) {
      db.exec("ALTER TABLE leads ADD COLUMN date_of_birth TEXT NOT NULL DEFAULT ''");
    }
    if (!columnNames.has("purchase_intent")) {
      db.exec("ALTER TABLE leads ADD COLUMN purchase_intent TEXT NOT NULL DEFAULT ''");
    }
    if (!columnNames.has("veteran_status")) {
      db.exec("ALTER TABLE leads ADD COLUMN veteran_status TEXT NOT NULL DEFAULT ''");
    }
    if (!columnNames.has("military_branch")) {
      db.exec("ALTER TABLE leads ADD COLUMN military_branch TEXT NOT NULL DEFAULT ''");
    }
  }

  async insertLead(lead: LeadRecord): Promise<Result<{ id: number; leadId: string }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();

      // Duplicate check — same email + phone within 24 hours
      const duplicate = db.prepare(`
        SELECT lead_id FROM leads
        WHERE email = ? AND phone = ?
        AND created_at > datetime('now', '-24 hours')
      `).get(lead.email, lead.phone) as { lead_id: string } | undefined;

      if (duplicate) {
        return Err(`Duplicate lead detected (${duplicate.lead_id}). Same contact submitted within 24 hours.`);
      }

      const stmt = db.prepare(`
        INSERT INTO leads (
          lead_id, first_name, last_name, date_of_birth, email, phone, state,
          coverage_interest, purchase_intent, veteran_status, military_branch,
          consent_tcpa, consent_privacy,
          consent_timestamp, consent_text, consent_ip,
          consent_user_agent, consent_page_url,
          utm_source, utm_medium, utm_campaign, utm_term, utm_content,
          created_at
        ) VALUES (
          ?, ?, ?, ?, ?, ?, ?,
          ?, ?, ?, ?,
          ?, ?,
          ?, ?, ?,
          ?, ?,
          ?, ?, ?, ?, ?,
          ?
        )
      `);

      const result = stmt.run(
        lead.leadId, lead.firstName, lead.lastName, lead.dateOfBirth,
        lead.email, lead.phone, lead.state,
        lead.coverageInterest, lead.purchaseIntent, lead.veteranStatus, lead.militaryBranch,
        lead.consentTcpa ? 1 : 0, lead.consentPrivacy ? 1 : 0,
        lead.consentTimestamp, lead.consentText, lead.consentIp,
        lead.consentUserAgent, lead.consentPageUrl,
        lead.utmSource, lead.utmMedium, lead.utmCampaign, lead.utmTerm, lead.utmContent,
        lead.createdAt,
      );

      return Ok({ id: result.lastInsertRowid as number, leadId: lead.leadId });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unknown database error";
      return Err(message);
    }
  }

  async getLeadById(leadId: string): Promise<Result<LeadRecord | null, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const row = db.prepare("SELECT * FROM leads WHERE lead_id = ?").get(leadId) as Record<string, unknown> | undefined;
      if (!row) return Ok(null);
      return Ok(rowToLead(row));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getLeadsByEmail(email: string): Promise<Result<LeadRecord[], string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const rows = db.prepare("SELECT * FROM leads WHERE email = ? ORDER BY created_at DESC").all(email) as Record<string, unknown>[];
      return Ok(rows.map(rowToLead));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getRecentLeads(limit: number): Promise<Result<LeadRecord[], string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const rows = db.prepare("SELECT * FROM leads ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
      return Ok(rows.map(rowToLead));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getLeadCount(): Promise<Result<number, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const row = db.prepare("SELECT COUNT(*) as count FROM leads").get() as { count: number };
      return Ok(row.count);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getFilteredLeads(filters: LeadFilters): Promise<Result<{ leads: LeadRecord[]; total: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const conditions: string[] = [];
      const params: unknown[] = [];

      if (filters.state) {
        conditions.push("state = ?");
        params.push(filters.state);
      }
      if (filters.coverageInterest) {
        conditions.push("coverage_interest = ?");
        params.push(filters.coverageInterest);
      }
      if (filters.veteranStatus) {
        conditions.push("veteran_status = ?");
        params.push(filters.veteranStatus);
      }
      if (filters.search) {
        conditions.push("(first_name LIKE ? OR last_name LIKE ? OR email LIKE ?)");
        const term = `%${filters.search}%`;
        params.push(term, term, term);
      }
      if (filters.startDate) {
        conditions.push("created_at >= ?");
        params.push(filters.startDate);
      }
      if (filters.endDate) {
        conditions.push("created_at <= ?");
        params.push(filters.endDate);
      }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";
      const limit = filters.limit || 50;
      const offset = filters.offset || 0;

      const countRow = db.prepare(`SELECT COUNT(*) as count FROM leads ${where}`).get(...params) as { count: number };
      const rows = db.prepare(`SELECT * FROM leads ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`).all(...params, limit, offset) as Record<string, unknown>[];

      return Ok({ leads: rows.map(rowToLead), total: countRow.count });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getLeadStats(): Promise<Result<LeadStats, string>> {
    try {
      const db = this.getDb();
      await this.initialize();

      const total = (db.prepare("SELECT COUNT(*) as c FROM leads").get() as { c: number }).c;
      const today = (db.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= date('now')").get() as { c: number }).c;
      const thisWeek = (db.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= date('now', '-7 days')").get() as { c: number }).c;
      const thisMonth = (db.prepare("SELECT COUNT(*) as c FROM leads WHERE created_at >= date('now', '-30 days')").get() as { c: number }).c;

      const byState: Record<string, number> = {};
      const stateRows = db.prepare("SELECT state, COUNT(*) as c FROM leads GROUP BY state ORDER BY c DESC").all() as Array<{ state: string; c: number }>;
      for (const r of stateRows) byState[r.state] = r.c;

      const byCoverage: Record<string, number> = {};
      const covRows = db.prepare("SELECT coverage_interest, COUNT(*) as c FROM leads GROUP BY coverage_interest ORDER BY c DESC").all() as Array<{ coverage_interest: string; c: number }>;
      for (const r of covRows) byCoverage[r.coverage_interest] = r.c;

      const byVeteranStatus: Record<string, number> = {};
      const vetRows = db.prepare("SELECT veteran_status, COUNT(*) as c FROM leads GROUP BY veteran_status ORDER BY c DESC").all() as Array<{ veteran_status: string; c: number }>;
      for (const r of vetRows) byVeteranStatus[r.veteran_status] = r.c;

      return Ok({ total, today, thisWeek, thisMonth, byState, byCoverage, byVeteranStatus });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async deleteLeadByEmail(email: string): Promise<Result<{ deleted: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const result = db.prepare("DELETE FROM leads WHERE email = ?").run(email.trim().toLowerCase());
      return Ok({ deleted: result.changes });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      return Err(message);
    }
  }

  async deleteLeadById(leadId: string): Promise<Result<{ deleted: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const result = db.prepare("DELETE FROM leads WHERE lead_id = ?").run(leadId);
      return Ok({ deleted: result.changes });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Delete failed";
      return Err(message);
    }
  }

  // --- Client portal methods (SQLite) ---

  async createClient(client: Omit<ClientRecord, "id" | "status" | "createdAt" | "updatedAt">): Promise<Result<{ id: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const result = db.prepare(
        `INSERT INTO clients (email, password_hash, first_name, last_name, phone, state)
         VALUES (?, ?, ?, ?, ?, ?)`,
      ).run(client.email.trim().toLowerCase(), client.passwordHash, client.firstName, client.lastName, client.phone, client.state);
      return Ok({ id: result.lastInsertRowid as number });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Create client failed";
      if (msg.includes("UNIQUE")) return Err("An account with this email already exists.");
      return Err(msg);
    }
  }

  async getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const row = db.prepare("SELECT * FROM clients WHERE email = ?").get(email.trim().toLowerCase()) as Record<string, unknown> | undefined;
      if (!row) return Ok(null);
      return Ok(rowToClient(row));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientById(id: number): Promise<Result<ClientRecord | null, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const row = db.prepare("SELECT * FROM clients WHERE id = ?").get(id) as Record<string, unknown> | undefined;
      if (!row) return Ok(null);
      return Ok(rowToClient(row));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientLeads(email: string): Promise<Result<LeadRecord[], string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const rows = db.prepare("SELECT * FROM leads WHERE email = ? ORDER BY created_at DESC").all(email.trim().toLowerCase()) as Record<string, unknown>[];
      return Ok(rows.map(rowToLead));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async getClientMessages(clientId: number): Promise<Result<ClientMessage[], string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const rows = db.prepare("SELECT * FROM client_messages WHERE client_id = ? ORDER BY created_at DESC").all(clientId) as Record<string, unknown>[];
      return Ok(rows.map(rowToMessage));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async createClientMessage(msg: Omit<ClientMessage, "id" | "read" | "createdAt">): Promise<Result<{ id: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const result = db.prepare(
        `INSERT INTO client_messages (client_id, direction, subject, body) VALUES (?, ?, ?, ?)`,
      ).run(msg.clientId, msg.direction, msg.subject, msg.body);
      return Ok({ id: result.lastInsertRowid as number });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Send failed");
    }
  }

  async markMessageRead(messageId: number, clientId: number): Promise<Result<void, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      db.prepare("UPDATE client_messages SET read = 1 WHERE id = ? AND client_id = ?").run(messageId, clientId);
      return Ok(undefined);
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Update failed");
    }
  }

  async getClientDocuments(clientId: number): Promise<Result<ClientDocument[], string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const rows = db.prepare("SELECT * FROM client_documents WHERE client_id = ? ORDER BY uploaded_at DESC").all(clientId) as Record<string, unknown>[];
      return Ok(rows.map(rowToDocument));
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Query failed");
    }
  }

  async createClientDocument(doc: Omit<ClientDocument, "id" | "uploadedAt">): Promise<Result<{ id: number }, string>> {
    try {
      const db = this.getDb();
      await this.initialize();
      const result = db.prepare(
        `INSERT INTO client_documents (client_id, name, type, url) VALUES (?, ?, ?, ?)`,
      ).run(doc.clientId, doc.name, doc.type, doc.url);
      return Ok({ id: result.lastInsertRowid as number });
    } catch (err) {
      return Err(err instanceof Error ? err.message : "Upload failed");
    }
  }
}

// =============================================================================
// Noop Adapter (Vercel without DATABASE_URL — returns errors, doesn't crash)
// =============================================================================

class NoopAdapter implements DbAdapter {
  private fail<T>(op: string): Promise<Result<T, string>> {
    return Promise.resolve(Err(`DATABASE_URL not configured. Set it in Vercel environment variables to enable ${op}.`));
  }
  async initialize(): Promise<void> {}
  insertLead(): Promise<Result<{ id: number; leadId: string }, string>> { return this.fail("lead storage"); }
  getLeadById(): Promise<Result<LeadRecord | null, string>> { return this.fail("lead lookup"); }
  getLeadsByEmail(): Promise<Result<LeadRecord[], string>> { return this.fail("lead lookup"); }
  getRecentLeads(): Promise<Result<LeadRecord[], string>> { return this.fail("lead listing"); }
  getLeadCount(): Promise<Result<number, string>> { return Promise.resolve(Ok(0)); }
  getFilteredLeads(): Promise<Result<{ leads: LeadRecord[]; total: number }, string>> { return this.fail("lead filtering"); }
  getLeadStats(): Promise<Result<LeadStats, string>> { return this.fail("stats"); }
  deleteLeadByEmail(): Promise<Result<{ deleted: number }, string>> { return this.fail("lead deletion"); }
  deleteLeadById(): Promise<Result<{ deleted: number }, string>> { return this.fail("lead deletion"); }
  createClient(): Promise<Result<{ id: number }, string>> { return this.fail("client registration"); }
  getClientByEmail(): Promise<Result<ClientRecord | null, string>> { return this.fail("client lookup"); }
  getClientById(): Promise<Result<ClientRecord | null, string>> { return this.fail("client lookup"); }
  getClientLeads(): Promise<Result<LeadRecord[], string>> { return this.fail("client leads"); }
  getClientMessages(): Promise<Result<ClientMessage[], string>> { return this.fail("client messages"); }
  createClientMessage(): Promise<Result<{ id: number }, string>> { return this.fail("client messaging"); }
  markMessageRead(): Promise<Result<void, string>> { return this.fail("message update"); }
  getClientDocuments(): Promise<Result<ClientDocument[], string>> { return this.fail("client documents"); }
  createClientDocument(): Promise<Result<{ id: number }, string>> { return this.fail("document upload"); }
}

// =============================================================================
// Adapter Selection — singleton
// =============================================================================

let _adapter: DbAdapter | null = null;

function getAdapter(): DbAdapter {
  if (_adapter) return _adapter;

  if (process.env.DATABASE_URL) {
    console.log("[database] Using PostgreSQL adapter (DATABASE_URL detected)");
    _adapter = new PostgresAdapter();
  } else if (process.env.VERCEL) {
    // On Vercel without DATABASE_URL, better-sqlite3 (native addon) won't work.
    // Return a stub that returns clear errors so the site still renders.
    console.warn("[database] No DATABASE_URL on Vercel — database operations will fail. Set DATABASE_URL in Vercel environment variables.");
    _adapter = new NoopAdapter();
  } else {
    console.log("[database] Using SQLite adapter (no DATABASE_URL — local dev mode)");
    _adapter = new SqliteAdapter();
  }

  return _adapter;
}

// =============================================================================
// Exported async functions — same signatures, now returning Promises
// =============================================================================

export async function insertLead(lead: LeadRecord): Promise<Result<{ id: number; leadId: string }, string>> {
  return getAdapter().insertLead(lead);
}

export async function getLeadById(leadId: string): Promise<Result<LeadRecord | null, string>> {
  return getAdapter().getLeadById(leadId);
}

export async function getLeadsByEmail(email: string): Promise<Result<LeadRecord[], string>> {
  return getAdapter().getLeadsByEmail(email);
}

export async function getRecentLeads(limit: number = 50): Promise<Result<LeadRecord[], string>> {
  return getAdapter().getRecentLeads(limit);
}

export async function getLeadCount(): Promise<Result<number, string>> {
  return getAdapter().getLeadCount();
}

export async function getFilteredLeads(filters: LeadFilters): Promise<Result<{ leads: LeadRecord[]; total: number }, string>> {
  return getAdapter().getFilteredLeads(filters);
}

export async function getLeadStats(): Promise<Result<LeadStats, string>> {
  return getAdapter().getLeadStats();
}

export async function deleteLeadByEmail(email: string): Promise<Result<{ deleted: number }, string>> {
  return getAdapter().deleteLeadByEmail(email);
}

export async function deleteLeadById(leadId: string): Promise<Result<{ deleted: number }, string>> {
  return getAdapter().deleteLeadById(leadId);
}

// --- Client (portal) exports ---

export async function createClient(client: Omit<ClientRecord, "id" | "status" | "createdAt" | "updatedAt">): Promise<Result<{ id: number }, string>> {
  return getAdapter().createClient(client);
}

export async function getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>> {
  return getAdapter().getClientByEmail(email);
}

export async function getClientById(id: number): Promise<Result<ClientRecord | null, string>> {
  return getAdapter().getClientById(id);
}

export async function getClientLeads(email: string): Promise<Result<LeadRecord[], string>> {
  return getAdapter().getClientLeads(email);
}

export async function getClientMessages(clientId: number): Promise<Result<ClientMessage[], string>> {
  return getAdapter().getClientMessages(clientId);
}

export async function createClientMessage(msg: Omit<ClientMessage, "id" | "read" | "createdAt">): Promise<Result<{ id: number }, string>> {
  return getAdapter().createClientMessage(msg);
}

export async function markMessageRead(messageId: number, clientId: number): Promise<Result<void, string>> {
  return getAdapter().markMessageRead(messageId, clientId);
}

export async function getClientDocuments(clientId: number): Promise<Result<ClientDocument[], string>> {
  return getAdapter().getClientDocuments(clientId);
}

export async function createClientDocument(doc: Omit<ClientDocument, "id" | "uploadedAt">): Promise<Result<{ id: number }, string>> {
  return getAdapter().createClientDocument(doc);
}
