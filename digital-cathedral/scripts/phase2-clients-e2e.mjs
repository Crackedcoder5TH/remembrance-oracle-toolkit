#!/usr/bin/env node
/**
 * PHASE 2 close-out proof — the buyer store (clients, delivery filters,
 * lead purchases) on a LIVE field server, with the EXACT record shapes and
 * guards app/lib/client-database/substrate-adapter.ts writes (mirrored:
 * ids, tags, guard construction). Every fixture record is deleted after
 * and the store verified clean; fixture data never remains and is never
 * presented as a measurement.
 *
 * Proves, in order:
 *   1. AUTH — with a token configured, every legacy action and recall is
 *      refused without the bearer (MCP and REST), and served with it.
 *   2. CLIENT UNIQUENESS — store_guarded on the email key: first insert
 *      lands; a second client with the same email (different case) is
 *      refused; the same client id comes back as a duplicate.
 *   3. EMAIL LOOKUP — the client is found by its hashed email tag,
 *      case-insensitively, byte-identical on read-back.
 *   4. PURCHASE CAP (shared) — maxBuyers 2: two inserted, the third
 *      sold_out; a duplicate purchase id returns the stored purchase.
 *   5. EXCLUSIVITY — an exclusive buy on a fresh lead lands; a shared buy
 *      after it is blocked by the exclusive tag; a second exclusive is
 *      sold_out; an exclusive on a lead with a shared buyer is sold_out.
 *   6. RETURN FREES CAPACITY — a delivered purchase re-stored as returned
 *      no longer counts; the previously refused buyer now lands.
 *   7. CONCURRENCY — 12 simultaneous shared checkouts against max 3 on a
 *      fresh lead: exactly 3 inserted, 9 sold_out (the atomic guard).
 *   8. WILDCARD SAFETY — purchases on a lead whose id differs only where
 *      another id has '_' (a LIKE wildcard) do not count toward its cap.
 *
 * Needs REMEMBRANCE_FIELD_URL (+ REMEMBRANCE_FIELD_TOKEN to prove auth).
 * Exits nonzero on any divergence. Run: node scripts/phase2-clients-e2e.mjs
 */
import { createHash } from "node:crypto";

const BASE = (process.env.REMEMBRANCE_FIELD_URL || "http://127.0.0.1:7787").trim().replace(/\/mcp$/, "").replace(/\/$/, "");
const TOKEN = (process.env.REMEMBRANCE_FIELD_TOKEN || "").trim();

/** JSON that may not be JSON never throws — a bad payload fails a CHECK, not the run. */
const parseJson = (text) => { try { return JSON.parse(text); } catch { return null; } };

