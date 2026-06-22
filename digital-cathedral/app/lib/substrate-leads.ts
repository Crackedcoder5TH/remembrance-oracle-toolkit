/**
 * Leads on the substrate (opt-in).
 *
 * Routes lead reads/writes to the field's `legacy` record store via the bridge
 * (storeRecord / getRecord / listRecords / deleteRecord) instead of the
 * relational adapter — one lead = one record (id `lead:<leadId>`, content =
 * JSON, facet tags for scoped queries). database.ts delegates here when
 * SUBSTRATE_LEADS is enabled; otherwise the relational adapter is used.
 *
 * This is a deliberate, reversible opt-in: the relational adapter stays the
 * DEFAULT, so production is unchanged unless the operator sets the flag (and
 * deploys a field-server with the tag-scoped `list`). The store gives exact key
 * lookup (get), text-search + tag-scoped paginated lists (list), and resonance
 * (recall). Date-range filters aren't a store facet, so they narrow the returned
 * page in memory; stats aggregate the most recent window. For exact/indexed
 * analytics at scale the relational adapter remains the right tool — this path
 * trades that for substrate-native records.
 *
 * No runtime dependency on database.ts (types are `import type`, erased at
 * compile time), so importing this from database.ts forms no cycle.
 */

import { getRecord, storeRecord, listRecords, deleteRecord } from "./valor/remembrance-bridge";
import type { LeadRecord, LeadFilters, LeadStats, Result } from "./database";

/** Enabled only when the field is configured AND the operator opts in. */
export const SUBSTRATE_LEADS =
  (process.env.REMEMBRANCE_FIELD_URL || "").trim() !== "" &&
  (process.env.SUBSTRATE_LEADS || "").trim() === "1";

const LEAD_TAG = "lead";
const LEAD_STATS_WINDOW = 1000;

const ok = <T>(value: T): Result<T, string> => ({ ok: true, value });
const err = (error: string): Result<never, string> => ({ ok: false, error });

const leadRecordId = (leadId: string): string => "lead:" + leadId;
const parseLead = (content: string): LeadRecord | null => {
  try { return JSON.parse(content) as LeadRecord; } catch { return null; }
};
const isLead = (l: LeadRecord | null): l is LeadRecord => l !== null;

function leadFacetTags(lead: LeadRecord): string[] {
  const agent = (lead.consentUserAgent || "").startsWith("AI-Agent/");
  return [
    LEAD_TAG,
    "st:" + (lead.state || ""),
    "cov:" + (lead.coverageInterest || ""),
    "vet:" + (lead.veteranStatus || ""),
    agent ? "agent" : "human",
    ...(lead.latticeSrc ? ["lattice"] : []),
  ];
}

function leadFilterTags(f: LeadFilters): string[] {
  const tags = [LEAD_TAG];
  if (f.state) tags.push("st:" + f.state);
  if (f.coverageInterest) tags.push("cov:" + f.coverageInterest);
  if (f.veteranStatus) tags.push("vet:" + f.veteranStatus);
  if (f.source) tags.push(f.source); // "human" | "agent" | "lattice"
  return tags;
}

export async function substrateInsertLead(lead: LeadRecord): Promise<Result<{ id: number; leadId: string }, string>> {
  // Dedupe on contact (a resubmit gets a fresh leadId, so id-upsert won't catch it).
  const dup = await listRecords({ q: lead.email, tags: [LEAD_TAG], limit: 50 });
  if (dup.records.some((r) => { const l = parseLead(r.content); return !!l && l.email === lead.email && l.phone === lead.phone; })) {
    return err("Duplicate lead detected. Same contact already submitted.");
  }
  const r = await storeRecord({
    id: leadRecordId(lead.leadId),
    name: leadRecordId(lead.leadId),
    content: JSON.stringify(lead),
    tags: leadFacetTags(lead),
  });
  if (!r || !r.ok) return err("substrate store failed (field unreachable?)");
  return ok({ id: 0, leadId: lead.leadId });
}

