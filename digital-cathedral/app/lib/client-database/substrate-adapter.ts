/**
 * Client Database — substrate adapter (the field's legacy record store).
 *
 * Closes Phase 2: buyer accounts, their delivery filters and lead purchases
 * move off SQL onto the same store as leads and compliance. Semantics mirror
 * the SQLite adapter method for method; the differences are where the
 * substrate is stricter:
 *
 *   - UNIQUE email and the purchase cap are enforced by the field server's
 *     `store_guarded` action — the capacity check and the insert share one
 *     BEGIN IMMEDIATE on the field's SQLite, so two concurrent checkouts
 *     cannot both pass the cap (the SQL path's transaction, server-side).
 *   - Every call goes through `legacyStrict`, which reports "field
 *     unreachable" as an error instead of an empty result — a money store
 *     must never read an outage as "no purchases yet".
 *   - Tags are re-checked exactly after the field's LIKE-based tag filter,
 *     because ids carry '_' (a LIKE wildcard).
 *
 * Record shapes (content is the typed record as JSON):
 *   client:<clientId>          tags valor-client, client-status:<s>, client-email:<sha256(lower email)>
 *   client-filters:<clientId>  tags valor-client-filters, client:<clientId>
 *   purchase:<purchaseId>      tags purchase-lead:<leadId> (first — the guard's selective key),
 *                              valor-purchase, purchase-client:<clientId>,
 *                              purchase-status:<s>, purchase-exclusive | purchase-shared
 *
 * Nothing here computes a coherency — the field scores each record with the
 * one instrument as it enters.
 */

import { createHash } from "crypto";
import { legacyStrict, type SubstrateRecord } from "../valor/remembrance-bridge";
import type {
  ClientRecord,
  ClientFilters,
  LeadPurchase,
  ClientListFilters,
  ClientStats,
  ClientDbAdapter,
  GuardedPurchaseOutcome,
  Result,
} from "./types";
import { Ok, Err } from "./types";

const CLIENT_TAG = "valor-client";
const FILTERS_TAG = "valor-client-filters";
const PURCHASE_TAG = "valor-purchase";
const EXCLUSIVE_TAG = "purchase-exclusive";
const PAGE = 200;                       // the field's list cap per call

const clientRecordId = (clientId: string) => `client:${clientId}`;
const filtersRecordId = (clientId: string) => `client-filters:${clientId}`;
const purchaseRecordId = (purchaseId: string) => `purchase:${purchaseId}`;
const emailKey = (email: string) =>
  `client-email:${createHash("sha256").update(email.trim().toLowerCase()).digest("hex")}`;

const clientTags = (c: ClientRecord) => [CLIENT_TAG, `client-status:${c.status}`, emailKey(c.email)];
const purchaseLeadTag = (leadId: string) => `purchase-lead:${leadId}`;
const purchaseTags = (p: LeadPurchase) => [
  purchaseLeadTag(p.leadId),
  PURCHASE_TAG,
  `purchase-client:${p.clientId}`,
  `purchase-status:${p.status}`,
  p.exclusive ? EXCLUSIVE_TAG : "purchase-shared",
];

const parse = <T>(content: string | undefined | null): T | null => {
  if (!content) return null;
  try { return JSON.parse(content) as T; } catch { return null; }
};

/** SQLite's date('now') and date('now','-30 days'): UTC calendar dates compared as strings. */
const utcDate = (msAgo = 0) => new Date(Date.now() - msAgo).toISOString().slice(0, 10);
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

type GetAnswer = { ok: boolean; error?: string; legacy: SubstrateRecord | null };
type ListAnswer = { ok: boolean; error?: string; legacies: SubstrateRecord[]; total: number };
type StoreAnswer = { ok: boolean; error?: string; id?: string };
type GuardedAnswer = {
  ok: boolean;
  error?: string;
  outcome?: "inserted" | "duplicate" | "sold_out";
  legacy?: SubstrateRecord;
};

async function getJson<T>(id: string): Promise<Result<T | null, string>> {
  const r = await legacyStrict<GetAnswer>({ action: "get", id });
  if (!r.ok) return Err(r.error);
  return Ok(r.value.legacy ? parse<T>(r.value.legacy.content) : null);
}

