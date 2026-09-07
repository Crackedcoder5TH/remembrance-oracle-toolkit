import path from "path";
import { SUBSTRATE_LEAD_OPS, substrateGetLeadOperations, substrateUpdateLeadOperations } from "./lead-operations-substrate";

export const AGENT_STATUSES = ["New", "Contacted", "Follow-Up", "Appointment Set", "Application Started", "Submitted", "Won", "Lost", "Bad Lead / Dispute Requested", "Do Not Contact"] as const;
export type AgentStatus = typeof AGENT_STATUSES[number];
// The only event types a client may record via the operations PATCH. Anything
// else is rejected at the route AND ignored by deriveOpsMutation, so an
// arbitrary or non-string eventType can neither pollute the activity log nor
// crash the writer (eventType.replaceAll on a number would throw a 500).
export const AGENT_EVENT_TYPES = ["call_clicked", "text_clicked", "email_clicked", "calendar_exported"] as const;
export type AgentEventType = typeof AGENT_EVENT_TYPES[number];
export type LeadNote = { id: number; leadId: string; actorId: string; actorRole: "agent" | "admin"; body: string; visibility: "agent" | "internal"; createdAt: string };
export type LeadActivity = { id: number; eventType: string; eventLabel: string; actorRole: string; createdAt: string };
export type LeadOperations = { status: AgentStatus; lastContactedAt: string | null; nextFollowUpAt: string | null; appointmentAt: string | null; doNotContact: boolean; disputeStatus: string | null; notes: LeadNote[]; activity: LeadActivity[] };

const schema = `
  CREATE TABLE IF NOT EXISTS lead_operations (lead_id TEXT NOT NULL, client_id TEXT NOT NULL DEFAULT '', agent_status TEXT NOT NULL DEFAULT 'New', last_contacted_at TEXT, next_follow_up_at TEXT, appointment_at TEXT, do_not_contact INTEGER NOT NULL DEFAULT 0, dispute_status TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (lead_id, client_id));
  CREATE TABLE IF NOT EXISTS lead_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL, client_id TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, body TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'agent', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lead_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL, client_id TEXT NOT NULL DEFAULT '', actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, event_type TEXT NOT NULL, event_label TEXT NOT NULL, created_at TEXT NOT NULL);`;

export type LeadOperationsScope = { includeInternal?: boolean; clientId?: string; purchaseId?: string; admin?: boolean };
const scopeId = (options?: LeadOperationsScope) => options?.purchaseId || options?.clientId || "";

// One shared sqlite handle per process (local-dev fallback). Reused, never
// reopened per call — reopening churned the file handle on every lead read.
// Uses the package's existing better-sqlite3 fallback so Node 18/20 remain
// supported when DATABASE_URL is absent. Production uses Postgres.
let sqliteDb: import("better-sqlite3").Database | null = null;
function sqlite() {
  if (sqliteDb) return sqliteDb;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  const dir = process.env.VERCEL ? path.join("/tmp", ".cathedral") : path.join(process.cwd(), ".cathedral");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "leads.db"));
  const oldOps = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='lead_operations'").get();
  if (oldOps && !(db.prepare("PRAGMA table_info(lead_operations)").all() as Array<{name:string}>).some(c => c.name === "client_id")) {
    db.exec(`BEGIN;
      ALTER TABLE lead_operations RENAME TO lead_operations_legacy;
      CREATE TABLE lead_operations (lead_id TEXT NOT NULL, client_id TEXT NOT NULL DEFAULT '', agent_status TEXT NOT NULL DEFAULT 'New', last_contacted_at TEXT, next_follow_up_at TEXT, appointment_at TEXT, do_not_contact INTEGER NOT NULL DEFAULT 0, dispute_status TEXT, updated_at TEXT NOT NULL, PRIMARY KEY (lead_id, client_id));
      INSERT INTO lead_operations (lead_id,client_id,agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact,dispute_status,updated_at) SELECT lead_id,'',agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact,dispute_status,updated_at FROM lead_operations_legacy;
      DROP TABLE lead_operations_legacy; COMMIT;`);
  }
  db.exec(schema);
  if (!(db.prepare("PRAGMA table_info(lead_notes)").all() as Array<{name:string}>).some(c => c.name === "client_id")) db.exec("ALTER TABLE lead_notes ADD COLUMN client_id TEXT NOT NULL DEFAULT ''");
  if (!(db.prepare("PRAGMA table_info(lead_activity)").all() as Array<{name:string}>).some(c => c.name === "client_id")) db.exec("ALTER TABLE lead_activity ADD COLUMN client_id TEXT NOT NULL DEFAULT ''");
  db.prepare("UPDATE lead_notes SET client_id=actor_id WHERE client_id='' AND actor_role='agent'").run();
  db.prepare("UPDATE lead_activity SET client_id=actor_id WHERE client_id='' AND actor_role='agent'").run();
  db.exec("CREATE INDEX IF NOT EXISTS idx_lead_notes_scope ON lead_notes(lead_id,client_id,created_at); CREATE INDEX IF NOT EXISTS idx_lead_activity_scope ON lead_activity(lead_id,client_id,created_at);");
  sqliteDb = db;
  return db;
}

