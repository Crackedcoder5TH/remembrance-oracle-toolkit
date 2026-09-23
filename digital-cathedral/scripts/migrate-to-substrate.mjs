#!/usr/bin/env node
/**
 * PHASE 1 — the one-time replay of the SQL store into the substrate
 * (docs/valor-legacies-integration.md). After this, with SUBSTRATE_LEADS=1
 * and SUBSTRATE_MESSAGES=1, the system is the database of record for
 * leads, messages, buyer accounts, their delivery filters and lead
 * purchases; the SQL store stays mounted read-only for one release as the
 * comparison shadow.
 *
 * SOURCE — resolved exactly as app/lib/database.ts resolves it:
 *   DATABASE_URL set → PostgreSQL via `pg`; otherwise SQLite via
 *   better-sqlite3 at .cathedral/leads.db.
 * DESTINATION — the field server's legacy store, over the SAME wire the
 *   site's bridge uses (app/lib/valor/remembrance-bridge.ts): MCP
 *   tools/call → tool "legacy", actions store/get/list, bearer only on
 *   loopback/HTTPS. One surface; nothing writes around the bridge's wire.
 *
 * SHAPES are verbatim mirrors of the live write path, so a migrated row
 * is byte-identical to what the site itself would have stored:
 *   rowToLead / rowToClientMessage  ← app/lib/database.ts
 *   lead record + leadFacetTags     ← app/lib/substrate-leads.ts
 *   message record (name=tag, content=subject\nbody, meta.message)
 *                                   ← app/lib/substrate-messages.ts
 *   rowToClient / rowToFilters / rowToPurchase
 *                                   ← app/lib/client-database/helpers.ts
 *   client / client-filters / purchase records + tags
 *                                   ← app/lib/client-database/substrate-adapter.ts
 *
 * IDEMPOTENT: stable ids (lead:<leadId>, msg:<id>, client:<clientId>,
 * client-filters:<clientId>, purchase:<purchaseId>) make every store an
 * upsert — the replay can run any number of times. Purchases replay as
 * plain upserts, never through the capacity guard: history is a fact, not
 * a checkout to refuse. A client table absent from the source (a store
 * that never initialized the buyer tables) reports source_rows 0.
 *
 * VERIFIED, not assumed: every stored record is read back through the
 * same wire and byte-compared (lead content JSON; message content +
 * meta.message). The summary reports source_rows / stored / identical /
 * mismatches per table and exits nonzero on any mismatch. The records
 * themselves are coherence-scored by the field as they enter — the
 * instrument reads every row it accepts.
 *
 * MODES:
 *   (none)          migrate leads + client_messages, verify, report
 *   --dry-run       count and map source rows; store nothing
 *   --verify-only   re-run the read-back comparison against the source
 *   --test-fixture  prove the pipe end-to-end on the fixture rows in
 *                   scripts/fixture-rows.json, then DELETE the stored
 *                   records — the store is left clean; fixture data never
 *                   remains (and is never presented as a measurement).
 *   --source-json <p>  read raw rows from a JSON file
 *                   ({ leadRows, msgRows, clientRows, filterRows,
 *                   purchaseRows }, snake_case as
 *                   SELECT * returns them) instead of pg/sqlite — for
 *                   air-gapped replays and the fixture proof; needs no
 *                   database driver at all.
 *   --export <p>    also write the mapped records to <p> as JSON, so the
 *                   instrument can take a sealed reading of exactly what
 *                   moved (goggles --do read <p>).
 */
import fs from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const argv = process.argv.slice(2);
const has = (f) => argv.includes(f);
const argAfter = (f) => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };

// ── the bridge's wire, mirrored (remembrance-bridge.ts) ──────────────
const TIMEOUT_MS = 15000; // migration is offline work; the site's 1500ms guard is for renders
function fieldUrl() {
  const raw = (process.env.REMEMBRANCE_FIELD_URL || "http://127.0.0.1:7787/mcp").trim();
  return raw.endsWith("/mcp") ? raw : raw.replace(/\/$/, "") + "/mcp";
}
function isLoopbackOrHttps(url) {
  try {
    const u = new URL(url);
    if (u.protocol === "https:") return true;
    const host = u.hostname.toLowerCase();
    return host === "127.0.0.1" || host === "localhost" || host === "::1";
  } catch { return false; }
}
async function mcpTool(toolName, args = {}) {
  const url = fieldUrl();
  const headers = { "Content-Type": "application/json" };
  const token = (process.env.REMEMBRANCE_FIELD_TOKEN || "").trim();
  if (token && isLoopbackOrHttps(url)) headers.Authorization = `Bearer ${token}`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "POST", headers, signal: ctrl.signal, redirect: "manual",
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: toolName, arguments: args } }),
    });
    if (!res.ok) return null;
    const json = await res.json();
    if (json.error) return null;
    const content = json.result?.content?.[0]?.text;
    return content ? parseJson(content) : null;
  } catch { return null; } finally { clearTimeout(timer); }
}