/** Every record carrying ALL of `tags` (exactly), paged through the field's list cap. */
async function listAll<T>(tags: string[]): Promise<Result<T[], string>> {
  const out: T[] = [];
  const seen = new Set<string>();
  for (let offset = 0; ; offset += PAGE) {
    const r = await legacyStrict<ListAnswer>({ action: "list", tags, limit: PAGE, offset });
    if (!r.ok) return Err(r.error);
    const page = Array.isArray(r.value.legacies) ? r.value.legacies : [];
    for (const rec of page) {
      if (seen.has(rec.id)) continue;
      const recTags = Array.isArray(rec.tags) ? rec.tags : [];
      if (!tags.every((t) => recTags.includes(t))) continue;
      const row = parse<T>(rec.content);
      if (row !== null) { seen.add(rec.id); out.push(row); }
    }
    if (page.length < PAGE || offset + PAGE >= r.value.total) return Ok(out);
  }
}

async function store(id: string, content: unknown, tags: string[]): Promise<Result<true, string>> {
  if (!id || content === undefined || !Array.isArray(tags)) return Err("store requires an id, content and tags");
  const r = await legacyStrict<StoreAnswer>({ action: "store", id, name: id, content: JSON.stringify(content), tags });
  return r.ok ? Ok(true) : Err(r.error);
}

async function storeGuarded(
  id: string, content: unknown, tags: string[],
  guard: { tags: string[]; max: number; blockTag?: string },
): Promise<Result<GuardedAnswer, string>> {
  const r = await legacyStrict<GuardedAnswer>({
    action: "store_guarded", id, name: id, content: JSON.stringify(content), tags, guard,
  });
  return r.ok ? Ok(r.value) : Err(r.error);
}

/** Newest first; sorts a copy so a caller's array is never reordered. */
function newestFirst<T>(rows: readonly T[], at: (row: T) => string): T[] {
  if (!Array.isArray(rows) || typeof at !== "function") return [];
  return [...rows].sort((a, b) => String(at(b) ?? "").localeCompare(String(at(a) ?? "")));
}
const purchasedAt = (p: LeadPurchase) => p.purchasedAt;
const createdAt = (c: ClientRecord) => c.createdAt;

export class SubstrateClientAdapter implements ClientDbAdapter {
  /** The field server owns the table; there is nothing to create or seed. */
  async initialize(): Promise<void> {}

  async insertClient(client: ClientRecord): Promise<Result<{ clientId: string }, string>> {
    if (!client?.clientId || !client.email) return Err("clientId and email are required");
    const r = await storeGuarded(clientRecordId(client.clientId), client, clientTags(client), {
      tags: [emailKey(client.email), CLIENT_TAG],
      max: 1,
    });
    if (!r.ok) return r;
    if (r.value.outcome === "duplicate") return Err("UNIQUE constraint failed: clients.client_id");
    if (r.value.outcome === "sold_out") return Err("UNIQUE constraint failed: clients.email");
    return Ok({ clientId: client.clientId });
  }

  async getClientById(clientId: string): Promise<Result<ClientRecord | null, string>> {
    return getJson<ClientRecord>(clientRecordId(clientId));
  }

  async getClientByEmail(email: string): Promise<Result<ClientRecord | null, string>> {
    if (typeof email !== "string" || !email.trim()) return Ok(null);
    const r = await listAll<ClientRecord>([emailKey(email), CLIENT_TAG]);
    if (!r.ok) return r;
    const want = email.trim().toLowerCase();
    return Ok(r.value.find((c) => c.email.trim().toLowerCase() === want) ?? null);
  }

  async updateClient(clientId: string, updates: Partial<ClientRecord>): Promise<Result<{ updated: boolean }, string>> {
    // The SQL path's column map: clientId and createdAt are never rewritten.
    const updatable: Array<keyof ClientRecord> = [
      "companyName", "contactName", "email", "phone", "status", "pricingTier", "pricePerLead",
      "exclusivePrice", "stateLicenses", "coverageTypes", "dailyCap", "monthlyCap", "minScore",
      "balance", "passwordHash",
    ];
    const keys = updatable.filter((k) => k in updates);
    if (keys.length === 0) return Ok({ updated: false });
    const current = await getJson<ClientRecord>(clientRecordId(clientId));
    if (!current.ok) return current;
    if (!current.value) return Ok({ updated: false });
    const next: ClientRecord = { ...current.value };
    for (const k of keys) (next as unknown as Record<string, unknown>)[k] = updates[k];
    next.updatedAt = new Date().toISOString();
    if (next.email.trim().toLowerCase() !== current.value.email.trim().toLowerCase()) {
      const taken = await this.getClientByEmail(next.email);
      if (!taken.ok) return taken;
      if (taken.value && taken.value.clientId !== clientId) return Err("UNIQUE constraint failed: clients.email");
    }
    const r = await store(clientRecordId(clientId), next, clientTags(next));
    return r.ok ? Ok({ updated: true }) : r;
  }