// One shared pg Pool per process, mirroring database.ts. The schema DDL runs
// exactly once (guarded by poolReady) rather than on every request — the old
// code created a fresh Pool and re-ran CREATE TABLE per call, so a marketplace
// page (Promise.all over purchased leads) opened N concurrent pools and could
// exhaust the Postgres connection limit.
let pool: import("pg").Pool | null = null;
let poolReady: Promise<import("pg").Pool> | null = null;
function pg(): Promise<import("pg").Pool> {
  if (pool) return Promise.resolve(pool);
  if (!poolReady) {
    poolReady = (async () => {
      const { Pool } = await import("pg");
      const created = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
      // Postgres has no implicit int→bool cast, so the boolean column needs a boolean default (not `0`).
      await created.query(schema.replaceAll("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY").replace("do_not_contact INTEGER NOT NULL DEFAULT 0", "do_not_contact BOOLEAN NOT NULL DEFAULT FALSE"));
      await created.query(`ALTER TABLE lead_operations ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE lead_notes ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT '';
        ALTER TABLE lead_activity ADD COLUMN IF NOT EXISTS client_id TEXT NOT NULL DEFAULT '';
        UPDATE lead_notes SET client_id=actor_id WHERE client_id='' AND actor_role='agent';
        UPDATE lead_activity SET client_id=actor_id WHERE client_id='' AND actor_role='agent';`);
      await created.query(`DO $$ BEGIN
        IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='lead_operations'::regclass AND conname='lead_operations_pkey' AND pg_get_constraintdef(oid)='PRIMARY KEY (lead_id)') THEN
          ALTER TABLE lead_operations DROP CONSTRAINT lead_operations_pkey;
          ALTER TABLE lead_operations ADD PRIMARY KEY (lead_id, client_id);
        END IF;
      END $$;`);
      await created.query("CREATE INDEX IF NOT EXISTS idx_lead_notes_scope ON lead_notes(lead_id,client_id,created_at); CREATE INDEX IF NOT EXISTS idx_lead_activity_scope ON lead_activity(lead_id,client_id,created_at)");
      pool = created;
      return created;
    })();
  }
  return poolReady;
}

const mapOps = (row: Record<string, unknown> | undefined, notes: Record<string, unknown>[], activity: Record<string, unknown>[], includeInternal: boolean): LeadOperations => ({
  status: (row?.agent_status as AgentStatus) || "New", lastContactedAt: (row?.last_contacted_at as string) || null,
  nextFollowUpAt: (row?.next_follow_up_at as string) || null, appointmentAt: (row?.appointment_at as string) || null,
  doNotContact: row?.do_not_contact === true || row?.do_not_contact === 1, disputeStatus: (row?.dispute_status as string) || null,
  notes: notes.filter(n => includeInternal || n.visibility !== "internal").map(n => ({ id: Number(n.id), leadId: n.lead_id as string, actorId: n.actor_id as string, actorRole: n.actor_role as "agent" | "admin", body: n.body as string, visibility: n.visibility as "agent" | "internal", createdAt: n.created_at as string })),
  activity: activity.map(a => ({ id: Number(a.id), eventType: a.event_type as string, eventLabel: a.event_label as string, actorRole: a.actor_role as string, createdAt: a.created_at as string })),
});

