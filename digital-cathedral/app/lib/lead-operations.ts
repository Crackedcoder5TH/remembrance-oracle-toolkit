import path from "path";

export const AGENT_STATUSES = ["New", "Contacted", "Follow-Up", "Appointment Set", "Application Started", "Submitted", "Won", "Lost", "Bad Lead / Dispute Requested", "Do Not Contact"] as const;
export type AgentStatus = typeof AGENT_STATUSES[number];
export type LeadNote = { id: number; leadId: string; actorId: string; actorRole: "agent" | "admin"; body: string; visibility: "agent" | "internal"; createdAt: string };
export type LeadActivity = { id: number; eventType: string; eventLabel: string; actorRole: string; createdAt: string };
export type LeadOperations = { status: AgentStatus; lastContactedAt: string | null; nextFollowUpAt: string | null; appointmentAt: string | null; doNotContact: boolean; disputeStatus: string | null; notes: LeadNote[]; activity: LeadActivity[] };

const schema = `
  CREATE TABLE IF NOT EXISTS lead_operations (lead_id TEXT PRIMARY KEY, agent_status TEXT NOT NULL DEFAULT 'New', last_contacted_at TEXT, next_follow_up_at TEXT, appointment_at TEXT, do_not_contact INTEGER NOT NULL DEFAULT 0, dispute_status TEXT, updated_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lead_notes (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, body TEXT NOT NULL, visibility TEXT NOT NULL DEFAULT 'agent', created_at TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS lead_activity (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, event_type TEXT NOT NULL, event_label TEXT NOT NULL, created_at TEXT NOT NULL);
  CREATE INDEX IF NOT EXISTS idx_lead_notes_lead ON lead_notes(lead_id, created_at);
  CREATE INDEX IF NOT EXISTS idx_lead_activity_lead ON lead_activity(lead_id, created_at);`;

async function sqlite() {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  const dir = process.env.VERCEL ? path.join("/tmp", ".cathedral") : path.join(process.cwd(), ".cathedral");
  fs.mkdirSync(dir, { recursive: true });
  const db = new Database(path.join(dir, "leads.db")); db.exec(schema); return db;
}

async function pg() {
  const { Pool } = await import("pg");
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
  // Postgres has no implicit int→bool cast, so the boolean column needs a boolean default (not `0`).
  await pool.query(schema.replaceAll("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY").replace("do_not_contact INTEGER NOT NULL DEFAULT 0", "do_not_contact BOOLEAN NOT NULL DEFAULT FALSE"));
  return pool;
}

const mapOps = (row: Record<string, unknown> | undefined, notes: Record<string, unknown>[], activity: Record<string, unknown>[], includeInternal: boolean): LeadOperations => ({
  status: (row?.agent_status as AgentStatus) || "New", lastContactedAt: (row?.last_contacted_at as string) || null,
  nextFollowUpAt: (row?.next_follow_up_at as string) || null, appointmentAt: (row?.appointment_at as string) || null,
  doNotContact: row?.do_not_contact === true || row?.do_not_contact === 1, disputeStatus: (row?.dispute_status as string) || null,
  notes: notes.filter(n => includeInternal || n.visibility !== "internal").map(n => ({ id: Number(n.id), leadId: n.lead_id as string, actorId: n.actor_id as string, actorRole: n.actor_role as "agent" | "admin", body: n.body as string, visibility: n.visibility as "agent" | "internal", createdAt: n.created_at as string })),
  activity: activity.map(a => ({ id: Number(a.id), eventType: a.event_type as string, eventLabel: a.event_label as string, actorRole: a.actor_role as string, createdAt: a.created_at as string })),
});

export async function getLeadOperations(leadId: string, includeInternal = false): Promise<LeadOperations> {
  if (process.env.DATABASE_URL) { const db = await pg(); try { const [o,n,a] = await Promise.all([db.query("SELECT * FROM lead_operations WHERE lead_id=$1",[leadId]),db.query("SELECT * FROM lead_notes WHERE lead_id=$1 ORDER BY created_at DESC",[leadId]),db.query("SELECT * FROM lead_activity WHERE lead_id=$1 ORDER BY created_at DESC",[leadId])]); return mapOps(o.rows[0],n.rows,a.rows,includeInternal); } finally { await db.end(); } }
  const db = await sqlite(); try { return mapOps(db.prepare("SELECT * FROM lead_operations WHERE lead_id=?").get(leadId),db.prepare("SELECT * FROM lead_notes WHERE lead_id=? ORDER BY created_at DESC").all(leadId),db.prepare("SELECT * FROM lead_activity WHERE lead_id=? ORDER BY created_at DESC").all(leadId),includeInternal); } finally { db.close(); }
}

