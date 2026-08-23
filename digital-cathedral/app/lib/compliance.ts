import path from "path";

export const ACKNOWLEDGEMENT_VERSION = "responsible-lead-handling-v1";
export const PRIVACY_REQUEST_TYPES = ["access", "deletion", "correction", "opt-out", "data-sharing-inquiry", "other"] as const;
export const PRIVACY_REQUEST_STATUSES = ["new", "reviewing", "needs-verification", "completed", "denied", "canceled"] as const;

export type AuditEvent = { id: number; createdAt: string; actorId: string; actorRole: string; eventType: string; targetType: string; targetId: string; summary: string; ip: string | null; userAgent: string | null };
export type Suppression = { id: number; kind: "phone" | "email"; valueMasked: string; valueHash: string; reason: string; source: string; active: boolean; createdBy: string; createdAt: string };
export type PrivacyRequest = { id: number; leadId: string | null; requester: string; requestType: string; status: string; targetDate: string | null; assignedAdmin: string | null; notes: string; completedAt: string | null; createdAt: string; updatedAt: string };
export type Acknowledgement = { agentId: string; version: string; acknowledgedAt: string; active: boolean };

const sqliteSchema = `
CREATE TABLE IF NOT EXISTS compliance_suppressions (id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, value_hash TEXT NOT NULL, value_masked TEXT NOT NULL, reason TEXT NOT NULL, source TEXT NOT NULL, active INTEGER NOT NULL DEFAULT 1, created_by TEXT NOT NULL, created_at TEXT NOT NULL, UNIQUE(kind,value_hash));
CREATE TABLE IF NOT EXISTS privacy_requests (id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT, requester TEXT NOT NULL, request_type TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'new', target_date TEXT, assigned_admin TEXT, notes TEXT NOT NULL DEFAULT '', completed_at TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL);
CREATE TABLE IF NOT EXISTS agent_acknowledgements (agent_id TEXT PRIMARY KEY, version TEXT NOT NULL, acknowledged_at TEXT NOT NULL, ip TEXT, user_agent TEXT, active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS compliance_audit (id INTEGER PRIMARY KEY AUTOINCREMENT, created_at TEXT NOT NULL, actor_id TEXT NOT NULL, actor_role TEXT NOT NULL, event_type TEXT NOT NULL, target_type TEXT NOT NULL, target_id TEXT NOT NULL, summary TEXT NOT NULL, ip TEXT, user_agent TEXT);
CREATE TABLE IF NOT EXISTS compliance_reviews (lead_id TEXT PRIMARY KEY, reviewed_at TEXT NOT NULL, reviewed_by TEXT NOT NULL);
CREATE INDEX IF NOT EXISTS idx_compliance_audit_created ON compliance_audit(created_at);
CREATE INDEX IF NOT EXISTS idx_privacy_status ON privacy_requests(status);`;

let sqliteDb: import("better-sqlite3").Database | null = null;
function sqlite() {
  if (sqliteDb) return sqliteDb;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Database = require("better-sqlite3");
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const fs = require("fs");
  const dir = process.env.VERCEL ? path.join("/tmp", ".cathedral") : path.join(process.cwd(), ".cathedral");
  fs.mkdirSync(dir, { recursive: true });
  sqliteDb = new Database(path.join(dir, "leads.db"));
  sqliteDb!.exec(sqliteSchema);
  return sqliteDb!;
}