/** JSON that may not be JSON never throws — a bad payload reads as absent. */
function parseJson(text) { try { return JSON.parse(text); } catch { return null; } }
const storeRecord = (rec) => mcpTool("legacy", { action: "store", ...rec });
const getRecord = async (id) => {
  const r = await mcpTool("legacy", { action: "get", id });
  return r && r.ok && r.legacy ? r.legacy : null;
};
const deleteRecord = (id) => mcpTool("legacy", { action: "delete", id });
const countByTag = async (tag) => {
  const r = await mcpTool("legacy", { action: "list", tags: [tag], limit: 1, offset: 0 });
  return r && r.ok && typeof r.total === "number" ? r.total : null;
};

// ── row mappings, mirrored from app/lib/database.ts ──────────────────
function rowToLead(row) {
  return {
    leadId: row.lead_id, firstName: row.first_name, lastName: row.last_name,
    dateOfBirth: row.date_of_birth || "", email: row.email, phone: row.phone,
    state: row.state, coverageInterest: row.coverage_interest,
    purchaseIntent: row.purchase_intent || "", veteranStatus: row.veteran_status || "",
    militaryBranch: row.military_branch || "",
    consentTcpa: row.consent_tcpa === 1 || row.consent_tcpa === true,
    consentPrivacy: row.consent_privacy === 1 || row.consent_privacy === true,
    consentTimestamp: row.consent_timestamp, consentText: row.consent_text,
    consentIp: row.consent_ip, consentUserAgent: row.consent_user_agent,
    consentPageUrl: row.consent_page_url,
    utmSource: row.utm_source || null, utmMedium: row.utm_medium || null,
    utmCampaign: row.utm_campaign || null, utmTerm: row.utm_term || null,
    utmContent: row.utm_content || null,
    latticeSrc: row.lattice_src || null, latticeFrom: row.lattice_from || null,
    createdAt: row.created_at,
  };
}
function rowToClientMessage(row) {
  return {
    id: Number(row.id), clientId: Number(row.client_id),
    direction: row.direction, subject: row.subject || "", body: row.body,
    read: row.read === 1 || row.read === true, createdAt: row.created_at,
  };
}

// ── record shapes, mirrored from the live substrate write path ───────
const LEAD_TAG = "lead";                       // substrate-leads.ts
const MESSAGE_TAG = "client-message";          // substrate-messages.ts
function leadFacetTags(lead) {
  const agent = (lead.consentUserAgent || "").startsWith("AI-Agent/");
  return [LEAD_TAG, "st:" + (lead.state || ""), "cov:" + (lead.coverageInterest || ""),
          "vet:" + (lead.veteranStatus || ""), agent ? "agent" : "human",
          ...(lead.latticeSrc ? ["lattice"] : [])];
}
const leadRecord = (lead) => ({
  id: "lead:" + lead.leadId, name: "lead:" + lead.leadId,
  content: JSON.stringify(lead), tags: leadFacetTags(lead),
});
const messageText = (m) => m.subject + "\n" + m.body;
const messageRecord = (m) => ({
  id: "msg:" + m.id, name: MESSAGE_TAG, content: messageText(m),
  tags: [MESSAGE_TAG, "client:" + m.clientId, m.direction, m.read ? "read" : "unread"],
  meta: { message: m },
});

