/**
 * Leads on the substrate (opt-in).
 *
 * Routes lead reads/writes to the field's `legacy` record store instead of
 * the relational adapter — one lead = one record (id `lead:<leadId>`,
 * content = JSON, facet tags for scoped queries). database.ts delegates here
 * when SUBSTRATE_LEADS is enabled; otherwise the relational adapter is used.
 *
 * Every function mirrors the PostgreSQL adapter's semantics (the production
 * store), through the bridge's strict record store: an outage is an
 * error, never an empty answer, and tag filters are re-checked exactly.
 *   - insert refuses the same email + phone within 24 hours (not forever);
 *   - search matches first name, last name or email (ILIKE), never the rest
 *     of the record; date filters and totals are exact;
 *   - stats cover EVERY lead, with calendar-day windows (UTC).
 * Lists that filter by text or date read every matching record; unfiltered
 * pages come straight from the field, whose created_at order is the lead's
 * intake order (a re-store never moves a record — the field keeps created_at).
 *
 * No runtime dependency on database.ts (types are `import type`, erased at
 * compile time), so importing this from database.ts forms no cycle.
 */

import {
  deleteStrict, getRecordStrict, listAllStrict, listPageStrict, newestFirst, parseJson, storeStrict, utcDate,
  type SubstrateRecord,
} from "./valor/remembrance-bridge";
import type { LeadRecord, LeadFilters, LeadStats, Result } from "./database";

/** Enabled only when the field is configured AND the operator opts in. */
export const SUBSTRATE_LEADS =
  (process.env.REMEMBRANCE_FIELD_URL || "").trim() !== "" &&
  (process.env.SUBSTRATE_LEADS || "").trim() === "1";

const LEAD_TAG = "lead";
const DAY_MS = 24 * 60 * 60 * 1000;
const DUPLICATE_WINDOW_MS = DAY_MS;
const PAGE = 200;

const ok = <T>(value: T): Result<T, string> => ({ ok: true, value });
const err = (error: string): Result<never, string> => ({ ok: false, error });

const leadRecordId = (leadId: string): string => "lead:" + leadId;
const isLead = (l: LeadRecord | null): l is LeadRecord => l !== null;
const toLeads = (records: SubstrateRecord[]): LeadRecord[] =>
  records.map((r) => parseJson<LeadRecord>(r.content)).filter(isLead);
const byCreated = (l: LeadRecord) => l.createdAt;

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
  if (!lead?.leadId || !lead.email) return err("leadId and email are required");
  // SQL: "same email + phone within 24 hours". A resubmit gets a fresh leadId,
  // so the id-upsert cannot catch it; the email text prefilter narrows the
  // read and the exact contact + time check decides.
  const found = await listAllStrict([LEAD_TAG], lead.email);
  if (!found.ok) return err(found.error);
  const cutoff = Date.now() - DUPLICATE_WINDOW_MS;
  const dup = toLeads(found.value).find((l) =>
    l.email === lead.email && l.phone === lead.phone && Date.parse(l.createdAt) > cutoff);
  if (dup) return err(`Duplicate lead detected (${dup.leadId}). Same contact submitted within 24 hours.`);
  const r = await storeStrict({
    id: leadRecordId(lead.leadId),
    name: leadRecordId(lead.leadId),
    content: JSON.stringify(lead),
    tags: leadFacetTags(lead),
  });
  if (!r.ok) return err(r.error);
  return ok({ id: 0, leadId: lead.leadId });
}

export async function substrateGetLeadById(leadId: string): Promise<Result<LeadRecord | null, string>> {
  const rec = await getRecordStrict(leadRecordId(leadId));
  if (!rec.ok) return err(rec.error);
  return ok(rec.value ? parseJson<LeadRecord>(rec.value.content) : null);
}

/** SQL: WHERE email = $1 (exact) ORDER BY created_at DESC. */
export async function substrateGetLeadsByEmail(email: string): Promise<Result<LeadRecord[], string>> {
  if (typeof email !== "string" || !email) return ok([]);
  const found = await listAllStrict([LEAD_TAG], email);
  if (!found.ok) return err(found.error);
  return ok(newestFirst(toLeads(found.value).filter((l) => l.email === email), byCreated));
}