let poolReady: Promise<import("pg").Pool> | null = null;
async function pg() {
  if (!poolReady) poolReady = (async () => {
    const { Pool } = await import("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.NODE_ENV === "production" ? { rejectUnauthorized: false } : undefined });
    await pool.query(sqliteSchema.replaceAll("INTEGER PRIMARY KEY AUTOINCREMENT", "SERIAL PRIMARY KEY").replaceAll("active INTEGER NOT NULL DEFAULT 1", "active BOOLEAN NOT NULL DEFAULT TRUE"));
    return pool;
  })();
  return poolReady;
}

const hashValue = (value: string) => require("crypto").createHash("sha256").update(value.trim().toLowerCase()).digest("hex") as string;
export function maskContact(value: string) { const v = value.trim(); return v.includes("@") ? `${v.slice(0, 2)}•••@${v.split("@")[1]}` : `•••${v.replace(/\D/g, "").slice(-4)}`; }
const bool = (value: unknown) => value === true || value === 1;

export async function recordAudit(input: Omit<AuditEvent, "id" | "createdAt">) {
  const now = new Date().toISOString();
  const values = [now, input.actorId, input.actorRole, input.eventType, input.targetType, input.targetId, input.summary, input.ip, input.userAgent];
  if (process.env.DATABASE_URL) await (await pg()).query("INSERT INTO compliance_audit (created_at,actor_id,actor_role,event_type,target_type,target_id,summary,ip,user_agent) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)", values);
  else sqlite().prepare("INSERT INTO compliance_audit (created_at,actor_id,actor_role,event_type,target_type,target_id,summary,ip,user_agent) VALUES (?,?,?,?,?,?,?,?,?)").run(...values);
}

export async function addSuppression(kind: "phone" | "email", value: string, reason: string, source: string, actorId: string) {
  const hash = hashValue(value), masked = maskContact(value), now = new Date().toISOString();
  if (process.env.DATABASE_URL) await (await pg()).query("INSERT INTO compliance_suppressions (kind,value_hash,value_masked,reason,source,active,created_by,created_at) VALUES ($1,$2,$3,$4,$5,TRUE,$6,$7) ON CONFLICT(kind,value_hash) DO UPDATE SET active=TRUE,reason=$4,source=$5", [kind,hash,masked,reason,source,actorId,now]);
  else sqlite().prepare("INSERT INTO compliance_suppressions (kind,value_hash,value_masked,reason,source,active,created_by,created_at) VALUES (?,?,?,?,?,1,?,?) ON CONFLICT(kind,value_hash) DO UPDATE SET active=1,reason=excluded.reason,source=excluded.source").run(kind,hash,masked,reason,source,actorId,now);
  await recordAudit({ actorId, actorRole: actorId === "admin" ? "admin" : "agent", eventType: "suppression_added", targetType: kind, targetId: hash.slice(0, 12), summary: `${kind} suppression added`, ip: null, userAgent: null });
}

export async function isSuppressed(phone: string, email: string) {
  const hashes = [hashValue(phone), hashValue(email)];
  if (process.env.DATABASE_URL) return Number((await (await pg()).query("SELECT COUNT(*) n FROM compliance_suppressions WHERE active=TRUE AND value_hash=ANY($1)", [hashes])).rows[0].n) > 0;
  return (sqlite().prepare("SELECT COUNT(*) n FROM compliance_suppressions WHERE active=1 AND value_hash IN (?,?)").get(...hashes) as {n:number}).n > 0;
}

export async function acknowledgeAgent(agentId: string, ip: string | null, userAgent: string | null) {
  const now = new Date().toISOString();
  if (process.env.DATABASE_URL) await (await pg()).query("INSERT INTO agent_acknowledgements (agent_id,version,acknowledged_at,ip,user_agent,active) VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT(agent_id) DO UPDATE SET version=$2,acknowledged_at=$3,ip=$4,user_agent=$5,active=TRUE", [agentId,ACKNOWLEDGEMENT_VERSION,now,ip,userAgent]);
  else sqlite().prepare("INSERT INTO agent_acknowledgements (agent_id,version,acknowledged_at,ip,user_agent,active) VALUES (?,?,?,?,?,1) ON CONFLICT(agent_id) DO UPDATE SET version=excluded.version,acknowledged_at=excluded.acknowledged_at,ip=excluded.ip,user_agent=excluded.user_agent,active=1").run(agentId,ACKNOWLEDGEMENT_VERSION,now,ip,userAgent);
  await recordAudit({ actorId: agentId, actorRole: "agent", eventType: "agent_acknowledgement_completed", targetType: "agent", targetId: agentId, summary: `Compliance acknowledgement ${ACKNOWLEDGEMENT_VERSION} completed`, ip, userAgent });
}

export async function getAcknowledgement(agentId: string): Promise<Acknowledgement | null> {
  const row = process.env.DATABASE_URL ? (await (await pg()).query("SELECT * FROM agent_acknowledgements WHERE agent_id=$1", [agentId])).rows[0] : sqlite().prepare("SELECT * FROM agent_acknowledgements WHERE agent_id=?").get(agentId) as Record<string,unknown> | undefined;
  return row ? { agentId: row.agent_id, version: row.version, acknowledgedAt: row.acknowledged_at, active: bool(row.active) } : null;
}

export async function createPrivacyRequest(input: { leadId?: string; requester: string; requestType: string; targetDate?: string; notes?: string }, actorId: string) {
  const now = new Date().toISOString(), values = [input.leadId || null,input.requester,input.requestType,"new",input.targetDate || null,input.notes || "",now,now];
  if (process.env.DATABASE_URL) await (await pg()).query("INSERT INTO privacy_requests (lead_id,requester,request_type,status,target_date,notes,created_at,updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8)", values);
  else sqlite().prepare("INSERT INTO privacy_requests (lead_id,requester,request_type,status,target_date,notes,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?)").run(...values);
  await recordAudit({ actorId, actorRole:"admin", eventType:"privacy_request_created", targetType:"lead", targetId:input.leadId || "unlinked", summary:`${input.requestType} privacy request created`, ip:null, userAgent:null });
}

export async function updatePrivacyRequest(id: number, status: string, notes: string, assignedAdmin: string | null, actorId: string) {
  const now = new Date().toISOString(), completed = status === "completed" ? now : null;
  if (process.env.DATABASE_URL) await (await pg()).query("UPDATE privacy_requests SET status=$1,notes=$2,assigned_admin=$3,completed_at=$4,updated_at=$5 WHERE id=$6", [status,notes,assignedAdmin,completed,now,id]);
  else sqlite().prepare("UPDATE privacy_requests SET status=?,notes=?,assigned_admin=?,completed_at=?,updated_at=? WHERE id=?").run(status,notes,assignedAdmin,completed,now,id);
  await recordAudit({ actorId, actorRole:"admin", eventType:"privacy_request_updated", targetType:"privacy_request", targetId:String(id), summary:`Privacy request moved to ${status}`, ip:null, userAgent:null });
}

export async function markComplianceReviewed(leadId: string, actorId: string) {
  const now = new Date().toISOString();
  if (process.env.DATABASE_URL) await (await pg()).query("INSERT INTO compliance_reviews (lead_id,reviewed_at,reviewed_by) VALUES ($1,$2,$3) ON CONFLICT(lead_id) DO UPDATE SET reviewed_at=$2,reviewed_by=$3", [leadId,now,actorId]);
  else sqlite().prepare("INSERT INTO compliance_reviews (lead_id,reviewed_at,reviewed_by) VALUES (?,?,?) ON CONFLICT(lead_id) DO UPDATE SET reviewed_at=excluded.reviewed_at,reviewed_by=excluded.reviewed_by").run(leadId,now,actorId);
  await recordAudit({ actorId,actorRole:"admin",eventType:"compliance_reviewed",targetType:"lead",targetId:leadId,summary:"Lead compliance record reviewed",ip:null,userAgent:null });
}

export async function getComplianceData() {
  const query = async (sql:string) => process.env.DATABASE_URL ? (await (await pg()).query(sql)).rows : sqlite().prepare(sql.replaceAll("TRUE","1").replaceAll("FALSE","0")).all() as Record<string,unknown>[];
  const [suppressions,privacy,audit,acks,reviews] = await Promise.all([query("SELECT * FROM compliance_suppressions ORDER BY created_at DESC LIMIT 100"),query("SELECT * FROM privacy_requests ORDER BY created_at DESC LIMIT 100"),query("SELECT * FROM compliance_audit ORDER BY created_at DESC LIMIT 100"),query("SELECT * FROM agent_acknowledgements WHERE active=TRUE"),query("SELECT * FROM compliance_reviews")]);
  return {
    suppressions: suppressions.map(r=>({id:Number(r.id),kind:r.kind,valueMasked:r.value_masked,valueHash:r.value_hash,reason:r.reason,source:r.source,active:bool(r.active),createdBy:r.created_by,createdAt:r.created_at})),
    privacyRequests: privacy.map(r=>({id:Number(r.id),leadId:r.lead_id,requester:r.requester,requestType:r.request_type,status:r.status,targetDate:r.target_date,assignedAdmin:r.assigned_admin,notes:r.notes,completedAt:r.completed_at,createdAt:r.created_at,updatedAt:r.updated_at})),
    audit: audit.map(r=>({id:Number(r.id),createdAt:r.created_at,actorId:r.actor_id,actorRole:r.actor_role,eventType:r.event_type,targetType:r.target_type,targetId:r.target_id,summary:r.summary,ip:r.ip,userAgent:r.user_agent})),
    acknowledgements: acks.map(r=>({agentId:r.agent_id,version:r.version,acknowledgedAt:r.acknowledged_at,active:bool(r.active)})), reviewedLeadIds: reviews.map(r=>String(r.lead_id)),
  };
}
