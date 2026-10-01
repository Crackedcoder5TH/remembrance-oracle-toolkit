/**
 * Compliance on the substrate (opt-in) — Phase 2 of the field wiring: the
 * last SQL residue beside lead-operations. Five stores move onto the
 * field's `legacy` record store (the field-server's oracle.db legacies),
 * each in the shape its semantics demand:
 *
 *   AUDIT — append-only, one record per event, id `audit:<millis>:<n>`
 *     (unique forever, never overwritten). An audit that is append-only
 *     and coherence-scored on entry is strictly stronger than a mutable
 *     SQL table: nothing can be edited after the fact, and reads replay
 *     the ledger newest-first. Best-effort like the relational path — an
 *     audit write must NEVER fail the action it records.
 *   SUPPRESSIONS — keyed rows, id `suppression:<kind>:<hash>`, upsert
 *     with the SQL path's exact conflict semantics (active/reason/source
 *     refresh; createdBy/createdAt keep their first values).
 *   ACKNOWLEDGEMENTS — id `ack:<agentId>`, whole-row upsert.
 *   PRIVACY REQUESTS — id `privacy:<millis>` (time-ordered, bumped past
 *     any same-millisecond collision, the substrate-messages pattern);
 *     update is read-modify-write of that one record.
 *   REVIEWS — id `review:<leadId>`, whole-row upsert.
 *
 * Discipline mirrors lead-operations-substrate: best-effort, the
 * relational adapter stays the DEFAULT, and nothing here computes a
 * coherency — the field server scores every record with the one
 * instrument as it enters.
 */

import { getRecord, storeRecord, listRecords } from "./valor/remembrance-bridge";
import { SUBSTRATE_LEADS } from "./substrate-leads";
import type { Acknowledgement, AuditEvent, PrivacyRequest, Suppression } from "./compliance";

/** Compliance follows its leads: same gate, one source of truth. */
export const SUBSTRATE_COMPLIANCE = SUBSTRATE_LEADS;

const AUDIT_TAG = "compliance-audit";
const SUPPRESSION_TAG = "compliance-suppression";
const ACK_TAG = "compliance-ack";
const PRIVACY_TAG = "compliance-privacy";
const REVIEW_TAG = "compliance-review";
const LIST_WINDOW = 100;          // matches the SQL views' LIMIT 100
const FULL_WINDOW = 1000;         // acks/reviews had no SQL limit; a sane cap

const parse = <T>(content: string | undefined | null): T | null => {
  if (!content) return null;
  try { return JSON.parse(content) as T; } catch { return null; }
};

// ── audit: the append-only witnessed log ─────────────────────────────
let _auditSeq = 0;
export async function substrateRecordAudit(input: Omit<AuditEvent, "id" | "createdAt">): Promise<void> {
  if (!input || !input.actorId || !input.eventType || !input.targetId) return;
  try {
    const now = Date.now();
    const event: AuditEvent = { id: now, createdAt: new Date(now).toISOString(), ...input };
    _auditSeq = (_auditSeq + 1) % 10_000;
    await storeRecord({
      id: `audit:${now}:${_auditSeq}`,
      name: input.eventType,
      content: JSON.stringify(event),
      tags: [AUDIT_TAG, `evt:${input.eventType}`, `actor:${input.actorRole}`],
    });
  } catch { /* best-effort: never throw from the audit path */ }
}

// ── suppressions ─────────────────────────────────────────────────────
const suppressionId = (kind: string, hash: string): string => {
  if (!kind || !hash) throw new TypeError("suppressionId requires kind and hash");
  return `suppression:${kind}:${hash}`;
};

export async function substrateAddSuppression(
  kind: "phone" | "email", hash: string, masked: string, reason: string, source: string, actorId: string,
): Promise<void> {
  const existing = parse<Suppression>((await getRecord(suppressionId(kind, hash)))?.content);
  const now = new Date().toISOString();
  const row: Suppression = {
    id: existing?.id ?? Date.now(),
    kind, valueMasked: masked, valueHash: hash,
    reason, source, active: true,
    createdBy: existing?.createdBy ?? actorId,     // conflict semantics: first writer kept
    createdAt: existing?.createdAt ?? now,
  };
  await storeRecord({
    id: suppressionId(kind, hash),
    name: suppressionId(kind, hash),
    content: JSON.stringify(row),
    tags: [SUPPRESSION_TAG, `kind:${kind}`, "active"],
  });
}

export async function substrateIsSuppressed(phoneHash: string, emailHash: string): Promise<boolean> {
  if (typeof phoneHash !== "string" || typeof emailHash !== "string") throw new TypeError("Contact hashes must be strings");
  const [p, e] = await Promise.all([
    getRecord(suppressionId("phone", phoneHash)),
    getRecord(suppressionId("email", emailHash)),
  ]);
  const active = (rec: { content: string } | null) => parse<Suppression>(rec?.content)?.active === true;
  return active(p) || active(e);
}