  async getFilteredClients(filters: ClientListFilters): Promise<Result<{ clients: ClientRecord[]; total: number }, string>> {
    const tags = filters.status ? [CLIENT_TAG, `client-status:${filters.status}`] : [CLIENT_TAG];
    const r = await listAll<ClientRecord>(tags);
    if (!r.ok) return r;
    const term = (filters.search || "").toLowerCase();
    const matched = newestFirst(
      term
        ? r.value.filter((c) =>
            [c.companyName, c.contactName, c.email].some((f) => String(f || "").toLowerCase().includes(term)))
        : r.value,
      createdAt,
    );
    const limit = filters.limit || 50;
    const offset = filters.offset || 0;
    return Ok({ clients: matched.slice(offset, offset + limit), total: matched.length });
  }

  async getClientFilters(clientId: string): Promise<Result<ClientFilters | null, string>> {
    return getJson<ClientFilters>(filtersRecordId(clientId));
  }

  async upsertClientFilters(filters: ClientFilters): Promise<Result<{ saved: boolean }, string>> {
    // SQL enforces REFERENCES clients(client_id); so does this.
    const owner = await this.getClientById(filters.clientId);
    if (!owner.ok) return owner;
    if (!owner.value) return Err("FOREIGN KEY constraint failed: client_filters.client_id");
    const row: ClientFilters = { ...filters, veteranOnly: Boolean(filters.veteranOnly) };
    const r = await store(filtersRecordId(filters.clientId), row, [FILTERS_TAG, `client:${filters.clientId}`]);
    return r.ok ? Ok({ saved: true }) : r;
  }

  async insertPurchase(purchase: LeadPurchase): Promise<Result<{ purchaseId: string }, string>> {
    // No capacity rule (max is unbounded) — the guarded path is used only for
    // its atomic duplicate-id check, the SQL UNIQUE(purchase_id).
    const r = await storeGuarded(purchaseRecordId(purchase.purchaseId), purchase, purchaseTags(purchase), {
      tags: [purchaseLeadTag(purchase.leadId), PURCHASE_TAG],
      max: Number.MAX_SAFE_INTEGER,
    });
    if (!r.ok) return r;
    if (r.value.outcome === "duplicate") return Err("UNIQUE constraint failed: lead_purchases.purchase_id");
    return Ok({ purchaseId: purchase.purchaseId });
  }

  async insertPurchaseGuarded(purchase: LeadPurchase, maxBuyers: number): Promise<Result<GuardedPurchaseOutcome, string>> {
    // The SQL rule: an exclusive buy needs zero delivered buyers; a shared buy
    // is refused when an exclusive buyer holds the lead or the cap is reached.
    const guard = purchase.exclusive
      ? { tags: [purchaseLeadTag(purchase.leadId), PURCHASE_TAG, "purchase-status:delivered"], max: 1 }
      : { tags: [purchaseLeadTag(purchase.leadId), PURCHASE_TAG, "purchase-status:delivered"], max: maxBuyers, blockTag: EXCLUSIVE_TAG };
    const r = await storeGuarded(purchaseRecordId(purchase.purchaseId), purchase, purchaseTags(purchase), guard);
    if (!r.ok) return r;
    if (r.value.outcome === "sold_out") return Ok({ outcome: "sold_out" });
    if (r.value.outcome === "duplicate") {
      const existing = parse<LeadPurchase>(r.value.legacy?.content);
      return existing ? Ok({ outcome: "duplicate", purchase: existing }) : Err("duplicate purchase record is unreadable");
    }
    return Ok({ outcome: "inserted", purchase });
  }

  async getPurchasesByClient(clientId: string, limit = 50, offset = 0): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>> {
    const r = await listAll<LeadPurchase>([PURCHASE_TAG, `purchase-client:${clientId}`]);
    if (!r.ok) return r;
    const sorted = newestFirst(r.value, purchasedAt);
    return Ok({ purchases: sorted.slice(offset, offset + limit), total: sorted.length });
  }