/** SQL: ORDER BY created_at DESC LIMIT n — the field's intake order, paged past its 200 cap. */
export async function substrateGetRecentLeads(limit: number): Promise<Result<LeadRecord[], string>> {
  const want = Math.max(0, Math.floor(Number(limit) || 0));
  const out: LeadRecord[] = [];
  for (let offset = 0; out.length < want; offset += PAGE) {
    const page = await listPageStrict([LEAD_TAG], PAGE, offset);
    if (!page.ok) return err(page.error);
    out.push(...toLeads(page.value.records));
    if (page.value.records.length === 0 || offset + PAGE >= page.value.total) break;
  }
  return ok(newestFirst(out, byCreated).slice(0, want));
}

export async function substrateGetLeadCount(): Promise<Result<number, string>> {
  const page = await listPageStrict([LEAD_TAG], 1, 0);
  return page.ok ? ok(page.value.total) : err(page.error);
}

export async function substrateGetFilteredLeads(filters: LeadFilters): Promise<Result<{ leads: LeadRecord[]; total: number }, string>> {
  const tags = leadFilterTags(filters || {});
  const limit = filters?.limit || 50;
  const offset = filters?.offset || 0;
  const term = (filters?.search || "").toLowerCase();

  // Facet-only views page on the field; text and date filters are not facets,
  // so those read every facet match and filter exactly, like the SQL WHERE.
  if (!term && !filters?.startDate && !filters?.endDate && limit <= PAGE) {
    const page = await listPageStrict(tags, limit, offset);
    if (!page.ok) return err(page.error);
    return ok({ leads: newestFirst(toLeads(page.value.records), byCreated), total: page.value.total });
  }

  const found = await listAllStrict(tags);
  if (!found.ok) return err(found.error);
  const matched = newestFirst(toLeads(found.value).filter((l) =>
    (!term || [l.firstName, l.lastName, l.email].some((f) => String(f || "").toLowerCase().includes(term)))
    && (!filters.startDate || (l.createdAt || "") >= filters.startDate)
    && (!filters.endDate || (l.createdAt || "") <= filters.endDate)), byCreated);
  return ok({ leads: matched.slice(offset, offset + limit), total: matched.length });
}

/** SQL: every lead; today / week / month are calendar dates (created_at::date vs CURRENT_DATE). */
export async function substrateGetLeadStats(): Promise<Result<LeadStats, string>> {
  const found = await listAllStrict([LEAD_TAG]);
  if (!found.ok) return err(found.error);
  const leads = toLeads(found.value);
  const today = utcDate(), weekStart = utcDate(7 * DAY_MS), monthStart = utcDate(30 * DAY_MS);
  const day = (l: LeadRecord) => String(l.createdAt || "").slice(0, 10);
  const byState: Record<string, number> = {};
  const byCoverage: Record<string, number> = {};
  const byVeteranStatus: Record<string, number> = {};
  let agent = 0, lattice = 0;
  for (const l of leads) {
    byState[l.state] = (byState[l.state] ?? 0) + 1;
    byCoverage[l.coverageInterest] = (byCoverage[l.coverageInterest] ?? 0) + 1;
    byVeteranStatus[l.veteranStatus] = (byVeteranStatus[l.veteranStatus] ?? 0) + 1;
    if ((l.consentUserAgent || "").startsWith("AI-Agent/")) agent++;
    if (l.latticeSrc) lattice++;
  }
  return ok({
    total: leads.length,
    today: leads.filter((l) => day(l) === today).length,
    thisWeek: leads.filter((l) => day(l) >= weekStart).length,
    thisMonth: leads.filter((l) => day(l) >= monthStart).length,
    byState, byCoverage, byVeteranStatus,
    // agent and human are exclusive; lattice overlaps either (the SQL rule)
    bySource: { human: leads.length - agent, agent, lattice },
  });
}

export async function substrateDeleteLeadById(leadId: string): Promise<Result<{ deleted: number }, string>> {
  const r = await deleteStrict(leadRecordId(leadId));
  return r.ok ? ok({ deleted: r.value }) : err(r.error);
}

/** SQL: DELETE WHERE email = lower(trim(input)). A privacy deletion must fail loudly, never report 0. */
export async function substrateDeleteLeadByEmail(email: string): Promise<Result<{ deleted: number }, string>> {
  const target = String(email || "").trim().toLowerCase();
  if (!target) return ok({ deleted: 0 });
  const found = await listAllStrict([LEAD_TAG], target);
  if (!found.ok) return err(found.error);
  let deleted = 0;
  for (const l of toLeads(found.value).filter((x) => x.email === target)) {
    const r = await deleteStrict(leadRecordId(l.leadId));
    if (!r.ok) return err(`deleted ${deleted} before the field failed: ${r.error}`);
    deleted += r.value;
  }
  return ok({ deleted });
}