export async function substrateGetLeadById(leadId: string): Promise<Result<LeadRecord | null, string>> {
  const rec = await getRecord(leadRecordId(leadId));
  return ok(rec ? parseLead(rec.content) : null);
}

export async function substrateGetLeadsByEmail(email: string): Promise<Result<LeadRecord[], string>> {
  const { records } = await listRecords({ q: email, tags: [LEAD_TAG], limit: 100 });
  return ok(
    records.map((r) => parseLead(r.content)).filter(isLead)
      .filter((l) => l.email.toLowerCase() === email.toLowerCase()),
  );
}

export async function substrateGetRecentLeads(limit: number): Promise<Result<LeadRecord[], string>> {
  const { records } = await listRecords({ tags: [LEAD_TAG], limit });
  return ok(records.map((r) => parseLead(r.content)).filter(isLead));
}

export async function substrateGetLeadCount(): Promise<Result<number, string>> {
  const { total } = await listRecords({ tags: [LEAD_TAG], limit: 1 });
  return ok(total);
}

export async function substrateGetFilteredLeads(filters: LeadFilters): Promise<Result<{ leads: LeadRecord[]; total: number }, string>> {
  const limit = Math.min(filters.limit ?? 50, 200);
  const offset = filters.offset ?? 0;
  const { records, total } = await listRecords({ q: filters.search, tags: leadFilterTags(filters), limit, offset });
  let leads = records.map((r) => parseLead(r.content)).filter(isLead);
  if (filters.startDate) leads = leads.filter((l) => (l.createdAt || "") >= filters.startDate!);
  if (filters.endDate) leads = leads.filter((l) => (l.createdAt || "") <= filters.endDate!);
  return ok({ leads, total });
}

export async function substrateGetLeadStats(): Promise<Result<LeadStats, string>> {
  const { records, total } = await listRecords({ tags: [LEAD_TAG], limit: LEAD_STATS_WINDOW });
  const leads = records.map((r) => parseLead(r.content)).filter(isLead);
  const now = Date.now();
  const DAY = 86_400_000;
  const within = (iso: string | undefined, ms: number) => !!iso && now - new Date(iso).getTime() <= ms;
  const byState: Record<string, number> = {};
  const byCoverage: Record<string, number> = {};
  const byVeteranStatus: Record<string, number> = {};
  let human = 0, agent = 0, lattice = 0;
  for (const l of leads) {
    byState[l.state] = (byState[l.state] ?? 0) + 1;
    byCoverage[l.coverageInterest] = (byCoverage[l.coverageInterest] ?? 0) + 1;
    byVeteranStatus[l.veteranStatus] = (byVeteranStatus[l.veteranStatus] ?? 0) + 1;
    if ((l.consentUserAgent || "").startsWith("AI-Agent/")) agent++; else human++;
    if (l.latticeSrc) lattice++;
  }
  return ok({
    total,
    today: leads.filter((l) => within(l.createdAt, DAY)).length,
    thisWeek: leads.filter((l) => within(l.createdAt, 7 * DAY)).length,
    thisMonth: leads.filter((l) => within(l.createdAt, 30 * DAY)).length,
    byState, byCoverage, byVeteranStatus,
    bySource: { human, agent, lattice },
  });
}

export async function substrateDeleteLeadById(leadId: string): Promise<Result<{ deleted: number }, string>> {
  return ok({ deleted: await deleteRecord(leadRecordId(leadId)) });
}

export async function substrateDeleteLeadByEmail(email: string): Promise<Result<{ deleted: number }, string>> {
  const found = await substrateGetLeadsByEmail(email);
  if (!found.ok) return err("substrate lookup failed");
  let deleted = 0;
  for (const l of found.value) deleted += await deleteRecord(leadRecordId(l.leadId));
  return ok({ deleted });
}