// ── buyer tables, mirrored from client-database/helpers.ts ───────────
function rowToClient(row) {
  return {
    clientId: row.client_id, companyName: row.company_name, contactName: row.contact_name,
    email: row.email, phone: row.phone, passwordHash: row.password_hash, status: row.status,
    pricingTier: row.pricing_tier, pricePerLead: Number(row.price_per_lead),
    exclusivePrice: Number(row.exclusive_price), stateLicenses: row.state_licenses,
    coverageTypes: row.coverage_types, dailyCap: Number(row.daily_cap),
    monthlyCap: Number(row.monthly_cap), minScore: Number(row.min_score),
    balance: Number(row.balance), createdAt: row.created_at, updatedAt: row.updated_at,
  };
}
function rowToFilters(row) {
  return {
    clientId: row.client_id, states: row.states, coverageTypes: row.coverage_types,
    veteranOnly: row.veteran_only === 1 || row.veteran_only === true,
    minScore: Number(row.min_score), maxLeadAge: Number(row.max_lead_age),
    distributionMode: row.distribution_mode,
  };
}
function rowToPurchase(row) {
  return {
    purchaseId: row.purchase_id, leadId: row.lead_id, clientId: row.client_id,
    pricePaid: Number(row.price_paid), purchasedAt: row.purchased_at, status: row.status,
    exclusive: row.exclusive === 1 || row.exclusive === true,
    returnReason: row.return_reason || "", returnDeadline: row.return_deadline || "",
  };
}

// ── buyer record shapes, mirrored from client-database/substrate-adapter.ts ──
const CLIENT_TAG = "valor-client";
const FILTERS_TAG = "valor-client-filters";
const PURCHASE_TAG = "valor-purchase";
const emailKey = (email) =>
  "client-email:" + createHash("sha256").update(String(email).trim().toLowerCase()).digest("hex");
const clientRecord = (c) => ({
  id: "client:" + c.clientId, name: "client:" + c.clientId, content: JSON.stringify(c),
  tags: [CLIENT_TAG, "client-status:" + c.status, emailKey(c.email)],
});
const filtersRecord = (f) => ({
  id: "client-filters:" + f.clientId, name: "client-filters:" + f.clientId, content: JSON.stringify(f),
  tags: [FILTERS_TAG, "client:" + f.clientId],
});
const purchaseRecord = (p) => ({
  id: "purchase:" + p.purchaseId, name: "purchase:" + p.purchaseId, content: JSON.stringify(p),
  tags: ["purchase-lead:" + p.leadId, PURCHASE_TAG, "purchase-client:" + p.clientId,
         "purchase-status:" + p.status, p.exclusive ? "purchase-exclusive" : "purchase-shared"],
});

// ── the source store, resolved as database.ts resolves it ────────────
async function openSource(jsonPath) {
  if (jsonPath) {
    const doc = parseJson(fs.readFileSync(jsonPath, "utf8"));
    if (!doc) throw new Error(`--source-json ${jsonPath} is not valid JSON`);
    const tables = {
      leads: doc.leadRows || [], client_messages: doc.msgRows || [],
      clients: doc.clientRows || [], client_filters: doc.filterRows || [],
      lead_purchases: doc.purchaseRows || [],
    };
    return {
      kind: "json:" + path.basename(jsonPath),
      all: async (sql) => tables[/FROM\s+(\w+)/i.exec(sql)[1]] || [],
      close: () => {},
    };
  }
  if (process.env.DATABASE_URL) {
    const { Pool } = require("pg");
    const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
    return {
      kind: "pg",
      all: async (sql) => (await pool.query(sql)).rows,
      close: () => pool.end(),
    };
  }
  const Database = require("better-sqlite3");
  const dbPath = path.join(process.cwd(), ".cathedral", "leads.db");
  if (!fs.existsSync(dbPath)) throw new Error(`no source store at ${dbPath} and DATABASE_URL is not set`);
  const db = new Database(dbPath, { readonly: true });
  return { kind: "sqlite", all: async (sql) => db.prepare(sql).all(), close: () => db.close() };
}

async function replayTable({ label, rows, toRecord, compare }) {
  if (!label || !Array.isArray(rows) || typeof toRecord !== "function" || typeof compare !== "function") {
    throw new TypeError("replayTable requires label, rows[], toRecord(), compare()");
  }
  let stored = 0, identical = 0;
  const mismatches = [];
  for (const row of rows) {
    const rec = toRecord(row);
    const r = await storeRecord(rec);
    if (!r || !r.ok) { mismatches.push({ id: rec.id, why: "store failed (field unreachable?)" }); continue; }
    stored += 1;
    const back = await getRecord(rec.id);
    if (back && compare(rec, back)) identical += 1;
    else mismatches.push({ id: rec.id, why: back ? "read-back differs" : "read-back absent" });
  }
  return { table: label, source_rows: rows.length, stored, identical, mismatches };
}