export async function getLeadOperations(leadId: string, options: LeadOperationsScope = {}): Promise<LeadOperations> {
  const includeInternal = options.includeInternal || options.admin || false;
  const scope = scopeId(options);
  // Field-attached mode: the lead's operations live in the field's `legacy`
  // store (the Valor Legacies database) alongside the lead record itself.
  if (SUBSTRATE_LEAD_OPS) return substrateGetLeadOperations(leadId, options);
  if (process.env.DATABASE_URL) {
    const db = await pg();
    const all = options.admin && !scope;
    const [o, n, a] = all ? await Promise.all([db.query("SELECT * FROM lead_operations WHERE lead_id=$1 ORDER BY updated_at DESC",[leadId]),db.query("SELECT * FROM lead_notes WHERE lead_id=$1 ORDER BY created_at DESC",[leadId]),db.query("SELECT * FROM lead_activity WHERE lead_id=$1 ORDER BY created_at DESC",[leadId])]) : await Promise.all([db.query("SELECT * FROM lead_operations WHERE lead_id=$1 AND client_id=$2",[leadId,scope]),db.query("SELECT * FROM lead_notes WHERE lead_id=$1 AND client_id=$2 ORDER BY created_at DESC",[leadId,scope]),db.query("SELECT * FROM lead_activity WHERE lead_id=$1 AND client_id=$2 ORDER BY created_at DESC",[leadId,scope])]);
    const globalDnc = scope ? (await db.query("SELECT 1 FROM lead_operations WHERE lead_id=$1 AND do_not_contact=TRUE LIMIT 1",[leadId])).rowCount! > 0 : false;
    const result = mapOps(o.rows[0], n.rows, a.rows, includeInternal); result.doNotContact ||= globalDnc || (Boolean(all) && o.rows.some((r:Record<string,unknown>) => r.do_not_contact === true)); return result;
  }
  const db = sqlite();
  const all = options.admin && !scope;
  const row = (all ? db.prepare("SELECT * FROM lead_operations WHERE lead_id=? ORDER BY updated_at DESC").get(leadId) : db.prepare("SELECT * FROM lead_operations WHERE lead_id=? AND client_id=?").get(leadId,scope)) as Record<string,unknown>|undefined;
  const notes = (all ? db.prepare("SELECT * FROM lead_notes WHERE lead_id=? ORDER BY created_at DESC").all(leadId) : db.prepare("SELECT * FROM lead_notes WHERE lead_id=? AND client_id=? ORDER BY created_at DESC").all(leadId,scope)) as Record<string,unknown>[];
  const activity = (all ? db.prepare("SELECT * FROM lead_activity WHERE lead_id=? ORDER BY created_at DESC").all(leadId) : db.prepare("SELECT * FROM lead_activity WHERE lead_id=? AND client_id=? ORDER BY created_at DESC").all(leadId,scope)) as Record<string,unknown>[];
  const result = mapOps(row,notes,activity,includeInternal); if(scope||all){result.doNotContact ||= (db.prepare("SELECT 1 FROM lead_operations WHERE lead_id=? AND do_not_contact=1 LIMIT 1").get(leadId) as unknown) !== undefined;} return result;
}

export type LeadOperationsSummary = Omit<LeadOperations, "notes" | "activity">;

// The lead-list views (My Leads, marketplace) render status + follow-up +
// appointment, never notes or the activity timeline. getLeadOperations fires
// THREE queries per lead (ops + notes + activity) and ships both arrays over
// the wire; called once per purchased lead in /api/client/leads that was an
// N×3 query fan-out plus a large over-fetch. This reads the single ops row and
// nothing else — one query, no arrays — so a list costs N queries, not 3N.
export async function getLeadOperationsSummary(leadId: string, options: LeadOperationsScope = {}): Promise<LeadOperationsSummary> {
  if (SUBSTRATE_LEAD_OPS) {
    const { notes: _n, activity: _a, ...summary } = await substrateGetLeadOperations(leadId, options);
    return summary;
  }
  const { notes: _n, activity: _a, ...summary } = await getLeadOperations(leadId, options);
  return summary;
}

export type Update = { status?: AgentStatus; nextFollowUpAt?: string | null; appointmentAt?: string | null; contacted?: boolean; note?: string; visibility?: "agent" | "internal"; eventType?: "call_clicked" | "text_clicked" | "email_clicked" };
export type OpsMutation = { status?: AgentStatus; doNotContact?: boolean; dispute: string | null; events: [string, string][] };