  async getPurchasesByLead(leadId: string): Promise<Result<LeadPurchase[], string>> {
    const r = await listAll<LeadPurchase>([purchaseLeadTag(leadId), PURCHASE_TAG]);
    return r.ok ? Ok(newestFirst(r.value, purchasedAt)) : r;
  }

  async updatePurchaseStatus(purchaseId: string, status: LeadPurchase["status"], returnReason?: string): Promise<Result<{ updated: boolean }, string>> {
    const current = await getJson<LeadPurchase>(purchaseRecordId(purchaseId));
    if (!current.ok) return current;
    if (!current.value) return Ok({ updated: false });
    const next: LeadPurchase = { ...current.value, status };
    if (returnReason) next.returnReason = returnReason;
    const r = await store(purchaseRecordId(purchaseId), next, purchaseTags(next));
    return r.ok ? Ok({ updated: true }) : r;
  }

  async getAllPurchases(limit = 50, offset = 0, status?: string): Promise<Result<{ purchases: LeadPurchase[]; total: number }, string>> {
    const tags = status ? [PURCHASE_TAG, `purchase-status:${status}`] : [PURCHASE_TAG];
    const r = await listAll<LeadPurchase>(tags);
    if (!r.ok) return r;
    const sorted = newestFirst(r.value, purchasedAt);
    return Ok({ purchases: sorted.slice(offset, offset + limit), total: sorted.length });
  }

  private async countSince(clientId: string, since: string): Promise<Result<number, string>> {
    const r = await listAll<LeadPurchase>([PURCHASE_TAG, `purchase-client:${clientId}`]);
    if (!r.ok) return r;
    return Ok(r.value.filter((p) => p.purchasedAt >= since && p.status !== "returned").length);
  }

  async getClientDailyPurchaseCount(clientId: string): Promise<Result<number, string>> {
    return this.countSince(clientId, utcDate());
  }

  async getClientMonthlyPurchaseCount(clientId: string): Promise<Result<number, string>> {
    return this.countSince(clientId, utcDate(THIRTY_DAYS_MS));
  }

  async getClientStats(): Promise<Result<ClientStats, string>> {
    const [clients, purchases] = await Promise.all([
      listAll<ClientRecord>([CLIENT_TAG]),
      listAll<LeadPurchase>([PURCHASE_TAG]),
    ]);
    if (!clients.ok) return clients;
    if (!purchases.ok) return purchases;
    const monthStart = utcDate(THIRTY_DAYS_MS);
    const kept = purchases.value.filter((p) => p.status !== "returned");
    const sum = (ps: LeadPurchase[]) => ps.reduce((s, p) => s + (Number(p.pricePaid) || 0), 0);
    return Ok({
      totalClients: clients.value.length,
      activeClients: clients.value.filter((c) => c.status === "active").length,
      pendingClients: clients.value.filter((c) => c.status === "pending").length,
      totalPurchases: purchases.value.length,
      totalRevenue: sum(kept),
      revenueThisMonth: sum(kept.filter((p) => p.purchasedAt >= monthStart)),
      purchasesThisMonth: purchases.value.filter((p) => p.purchasedAt >= monthStart).length,
      disputesOpen: purchases.value.filter((p) => p.status === "disputed").length,
    });
  }

  async getRevenueByClient(): Promise<Result<Array<{ clientId: string; companyName: string; totalRevenue: number; totalPurchases: number }>, string>> {
    const [clients, purchases] = await Promise.all([
      listAll<ClientRecord>([CLIENT_TAG]),
      listAll<LeadPurchase>([PURCHASE_TAG]),
    ]);
    if (!clients.ok) return clients;
    if (!purchases.ok) return purchases;
    const totals = new Map<string, { revenue: number; count: number }>();
    for (const p of purchases.value) {
      if (p.status === "returned") continue;
      const t = totals.get(p.clientId) ?? { revenue: 0, count: 0 };
      t.revenue += Number(p.pricePaid) || 0;
      t.count += 1;
      totals.set(p.clientId, t);
    }
    return Ok(
      clients.value
        .map((c) => ({
          clientId: c.clientId,
          companyName: c.companyName,
          totalRevenue: totals.get(c.clientId)?.revenue ?? 0,
          totalPurchases: totals.get(c.clientId)?.count ?? 0,
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue),
    );
  }
}