type Update = { status?: AgentStatus; nextFollowUpAt?: string | null; appointmentAt?: string | null; contacted?: boolean; note?: string; visibility?: "agent" | "internal"; eventType?: "call_clicked" | "text_clicked" | "email_clicked" };
export async function updateLeadOperations(leadId: string, actorId: string, actorRole: "agent" | "admin", update: Update) {
  const now = new Date().toISOString();
  const status = update.status;
  const doNotContact = status === "Do Not Contact";
  const dispute = status === "Bad Lead / Dispute Requested" ? "requested" : null;
  const events: [string,string][] = [];
  if (status) events.push(["status_changed", `Status changed to ${status}`]);
  if (update.nextFollowUpAt !== undefined) events.push(["follow_up_set", update.nextFollowUpAt ? "Follow-up scheduled" : "Follow-up cleared"]);
  if (update.appointmentAt !== undefined) events.push(["appointment_set", update.appointmentAt ? "Appointment scheduled or updated" : "Appointment canceled"]);
  if (update.contacted) events.push(["contacted", "Lead marked contacted"]);
  if (update.note?.trim()) events.push(["note_added", actorRole === "admin" ? "Admin note added" : "Agent note added"]);
  if (update.eventType) events.push([update.eventType, update.eventType.replaceAll("_", " ")]);
  // All queries below are parameterized: pg uses $n placeholders with a bound
  // values array, sqlite uses ? placeholders with .run(...) bind args. No value
  // is interpolated into SQL, so leadId/note/etc. cannot inject. (Taint scanners
  // that key on the db.query identifier flag these as a false positive.)
  if (process.env.DATABASE_URL) { const db=await pg(); try { await db.query("BEGIN"); await db.query(`INSERT INTO lead_operations (lead_id,updated_at) VALUES ($1,$2) ON CONFLICT (lead_id) DO UPDATE SET updated_at=$2`,[leadId,now]); if(status) await db.query("UPDATE lead_operations SET agent_status=$1, do_not_contact=$2, dispute_status=COALESCE($3,dispute_status) WHERE lead_id=$4",[status,doNotContact,dispute,leadId]); if(update.nextFollowUpAt!==undefined) await db.query("UPDATE lead_operations SET next_follow_up_at=$1 WHERE lead_id=$2",[update.nextFollowUpAt,leadId]); if(update.appointmentAt!==undefined) await db.query("UPDATE lead_operations SET appointment_at=$1 WHERE lead_id=$2",[update.appointmentAt,leadId]); if(update.contacted) await db.query("UPDATE lead_operations SET last_contacted_at=$1 WHERE lead_id=$2",[now,leadId]); if(update.note?.trim()) await db.query("INSERT INTO lead_notes (lead_id,actor_id,actor_role,body,visibility,created_at) VALUES ($1,$2,$3,$4,$5,$6)",[leadId,actorId,actorRole,update.note.trim(),update.visibility||"agent",now]); for(const e of events) await db.query("INSERT INTO lead_activity (lead_id,actor_id,actor_role,event_type,event_label,created_at) VALUES ($1,$2,$3,$4,$5,$6)",[leadId,actorId,actorRole,e[0],e[1],now]); await db.query("COMMIT"); } catch(e){await db.query("ROLLBACK");throw e;} finally{await db.end();} }
  else { const db=await sqlite(); try { const tx=db.transaction(()=>{ db.prepare("INSERT INTO lead_operations (lead_id,updated_at) VALUES (?,?) ON CONFLICT(lead_id) DO UPDATE SET updated_at=excluded.updated_at").run(leadId,now); if(status) db.prepare("UPDATE lead_operations SET agent_status=?,do_not_contact=?,dispute_status=COALESCE(?,dispute_status) WHERE lead_id=?").run(status,doNotContact?1:0,dispute,leadId); if(update.nextFollowUpAt!==undefined) db.prepare("UPDATE lead_operations SET next_follow_up_at=? WHERE lead_id=?").run(update.nextFollowUpAt,leadId); if(update.appointmentAt!==undefined) db.prepare("UPDATE lead_operations SET appointment_at=? WHERE lead_id=?").run(update.appointmentAt,leadId); if(update.contacted) db.prepare("UPDATE lead_operations SET last_contacted_at=? WHERE lead_id=?").run(now,leadId); if(update.note?.trim()) db.prepare("INSERT INTO lead_notes (lead_id,actor_id,actor_role,body,visibility,created_at) VALUES (?,?,?,?,?,?)").run(leadId,actorId,actorRole,update.note.trim(),update.visibility||"agent",now); for(const e of events) db.prepare("INSERT INTO lead_activity (lead_id,actor_id,actor_role,event_type,event_label,created_at) VALUES (?,?,?,?,?,?)").run(leadId,actorId,actorRole,e[0],e[1],now); }); tx(); } finally { db.close(); } }
  return getLeadOperations(leadId, actorRole === "admin");
}