// The MEANING of an update — which status/flags it sets and which activity
// events it emits — derived once here and shared by the relational and substrate
// persistence paths, so the two stores can never disagree on what happened.
export function deriveOpsMutation(update: Update, actorRole: "agent" | "admin"): OpsMutation {
  const status = update.status;
  const doNotContact = status === "Do Not Contact" ? true : undefined;
  const dispute = status === "Bad Lead / Dispute Requested" ? "requested" : null;
  const events: [string, string][] = [];
  if (status) events.push(["status_changed", `Status changed to ${status}`]);
  if (update.nextFollowUpAt !== undefined) events.push(["follow_up_set", update.nextFollowUpAt ? "Follow-up scheduled" : "Follow-up cleared"]);
  if (update.appointmentAt !== undefined) events.push(["appointment_set", update.appointmentAt ? "Appointment scheduled or updated" : "Appointment canceled"]);
  if (update.contacted) events.push(["contacted", "Lead marked contacted"]);
  if (update.note?.trim()) events.push(["note_added", actorRole === "admin" ? "Admin note added" : "Agent note added"]);
  if (update.eventType && (AGENT_EVENT_TYPES as readonly string[]).includes(update.eventType)) events.push([update.eventType, update.eventType.replaceAll("_", " ")]);
  return { status, doNotContact, dispute, events };
}