async function main() {
  const dryRun = has("--dry-run");
  const verifyOnly = has("--verify-only");
  const fixture = has("--test-fixture");
  const exportPath = argAfter("--export");

  const sourceJson = argAfter("--source-json")
    || (fixture ? new URL("./fixture-rows.json", import.meta.url).pathname : null);
  const src = await openSource(sourceJson);
  const leadRows = await src.all("SELECT * FROM leads ORDER BY id");
  const msgRows = await src.all("SELECT * FROM client_messages ORDER BY id");
  const leads = leadRows.map(rowToLead);
  const messages = msgRows.map(rowToClientMessage);

  // The buyer tables exist only where the client store was ever initialized;
  // a missing table is reported, never read as an error in the lead replay.
  const absentTables = [];
  const buyerRows = async (table) => {
    try { return await src.all(`SELECT * FROM ${table} ORDER BY id`); }
    catch (e) { absentTables.push({ table, why: String((e && e.message) || e) }); return []; }
  };
  const clients = (await buyerRows("clients")).map(rowToClient);
  const filters = (await buyerRows("client_filters")).map(rowToFilters);
  const purchases = (await buyerRows("lead_purchases")).map(rowToPurchase);

  if (exportPath) {
    fs.writeFileSync(exportPath, JSON.stringify({ leads, messages, clients, filters, purchases }, null, 1));
    console.error(`exported ${leads.length} lead(s), ${messages.length} message(s), ${clients.length} client(s), ${filters.length} filter set(s), ${purchases.length} purchase(s) → ${exportPath}`);
    console.error("  a sealed reading of exactly what moved: goggles --do read " + exportPath);
  }
  if (dryRun) {
    console.log(JSON.stringify({
      mode: "dry-run", source: src.kind, leads: leads.length, messages: messages.length,
      clients: clients.length, clientFilters: filters.length, purchases: purchases.length, absentTables,
    }, null, 2));
    await src.close();
    return 0;
  }

  function compareLead(rec, back) {
    if (!rec || !back) return false;
    return back.content === rec.content;
  }
  function compareMsg(rec, back) {
    if (!rec || !back || !rec.meta) return false;
    return back.content === rec.content
      && JSON.stringify(back.meta && back.meta.message) === JSON.stringify(rec.meta.message);
  }

  // content is the whole typed record, so a byte-identical content is the row
  function compareContent(rec, back) {
    if (!rec || !back) return false;
    return back.content === rec.content;
  }
  const tables = [
    ["leads", leads, leadRecord, compareLead],
    ["client_messages", messages, messageRecord, compareMsg],
    ["clients", clients, clientRecord, compareContent],
    ["client_filters", filters, filtersRecord, compareContent],
    ["lead_purchases", purchases, purchaseRecord, compareContent],
  ];

  const results = [];
  if (verifyOnly) {
    for (const [label, list, toRecord, compare] of tables) {
      let identical = 0; const mismatches = [];
      for (const item of list) {
        const rec = toRecord(item);
        const back = await getRecord(rec.id);
        if (back && compare(rec, back)) identical += 1;
        else mismatches.push({ id: rec.id, why: back ? "differs" : "absent" });
      }
      results.push({ table: label, source_rows: list.length, identical, mismatches });
    }
  } else {
    for (const [label, rows, toRecord, compare] of tables) {
      results.push(await replayTable({ label, rows, toRecord, compare }));
    }
  }

  const totals = {
    leadTotalInStore: await countByTag(LEAD_TAG),
    messageTotalInStore: await countByTag(MESSAGE_TAG),
    clientTotalInStore: await countByTag(CLIENT_TAG),
    clientFiltersTotalInStore: await countByTag(FILTERS_TAG),
    purchaseTotalInStore: await countByTag(PURCHASE_TAG),
  };

  if (fixture) {
    // the pipe is proven; the fixture records leave the store
    let deleted = 0;
    for (const [, list, toRecord] of tables) {
      for (const item of list) { const r = await deleteRecord(toRecord(item).id); if (r && r.ok) deleted += r.deleted || 0; }
    }
    totals.fixtureRecordsDeleted = deleted;
  }

  const summary = {
    mode: fixture ? "test-fixture" : (verifyOnly ? "verify-only" : "migrate"),
    source: src.kind, field: fieldUrl(), results, absentTables, ...totals,
  };
  console.log(JSON.stringify(summary, null, 2));
  await src.close();
  const bad = results.some((t) => (t.mismatches || []).length > 0);
  return bad ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => { console.error(String(e && e.stack || e)); process.exit(1); });
