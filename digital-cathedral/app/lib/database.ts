/**
 * Lead Database — Kingdom Persistence Layer
 *
 * Oracle decision: GENERATE (no existing DB pattern)
 * Evolved from: result-type-ts (EVOLVE, coherency 1.000)
 *
 * Uses better-sqlite3 for synchronous, embedded SQLite storage.
 * Stores leads with full TCPA consent records for compliance.
 */
import Database from "better-sqlite3";
import path from "path";

// --- Evolved from oracle pattern: result-type-ts ---
type Result<T, E = Error> = { ok: true; value: T } | { ok: false; error: E };

function Ok<T>(value: T): Result<T, never> {
  return { ok: true, value };
}

function Err<E>(error: E): Result<never, E> {
  return { ok: false, error };
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

// --- Database path ---
const DB_DIR = path.join(process.cwd(), ".cathedral");
const DB_PATH = path.join(DB_DIR, "leads.db");

// --- Singleton connection ---
let _db: Database.Database | null = null;

function getDb(): Database.Database {
  if (_db) return _db;

  // Ensure directory exists
  const fs = require("fs");
  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  _db = new Database(DB_PATH);
  _db.pragma("journal_mode = WAL");
  _db.pragma("foreign_keys = ON");

  // Run migrations
  migrate(_db);

  return _db;
}

// --- Schema migration ---
function migrate(db: Database.Database): void {
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
      consent_tcpa INTEGER NOT NULL DEFAULT 0,
      consent_privacy INTEGER NOT NULL DEFAULT 0,
      consent_timestamp TEXT NOT NULL,
      consent_text TEXT NOT NULL,
      consent_ip TEXT NOT NULL DEFAULT 'unknown',
      consent_user_agent TEXT NOT NULL DEFAULT 'unknown',
      consent_page_url TEXT NOT NULL DEFAULT '/protect',
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
  `);
}

// --- Insert a new lead ---
export function insertLead(lead: LeadRecord): Result<{ id: number; leadId: string }, string> {
  try {
    const db = getDb();

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
        coverage_interest, consent_tcpa, consent_privacy,
        consent_timestamp, consent_text, consent_ip,
        consent_user_agent, consent_page_url,
        utm_source, utm_medium, utm_campaign, utm_term, utm_content,
        created_at
      ) VALUES (
        ?, ?, ?, ?, ?, ?, ?,
        ?, ?, ?,
        ?, ?, ?,
        ?, ?,
        ?, ?, ?, ?, ?,
        ?
      )
    `);

    const result = stmt.run(
      lead.leadId, lead.firstName, lead.lastName, lead.dateOfBirth, lead.email, lead.phone, lead.state,
      lead.coverageInterest, lead.consentTcpa ? 1 : 0, lead.consentPrivacy ? 1 : 0,
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

// --- Query leads ---
export function getLeadById(leadId: string): Result<LeadRecord | null, string> {
  try {
    const db = getDb();
    const row = db.prepare("SELECT * FROM leads WHERE lead_id = ?").get(leadId) as Record<string, unknown> | undefined;
    if (!row) return Ok(null);
    return Ok(rowToLead(row));
  } catch (err) {
    return Err(err instanceof Error ? err.message : "Query failed");
  }
}

export function getLeadsByEmail(email: string): Result<LeadRecord[], string> {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM leads WHERE email = ? ORDER BY created_at DESC").all(email) as Record<string, unknown>[];
    return Ok(rows.map(rowToLead));
  } catch (err) {
    return Err(err instanceof Error ? err.message : "Query failed");
  }
}

export function getRecentLeads(limit: number = 50): Result<LeadRecord[], string> {
  try {
    const db = getDb();
    const rows = db.prepare("SELECT * FROM leads ORDER BY created_at DESC LIMIT ?").all(limit) as Record<string, unknown>[];
    return Ok(rows.map(rowToLead));
  } catch (err) {
    return Err(err instanceof Error ? err.message : "Query failed");
  }
}

export function getLeadCount(): Result<number, string> {
  try {
    const db = getDb();
    const row = db.prepare("SELECT COUNT(*) as count FROM leads").get() as { count: number };
    return Ok(row.count);
  } catch (err) {
    return Err(err instanceof Error ? err.message : "Query failed");
  }
}

// --- Row mapper ---
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
    consentTcpa: row.consent_tcpa === 1,
    consentPrivacy: row.consent_privacy === 1,
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