// ── acknowledgements ─────────────────────────────────────────────────
export async function substrateAcknowledgeAgent(agentId: string, version: string, ip: string | null, userAgent: string | null): Promise<void> {
  if (!agentId?.trim() || !version?.trim()) throw new TypeError("Agent id and version are required");
  const row = { agentId, version, acknowledgedAt: new Date().toISOString(), ip, userAgent, active: true };
  await storeRecord({ id: `ack:${agentId}`, name: `ack:${agentId}`, content: JSON.stringify(row), tags: [ACK_TAG, "active"] });
}

export async function substrateGetAcknowledgement(agentId: string): Promise<Acknowledgement | null> {
  const row = parse<Acknowledgement & { active?: boolean }>((await getRecord(`ack:${agentId}`))?.content);
  return row ? { agentId: row.agentId, version: row.version, acknowledgedAt: row.acknowledgedAt, active: row.active === true } : null;
}

// ── privacy requests ─────────────────────────────────────────────────
const privacyId = (id: number) => `privacy:${id}`;

export async function substrateCreatePrivacyRequest(
  input: { leadId?: string; requester: string; requestType: string; targetDate?: string; notes?: string },
): Promise<number> {
  let id = Date.now();
  while (await getRecord(privacyId(id))) id += 1;   // time-ordered, collision-bumped
  const now = new Date().toISOString();
  const row: PrivacyRequest = {
    id, leadId: input.leadId || null, requester: input.requester, requestType: input.requestType,
    status: "new", targetDate: input.targetDate || null, assignedAdmin: null,
    notes: input.notes || "", completedAt: null, createdAt: now, updatedAt: now,
  };
  await storeRecord({
    id: privacyId(id), name: privacyId(id), content: JSON.stringify(row),
    tags: [PRIVACY_TAG, `lead:${row.leadId || "unlinked"}`, "status:new"],
  });
  return id;
}

export async function substrateUpdatePrivacyRequest(id: number, status: string, notes: string, assignedAdmin: string | null): Promise<void> {
  const row = parse<PrivacyRequest>((await getRecord(privacyId(id)))?.content);
  if (!row) return;                                  // SQL UPDATE of a missing row affects 0
  const now = new Date().toISOString();
  row.status = status; row.notes = notes; row.assignedAdmin = assignedAdmin;
  row.completedAt = status === "completed" ? now : null; row.updatedAt = now;
  await storeRecord({
    id: privacyId(id), name: privacyId(id), content: JSON.stringify(row),
    tags: [PRIVACY_TAG, `lead:${row.leadId || "unlinked"}`, `status:${status}`],
  });
}

// ── reviews ──────────────────────────────────────────────────────────
export async function substrateMarkComplianceReviewed(leadId: string, actorId: string): Promise<void> {
  if (!leadId?.trim() || !actorId?.trim()) throw new TypeError("Lead id and actor id are required");
  const row = { leadId, reviewedAt: new Date().toISOString(), reviewedBy: actorId };
  await storeRecord({ id: `review:${leadId}`, name: `review:${leadId}`, content: JSON.stringify(row), tags: [REVIEW_TAG] });
}

// ── the read views ───────────────────────────────────────────────────
export async function substrateGetLeadComplianceView(leadId: string, phoneHash: string, emailHash: string) {
  if (!leadId?.trim() || typeof phoneHash !== "string" || typeof emailHash !== "string") throw new TypeError("Lead id and contact hashes are required");
  const [suppressed, reviewRec, privacy] = await Promise.all([
    substrateIsSuppressed(phoneHash, emailHash),
    getRecord(`review:${leadId}`),
    listRecords({ tags: [PRIVACY_TAG, `lead:${leadId}`], limit: LIST_WINDOW }),
  ]);
  return {
    suppressed,
    reviewed: Boolean(reviewRec),
    privacyRequests: privacy.records
      .map((r) => parse<PrivacyRequest>(r.content))
      .filter((r): r is PrivacyRequest => r !== null)
      .map((r) => ({ id: r.id, requestType: r.requestType, status: r.status })),
  };
}

export async function substrateGetComplianceData() {
  const [supp, priv, audit, acks, reviews] = await Promise.all([
    listRecords({ tags: [SUPPRESSION_TAG], limit: LIST_WINDOW }),
    listRecords({ tags: [PRIVACY_TAG], limit: LIST_WINDOW }),
    listRecords({ tags: [AUDIT_TAG], limit: LIST_WINDOW }),
    listRecords({ tags: [ACK_TAG, "active"], limit: FULL_WINDOW }),
    listRecords({ tags: [REVIEW_TAG], limit: FULL_WINDOW }),
  ]);
  const rows = <T>(rs: { records: Array<{ content: string }> }): T[] =>
    rs.records.map((r) => parse<T>(r.content)).filter((r): r is T => r !== null);
  return {
    suppressions: rows<Suppression>(supp),
    privacyRequests: rows<PrivacyRequest>(priv),
    audit: rows<AuditEvent>(audit),
    acknowledgements: rows<Acknowledgement & { active: boolean }>(acks)
      .filter((a) => a.active)
      .map((a) => ({ agentId: a.agentId, version: a.version, acknowledgedAt: a.acknowledgedAt, active: true })),
    reviewedLeadIds: rows<{ leadId: string }>(reviews).map((r) => String(r.leadId)),
  };
}
