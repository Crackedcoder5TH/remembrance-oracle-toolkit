/**
 * Void Pattern Library — server-side helpers.
 *
 * The cathedral's "pattern library" is the curated archetype set in
 * lead-substrates.ts (the same `group/name` shape the void substrate uses at
 * 80k-pattern scale, scaled down to veteran-life-insurance leads). Every
 * admitted lead is stamped at intake with its dominant archetype + coherency
 * and recorded in the lead ledger.
 *
 * These helpers read that ledger back so the admin can browse the library and
 * pull the leads that resonate with each archetype — deliberately WITHOUT
 * touching the DB-paginated /api/admin/leads path, because the archetype stamp
 * lives in the ledger, not the leads table. The ledger already carries the
 * sellable contact fields (name/email/phone/state/coverage), so it is a
 * sufficient source for the pattern views on its own.
 */

import { LEAD_ARCHETYPES, archetypeGroup } from "./lead-substrates";
import {
  listLedgerMonths,
  readLedgerMonth,
  type LedgerEntry,
} from "./lead-ledger";

export interface ArchetypeDescriptor {
  /** Fully-qualified name, e.g. "valor/protective-veteran". */
  name: string;
  group: "valor" | "fraud" | "bot" | "unknown";
  /** The 16-dimension archetype signature (shape, not magnitudes). */
  vector: readonly number[];
}

/** The static archetype library, in declaration order. */
export function listArchetypes(): ArchetypeDescriptor[] {
  const out: ArchetypeDescriptor[] = [];
  for (const [name, vector] of LEAD_ARCHETYPES) {
    out.push({ name, group: archetypeGroup(name), vector });
  }
  return out;
}

/** A lead as recorded in the ledger, normalized for the admin pattern views. */
export interface LedgerLeadRow {
  leadId: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  state: string;
  coverageInterest: string;
  veteranStatus: string;
  militaryBranch: string;
  archetype: string;
  group: string;
  coherency: number;
  tier: string;
  verdict: string;
  observedAt: string;
}

function toRow(e: LedgerEntry): LedgerLeadRow {
  return {
    leadId: e.leadId,
    firstName: e.lead.firstName,
    lastName: e.lead.lastName,
    email: e.lead.email,
    phone: e.lead.phone,
    state: e.lead.state,
    coverageInterest: e.lead.coverageInterest,
    veteranStatus: e.lead.veteranStatus,
    militaryBranch: e.lead.militaryBranch,
    archetype: e.coherency.dominantArchetype,
    group: e.coherency.dominantGroup,
    coherency: e.coherency.score,
    tier: e.coherency.tier,
    verdict: e.covenant.verdict,
    observedAt: e.observedAt,
  };
}

export interface LoadLedgerOptions {
  /** How many of the most recent months to scan (default 6). */
  maxMonths?: number;
  /** Hard cap on rows returned (default 5000). */
  maxEntries?: number;
}

/**
 * Aggregate ledger entries across recent months, newest-first, deduped by
 * leadId (keeping the most recent stamp for each lead — so a re-scored lead
 * reflects its latest archetype). Bounded by maxMonths and maxEntries so a
 * large ledger can't blow up a serverless invocation.
 */
export async function loadLedgerLeads(opts: LoadLedgerOptions = {}): Promise<LedgerLeadRow[]> {
  const maxMonths = opts.maxMonths ?? 6;
  const maxEntries = opts.maxEntries ?? 5000;

  const months = await listLedgerMonths();
  // Sort descending by YYYY-MM and take the most recent window.
  const recent = [...months]
    .sort((a, b) => b.month.localeCompare(a.month))
    .slice(0, maxMonths);

  const seen = new Set<string>();
  const rows: LedgerLeadRow[] = [];

  for (const m of recent) {
    if (rows.length >= maxEntries) break;
    const text = await readLedgerMonth(m.month);
    if (!text) continue;
    // JSONL is append-order (oldest first); walk it backwards so the newest
    // stamp wins on dedupe.
    const lines = text.split("\n");
    for (let i = lines.length - 1; i >= 0; i--) {
      if (rows.length >= maxEntries) break;
      const line = lines[i].trim();
      if (!line) continue;
      let entry: LedgerEntry;
      try {
        entry = JSON.parse(line) as LedgerEntry;
      } catch {
        continue; // skip a malformed line rather than failing the whole read
      }
      if (!entry?.leadId || seen.has(entry.leadId)) continue;
      seen.add(entry.leadId);
      rows.push(toRow(entry));
    }
  }
  return rows;
}

/**
 * Count ledger leads per archetype. Seeds every library archetype at 0 so the
 * UI can show empty archetypes too; tolerates archetypes that no longer exist
 * in the library (older stamps) by counting them under their recorded name.
 */
export function tallyByArchetype(rows: readonly LedgerLeadRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const name of LEAD_ARCHETYPES.keys()) counts[name] = 0;
  for (const r of rows) {
    counts[r.archetype] = (counts[r.archetype] ?? 0) + 1;
  }
  return counts;
}
