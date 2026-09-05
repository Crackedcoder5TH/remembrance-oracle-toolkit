/**
 * Lead operations on the substrate (opt-in) — the CRM half of the field wiring.
 *
 * `substrate-leads.ts` already routes the lead RECORD (contact, consent, score)
 * to the field's `legacy` store when SUBSTRATE_LEADS is on. This module does the
 * same for the OPERATIONAL layer added by the portal — agent status, follow-up
 * and appointment times, do-not-contact / dispute flags, internal notes, and the
 * activity timeline — so the field's "Valor Legacies database" (the field-server's
 * oracle.db legacies table) holds the whole lead, not just its intake snapshot.
 *
 * Shape: one record per lead, id `ops:<leadId>`, content = JSON of LeadOperations,
 * tags ["lead-ops", "st:<state?>"]. storeRecord is upsert-by-id, so an update is a
 * read-modify-write of that single record (notes/activity are appended in-record).
 *
 * Discipline mirrors substrate-leads / remembrance-bridge: best-effort, never
 * throws, degrades to a sane empty/echoed value when the field is unreachable —
 * the relational adapter stays the DEFAULT and is untouched unless the operator
 * both configures REMEMBRANCE_FIELD_URL and sets SUBSTRATE_LEADS=1.
 *
 * NOTE ON ATOMICITY: the relational path wraps its writes in a transaction; a
 * substrate record is a single upsert, so a note + status change land together
 * as one store. Concurrent writers to the SAME lead can still interleave at the
 * read-modify-write boundary (last store wins) — acceptable for this operational
 * metadata and consistent with substrate-leads' record-per-entity model. For
 * high-contention exact analytics the relational adapter remains the right tool.
 */

import { getRecord, storeRecord } from "./valor/remembrance-bridge";
import { SUBSTRATE_LEADS } from "./substrate-leads";
// Type-only import → erased at compile time, so there is no runtime cycle even
// though lead-operations.ts imports the values below. The shared derivation
// (deriveOpsMutation) runs in lead-operations.ts and its result is passed in.
import type { AgentStatus, LeadActivity, LeadNote, LeadOperations, OpsMutation, Update } from "./lead-operations";

/** Operations follow their lead: same gate as substrate-leads, one source of truth. */
export const SUBSTRATE_LEAD_OPS = SUBSTRATE_LEADS;

const opsRecordId = (leadId: string): string => "ops:" + leadId;

const emptyOps = (): LeadOperations => ({
  status: "New",
  lastContactedAt: null,
  nextFollowUpAt: null,
  appointmentAt: null,
  doNotContact: false,
  disputeStatus: null,
  notes: [],
  activity: [],
});

function parseOps(content: string): LeadOperations {
  try {
    const o = JSON.parse(content) as Partial<LeadOperations>;
    return {
      ...emptyOps(),
      ...o,
      notes: Array.isArray(o.notes) ? (o.notes as LeadNote[]) : [],
      activity: Array.isArray(o.activity) ? (o.activity as LeadActivity[]) : [],
    };
  } catch {
    return emptyOps();
  }
}

/** Next monotonic id across a record's own notes+activity (ids are per-record). */
function nextId(ops: LeadOperations): number {
  const ids = [...ops.notes.map((n) => n.id), ...ops.activity.map((a) => a.id)];
  return (ids.length ? Math.max(...ids) : 0) + 1;
}

/** Read a lead's operations from the field, filtering internal notes unless asked. */
export async function substrateGetLeadOperations(leadId: string, includeInternal = false): Promise<LeadOperations> {
  const rec = await getRecord(opsRecordId(leadId));
  const ops = rec ? parseOps(rec.content) : emptyOps();
  if (!includeInternal) ops.notes = ops.notes.filter((n) => n.visibility !== "internal");
  return ops;
}

/**
 * Apply an update to a lead's operations record. Derivation (status → dnc/dispute,
 * the activity events) is computed once by the relational path's deriveOpsMutation
 * and handed in as `mutation`, so the two stores can never drift on what an update
 * MEANS — the substrate module only decides how to PERSIST it.
 */
export async function substrateUpdateLeadOperations(
  leadId: string,
  actorId: string,
  actorRole: "agent" | "admin",
  update: Update,
  mutation: OpsMutation,
): Promise<LeadOperations> {
  const now = new Date().toISOString();
  const { status, doNotContact, dispute, events } = mutation;

  // Read the full record (internal notes included) so nothing is dropped on write.
  const rec = await getRecord(opsRecordId(leadId));
  const ops = rec ? parseOps(rec.content) : emptyOps();
  let id = nextId(ops);

  if (status) {
    ops.status = status as AgentStatus;
    ops.doNotContact = doNotContact;
    ops.disputeStatus = dispute !== null ? dispute : ops.disputeStatus;
  }
  if (update.nextFollowUpAt !== undefined) ops.nextFollowUpAt = update.nextFollowUpAt;
  if (update.appointmentAt !== undefined) ops.appointmentAt = update.appointmentAt;
  if (update.contacted) ops.lastContactedAt = now;
  if (update.note?.trim()) {
    ops.notes.unshift({
      id: id++,
      leadId,
      actorId,
      actorRole,
      body: update.note.trim(),
      visibility: update.visibility || "agent",
      createdAt: now,
    });
  }
  for (const [eventType, eventLabel] of events) {
    ops.activity.unshift({ id: id++, eventType, eventLabel, actorRole, createdAt: now });
  }

  await storeRecord({
    id: opsRecordId(leadId),
    name: opsRecordId(leadId),
    content: JSON.stringify(ops),
    tags: ["lead-ops"],
  });

  return substrateGetLeadOperations(leadId, actorRole === "admin");
}