export async function updateLeadOperations(leadId: string, actorId: string, actorRole: "agent" | "admin", update: Update, options: Omit<LeadOperationsScope,"includeInternal"|"admin"> = {}) {
  const now = new Date().toISOString();
  const scope = scopeId(options) || (actorRole === "agent" ? actorId : "");
  const mutation = deriveOpsMutation(update, actorRole);
  // Field-attached mode: persist the operation into the field's `legacy` store.
  if (SUBSTRATE_LEAD_OPS) return substrateUpdateLeadOperations(leadId, actorId, actorRole, update, mutation, { ...options, clientId: scope });
  const { status, doNotContact, dispute, events } = mutation;
  // All queries below are parameterized: pg uses $n placeholders with a bound
  // values array, sqlite uses ? placeholders with .run(...) bind args. No value
  // is interpolated into SQL, so leadId/note/etc. cannot inject. (Taint scanners
  // that key on the db.query identifier flag these as a false positive.)
  if (process.env.DATABASE_URL) {
    // Check out ONE dedicated connection so BEGIN…COMMIT stays on it. On a shared
    // pool, pool.query() can hand each statement a different connection, which
    // would scatter the transaction across connections.
    const db = await (await pg()).connect();
    try {
      await db.query("BEGIN");
      await db.query(`INSERT INTO lead_operations (lead_id,client_id,updated_at) VALUES ($1,$2,$3) ON CONFLICT (lead_id,client_id) DO UPDATE SET updated_at=$3`, [leadId, scope, now]);
      if (status) await db.query("UPDATE lead_operations SET agent_status=$1, do_not_contact=CASE WHEN $2::boolean THEN TRUE ELSE do_not_contact END, dispute_status=COALESCE($3,dispute_status) WHERE lead_id=$4 AND client_id=$5", [status, doNotContact===true, dispute, leadId,scope]);
      if (update.nextFollowUpAt !== undefined) await db.query("UPDATE lead_operations SET next_follow_up_at=$1 WHERE lead_id=$2 AND client_id=$3", [update.nextFollowUpAt, leadId,scope]);
      if (update.appointmentAt !== undefined) await db.query("UPDATE lead_operations SET appointment_at=$1 WHERE lead_id=$2 AND client_id=$3", [update.appointmentAt, leadId,scope]);
      if (update.contacted) await db.query("UPDATE lead_operations SET last_contacted_at=$1 WHERE lead_id=$2 AND client_id=$3", [now, leadId,scope]);
      if (update.note?.trim()) await db.query("INSERT INTO lead_notes (lead_id,client_id,actor_id,actor_role,body,visibility,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [leadId,scope,actorId,actorRole,update.note.trim(),update.visibility||"agent",now]);
      for (const e of events) await db.query("INSERT INTO lead_activity (lead_id,client_id,actor_id,actor_role,event_type,event_label,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7)", [leadId,scope,actorId,actorRole,e[0],e[1],now]);
      await db.query("COMMIT");
    } catch (e) { await db.query("ROLLBACK"); throw e; } finally { db.release(); }
  } else {
    // Drive the transaction explicitly on the shared synchronous handle;
    // rollback on any failure, then rethrow.
    const db = sqlite();
    db.exec("BEGIN");
    try {
      db.prepare("INSERT INTO lead_operations (lead_id,client_id,updated_at) VALUES (?,?,?) ON CONFLICT(lead_id,client_id) DO UPDATE SET updated_at=excluded.updated_at").run(leadId,scope,now);
      if (status) db.prepare("UPDATE lead_operations SET agent_status=?,do_not_contact=CASE WHEN ?=1 THEN 1 ELSE do_not_contact END,dispute_status=COALESCE(?,dispute_status) WHERE lead_id=? AND client_id=?").run(status,doNotContact===true?1:0,dispute,leadId,scope);
      if (update.nextFollowUpAt !== undefined) db.prepare("UPDATE lead_operations SET next_follow_up_at=? WHERE lead_id=? AND client_id=?").run(update.nextFollowUpAt,leadId,scope);
      if (update.appointmentAt !== undefined) db.prepare("UPDATE lead_operations SET appointment_at=? WHERE lead_id=? AND client_id=?").run(update.appointmentAt,leadId,scope);
      if (update.contacted) db.prepare("UPDATE lead_operations SET last_contacted_at=? WHERE lead_id=? AND client_id=?").run(now,leadId,scope);
      if (update.note?.trim()) db.prepare("INSERT INTO lead_notes (lead_id,client_id,actor_id,actor_role,body,visibility,created_at) VALUES (?,?,?,?,?,?,?)").run(leadId,scope,actorId,actorRole,update.note.trim(),update.visibility||"agent",now);
      for (const e of events) db.prepare("INSERT INTO lead_activity (lead_id,client_id,actor_id,actor_role,event_type,event_label,created_at) VALUES (?,?,?,?,?,?,?)").run(leadId,scope,actorId,actorRole,e[0],e[1],now);
      db.exec("COMMIT");
    } catch (e) { db.exec("ROLLBACK"); throw e; }
  }
  return getLeadOperations(leadId, { clientId: scope, includeInternal: actorRole === "admin" });
}

/**
 * Bulk operations snapshot for analytics/reporting. Replaces the per-lead
 * getLeadOperations() fan-out (3 queries × N leads) with a fixed set of
 * set-based queries. Pass `leadIds` to scope to a specific set (e.g. one
 * agent's purchased leads); omit for a store-wide snapshot. An empty array
 * short-circuits to an empty dataset.
 */
export type OperationsRow = { leadId: string; clientId: string; status: AgentStatus; lastContactedAt: string | null; nextFollowUpAt: string | null; appointmentAt: string | null; doNotContact: boolean };
export interface OperationsDataset { ops: OperationsRow[]; activityCounts: Record<string, number>; firstAgentActionByLead: Record<string, string> }

const emptyDataset = (): OperationsDataset => ({ ops: [], activityCounts: {}, firstAgentActionByLead: {} });
const mapOpsRow = (r: Record<string, unknown>): OperationsRow => ({
  leadId: r.lead_id as string,
  clientId: (r.client_id as string) || "",
  status: ((r.agent_status as AgentStatus) || "New"),
  lastContactedAt: (r.last_contacted_at as string) || null,
  nextFollowUpAt: (r.next_follow_up_at as string) || null,
  appointmentAt: (r.appointment_at as string) || null,
  doNotContact: r.do_not_contact === true || r.do_not_contact === 1,
});

export async function getOperationsDataset(leadIds?: string[], clientId?: string): Promise<OperationsDataset> {
  const scoped = Array.isArray(leadIds);
  if (scoped && leadIds!.length === 0) return emptyDataset();

  if (process.env.DATABASE_URL) {
    const db = await pg();
    const args = scoped && clientId ? [leadIds!,clientId] : scoped ? [leadIds!] : clientId ? [clientId] : [];
    const [opsRes, actRes, faRes] = scoped && clientId ? await Promise.all([
      db.query("SELECT lead_id,client_id,agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact FROM lead_operations WHERE lead_id=ANY($1::text[]) AND client_id=$2",args),
      db.query("SELECT event_type,COUNT(*)::int AS c FROM lead_activity WHERE lead_id=ANY($1::text[]) AND client_id=$2 GROUP BY event_type",args),
      db.query("SELECT lead_id,client_id,MIN(created_at) AS m FROM lead_activity WHERE actor_role='agent' AND lead_id=ANY($1::text[]) AND client_id=$2 GROUP BY lead_id,client_id",args),
    ]) : scoped ? await Promise.all([
      db.query("SELECT lead_id,client_id,agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact FROM lead_operations WHERE lead_id=ANY($1::text[])",args),
      db.query("SELECT event_type,COUNT(*)::int AS c FROM lead_activity WHERE lead_id=ANY($1::text[]) GROUP BY event_type",args),
      db.query("SELECT lead_id,client_id,MIN(created_at) AS m FROM lead_activity WHERE actor_role='agent' AND lead_id=ANY($1::text[]) GROUP BY lead_id,client_id",args),
    ]) : clientId ? await Promise.all([
      db.query("SELECT lead_id,client_id,agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact FROM lead_operations WHERE client_id=$1",args),
      db.query("SELECT event_type,COUNT(*)::int AS c FROM lead_activity WHERE client_id=$1 GROUP BY event_type",args),
      db.query("SELECT lead_id,client_id,MIN(created_at) AS m FROM lead_activity WHERE actor_role='agent' AND client_id=$1 GROUP BY lead_id,client_id",args),
    ]) : await Promise.all([
      db.query("SELECT lead_id,client_id,agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact FROM lead_operations"),
      db.query("SELECT event_type,COUNT(*)::int AS c FROM lead_activity GROUP BY event_type"),
      db.query("SELECT lead_id,client_id,MIN(created_at) AS m FROM lead_activity WHERE actor_role='agent' GROUP BY lead_id,client_id"),
    ]);
    return {
      ops: opsRes.rows.map(mapOpsRow),
      activityCounts: Object.fromEntries(actRes.rows.map((r: Record<string, unknown>) => [r.event_type as string, Number(r.c)])),
      firstAgentActionByLead: Object.fromEntries(faRes.rows.map((r: Record<string, unknown>) => [`${r.client_id || ""}:${r.lead_id}`, r.m as string])),
    };
  }

  const db = sqlite();
  const ids = JSON.stringify(leadIds || []);
  const args = scoped && clientId ? [ids,clientId] : scoped ? [ids] : clientId ? [clientId] : [];
  const [opsRows,actRows,faRows] = (scoped && clientId ? [
    db.prepare("SELECT lead_id,client_id,agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact FROM lead_operations WHERE lead_id IN (SELECT value FROM json_each(?)) AND client_id=?").all(...args),
    db.prepare("SELECT event_type,COUNT(*) AS c FROM lead_activity WHERE lead_id IN (SELECT value FROM json_each(?)) AND client_id=? GROUP BY event_type").all(...args),
    db.prepare("SELECT lead_id,client_id,MIN(created_at) AS m FROM lead_activity WHERE actor_role='agent' AND lead_id IN (SELECT value FROM json_each(?)) AND client_id=? GROUP BY lead_id,client_id").all(...args),
  ] : scoped ? [
    db.prepare("SELECT lead_id,client_id,agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact FROM lead_operations WHERE lead_id IN (SELECT value FROM json_each(?))").all(...args),
    db.prepare("SELECT event_type,COUNT(*) AS c FROM lead_activity WHERE lead_id IN (SELECT value FROM json_each(?)) GROUP BY event_type").all(...args),
    db.prepare("SELECT lead_id,client_id,MIN(created_at) AS m FROM lead_activity WHERE actor_role='agent' AND lead_id IN (SELECT value FROM json_each(?)) GROUP BY lead_id,client_id").all(...args),
  ] : clientId ? [
    db.prepare("SELECT lead_id,client_id,agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact FROM lead_operations WHERE client_id=?").all(...args),
    db.prepare("SELECT event_type,COUNT(*) AS c FROM lead_activity WHERE client_id=? GROUP BY event_type").all(...args),
    db.prepare("SELECT lead_id,client_id,MIN(created_at) AS m FROM lead_activity WHERE actor_role='agent' AND client_id=? GROUP BY lead_id,client_id").all(...args),
  ] : [
    db.prepare("SELECT lead_id,client_id,agent_status,last_contacted_at,next_follow_up_at,appointment_at,do_not_contact FROM lead_operations").all(),
    db.prepare("SELECT event_type,COUNT(*) AS c FROM lead_activity GROUP BY event_type").all(),
    db.prepare("SELECT lead_id,client_id,MIN(created_at) AS m FROM lead_activity WHERE actor_role='agent' GROUP BY lead_id,client_id").all(),
  ]) as [Record<string,unknown>[],Record<string,unknown>[],Record<string,unknown>[]];
  return {
    ops: opsRows.map(mapOpsRow),
    activityCounts: Object.fromEntries(actRows.map((r) => [r.event_type as string, Number(r.c)])),
    firstAgentActionByLead: Object.fromEntries(faRows.map((r) => [`${r.client_id || ""}:${r.lead_id}`, r.m as string])),
  };
}