async function mcp(name, args, { auth = true } = {}) {
  if (typeof name !== "string" || !name || typeof args !== "object" || args === null) {
    throw new TypeError("mcp requires a tool name and an arguments object");
  }
  const headers = { "Content-Type": "application/json" };
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(BASE + "/mcp", {
    method: "POST", headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const json = await res.json();
  const item = json?.result;
  const text = item?.content?.[0]?.text;
  return { isError: item?.isError === true, text, body: text ? parseJson(text) : null };
}
async function rest(pathname, payload, { auth = true } = {}) {
  const headers = { "Content-Type": "application/json" };
  if (auth && TOKEN) headers.Authorization = `Bearer ${TOKEN}`;
  const res = await fetch(BASE + pathname, { method: "POST", headers, body: JSON.stringify(payload) });
  return { status: res.status, body: parseJson(await res.text()) };
}
const legacy = async (args) => (await mcp("legacy", args)).body;

const failures = [];
function check(name, ok, detail) {
  if (typeof name !== "string" || !name) throw new TypeError("check requires a name");
  if (!ok) failures.push({ name, detail });
  console.log(`${ok ? "✓" : "✗"} ${name}${ok ? "" : "  — " + JSON.stringify(detail)}`);
  return Boolean(ok);
}

// ── shapes + guards, mirrored from substrate-adapter.ts ──────────────
const T = Date.now().toString(36);
const CLIENT_TAG = "valor-client";
const PURCHASE_TAG = "valor-purchase";
const EXCLUSIVE_TAG = "purchase-exclusive";
const emailKey = (email) => "client-email:" + createHash("sha256").update(email.trim().toLowerCase()).digest("hex");
const clientTags = (c) => [CLIENT_TAG, "client-status:" + c.status, emailKey(c.email)];
const purchaseLeadTag = (leadId) => "purchase-lead:" + leadId;
const purchaseTags = (p) => [purchaseLeadTag(p.leadId), PURCHASE_TAG, "purchase-client:" + p.clientId,
  "purchase-status:" + p.status, p.exclusive ? EXCLUSIVE_TAG : "purchase-shared"];
function purchaseGuard(p, maxBuyers) {
  if (!p || !p.leadId || !Number.isInteger(maxBuyers)) throw new TypeError("purchaseGuard requires a purchase and an integer cap");
  return p.exclusive
    ? { tags: [purchaseLeadTag(p.leadId), PURCHASE_TAG, "purchase-status:delivered"], max: 1 }
    : { tags: [purchaseLeadTag(p.leadId), PURCHASE_TAG, "purchase-status:delivered"], max: maxBuyers, blockTag: EXCLUSIVE_TAG };
}

const cleanupIds = new Set();
function client(n, email) {
  if (n === undefined || typeof email !== "string" || !email) throw new TypeError("client requires a number and an email");
  return {
    clientId: `client_p2cfix_${T}_${n}`, companyName: `FIXTURE Buyer ${n}`, contactName: "Fixture", email,
    phone: "+10000000000", passwordHash: "fixturesalt:fixturehash", status: "active", pricingTier: "standard",
    pricePerLead: 2500, exclusivePrice: 5000, stateLicenses: "[]", coverageTypes: "[]", dailyCap: 50,
    monthlyCap: 1000, minScore: 0, balance: 0, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
  };
}
async function insertClient(c) {
  const id = "client:" + c.clientId;
  cleanupIds.add(id);
  return legacy({ action: "store_guarded", id, name: id, content: JSON.stringify(c), tags: clientTags(c),
    guard: { tags: [emailKey(c.email), CLIENT_TAG], max: 1 } });
}
let pSeq = 0;
const purchase = (leadId, clientId, exclusive, status = "delivered") => ({
  purchaseId: `purchase_p2cfix_${T}_${++pSeq}`, leadId, clientId, pricePaid: exclusive ? 5000 : 2500,
  purchasedAt: new Date().toISOString(), status, exclusive, returnReason: "", returnDeadline: "",
});
async function buy(p, maxBuyers) {
  if (!p || !p.purchaseId) throw new TypeError("buy requires a purchase");
  const id = "purchase:" + p.purchaseId;
  cleanupIds.add(id);
  return legacy({ action: "store_guarded", id, name: id, content: JSON.stringify(p), tags: purchaseTags(p), guard: purchaseGuard(p, maxBuyers) });
}
async function restore(p) {
  const id = "purchase:" + p.purchaseId;
  return legacy({ action: "store", id, name: id, content: JSON.stringify(p), tags: purchaseTags(p) });
}

async function main() {
  // ── 1. auth ──
  if (TOKEN) {
    for (const action of ["list", "get", "delete", "store", "store_guarded", "resonant"]) {
      const r = await mcp("legacy", { action, id: "p2cfix-auth-probe", q: "x" }, { auth: false });
      check(`auth: MCP legacy ${action} refused without the bearer`, r.isError && /unauthorized/i.test(r.text || ""), r.text);
    }
    const rc = await mcp("recall", { query: "fixture" }, { auth: false });
    check("auth: MCP recall refused without the bearer", rc.isError && /unauthorized/i.test(rc.text || ""), rc.text);
    const rl = await rest("/legacy", { action: "list" }, { auth: false });
    check("auth: REST /legacy list refused without the bearer", rl.status === 401, rl.status);
    const rr = await rest("/recall", { query: "fixture" }, { auth: false });
    check("auth: REST /recall refused without the bearer", rr.status === 401, rr.status);
    const ok = await mcp("legacy", { action: "list", limit: 1 });
    check("auth: served with the bearer", !ok.isError && ok.body?.ok === true, ok.text);
  } else {
    console.log("· auth: no REMEMBRANCE_FIELD_TOKEN — the server is in open mode; auth checks skipped");
  }

  // ── 2. client uniqueness ──
  const email = `P2C.Fixture.${T}@test.invalid`;
  const c1 = client(1, email);
  const i1 = await insertClient(c1);
  check("client: first insert lands", i1?.ok && i1.outcome === "inserted", i1);
  const i2 = await insertClient(client(2, email.toLowerCase()));
  check("client: same email (other case) refused — UNIQUE(email)", i2?.ok && i2.outcome === "sold_out", i2);
  const i3 = await insertClient(c1);
  check("client: same client id returns duplicate", i3?.ok && i3.outcome === "duplicate", i3);

  // ── 3. email lookup ──
  const found = await legacy({ action: "list", tags: [emailKey(email.toUpperCase()), CLIENT_TAG], limit: 200, offset: 0 });
  const hits = (found?.legacies || []).filter((r) => [emailKey(email), CLIENT_TAG].every((t) => (r.tags || []).includes(t)));
  check("client: found by hashed email tag, case-insensitive", hits.length === 1, hits.length);
  check("client: read-back byte-identical", hits[0]?.content === JSON.stringify(c1));

  // ── 4. shared cap ──
  const leadA = `P2CFIX-A-${T}`;
  const pa1 = purchase(leadA, c1.clientId, false), pa2 = purchase(leadA, c1.clientId, false), pa3 = purchase(leadA, c1.clientId, false);
  const ra1 = await buy(pa1, 2), ra2 = await buy(pa2, 2), ra3 = await buy(pa3, 2);
  check("cap: first shared buyer inserted", ra1?.outcome === "inserted", ra1);
  check("cap: second shared buyer inserted", ra2?.outcome === "inserted", ra2);
  check("cap: third shared buyer sold_out at max 2", ra3?.outcome === "sold_out", ra3);
  const dup = await buy(pa1, 2);
  check("cap: duplicate purchase id returns the stored purchase", dup?.outcome === "duplicate" && dup.legacy?.content === JSON.stringify(pa1), dup);

  // ── 5. exclusivity ──
  const leadB = `P2CFIX-B-${T}`;
  const rb1 = await buy(purchase(leadB, c1.clientId, true), 3);
  check("exclusive: exclusive buy on a fresh lead lands", rb1?.outcome === "inserted", rb1);
  const rb2 = await buy(purchase(leadB, c1.clientId, false), 3);
  check("exclusive: shared buy blocked by the exclusive holder", rb2?.outcome === "sold_out", rb2);
  const rb3 = await buy(purchase(leadB, c1.clientId, true), 3);
  check("exclusive: second exclusive sold_out", rb3?.outcome === "sold_out", rb3);
  const rb4 = await buy(purchase(leadA, c1.clientId, true), 3);
  check("exclusive: exclusive on a lead with shared buyers sold_out", rb4?.outcome === "sold_out", rb4);

  // ── 6. a return frees capacity ──
  const rs = await restore({ ...pa2, status: "returned" });
  check("return: purchase re-stored as returned", rs?.ok === true, rs);
  const pa4 = purchase(leadA, c1.clientId, false);
  const ra4 = await buy(pa4, 2);
  check("return: the freed seat is sold to the next buyer", ra4?.outcome === "inserted", ra4);

  // ── 7. concurrency: the atomic guard under a storm ──
  const leadC = `P2CFIX-C-${T}`;
  const storm = await Promise.all(Array.from({ length: 12 }, () => buy(purchase(leadC, c1.clientId, false), 3)));
  const inserted = storm.filter((r) => r?.outcome === "inserted").length;
  const soldOut = storm.filter((r) => r?.outcome === "sold_out").length;
  check("concurrency: 12 simultaneous checkouts, max 3 → exactly 3 inserted", inserted === 3, { inserted, soldOut });
  check("concurrency: the other 9 sold_out", soldOut === 9, { inserted, soldOut });

  // ── 8. LIKE-wildcard safety ──
  const leadWild = `P2CFIX_W_${T}`;               // '_' is a LIKE wildcard
  const leadTwin = `P2CFIXxWx${T}`;               // matches leadWild's LIKE pattern, is a different lead
  await buy(purchase(leadTwin, c1.clientId, false), 5);
  await buy(purchase(leadTwin, c1.clientId, false), 5);
  const rw = await buy(purchase(leadWild, c1.clientId, true), 3);
  check("wildcard: another lead's purchases do not count toward this lead's cap", rw?.outcome === "inserted", rw);

  // ── cleanup ──
  let deleted = 0;
  for (const id of cleanupIds) { const r = await legacy({ action: "delete", id }); deleted += r?.deleted || 0; }
  const left = await legacy({ action: "list", q: `p2cfix_${T}`, limit: 5 });
  const left2 = await legacy({ action: "list", q: `P2CFIX`, limit: 5 });
  check("cleanup: every fixture record deleted", (left?.total ?? -1) === 0 && (left2?.total ?? -1) === 0, { deleted, left: left?.total, left2: left2?.total });

  console.log(JSON.stringify({ checks_failed: failures.length, fixtureRecordsDeleted: deleted, field: BASE }, null, 2));
  return failures.length ? 1 : 0;
}

main().then((code) => process.exit(code)).catch((e) => { console.error(String((e && e.stack) || e)); process.exit(1); });
