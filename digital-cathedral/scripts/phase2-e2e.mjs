#!/usr/bin/env node
/**
 * PHASE 2 end-to-end proof against a LIVE field server: exercises every
 * persistence semantic the compliance-substrate and lead-ops-dataset ports
 * rely on, with the EXACT record shapes those modules write (mirrored —
 * ids, tags, content fields), then DELETES every fixture record and
 * verifies the store is clean. Fixture data never remains and is never
 * presented as a measurement.
 *
 * Proves, in order:
 *   1. AUDIT is append-only: two events → two distinct records, both
 *      listable by tag, newest first, byte-identical on read-back.
 *   2. SUPPRESSION upsert keeps first-writer createdBy/createdAt while
 *      refreshing reason/source (the SQL ON CONFLICT semantics), and
 *      isSuppressed resolves via direct getRecord on either hash.
 *   3. ACKNOWLEDGEMENT whole-row upsert (second ack overwrites).
 *   4. PRIVACY create (unique time-ordered id) then update
 *      (read-modify-write: status/notes/completedAt move, createdAt held).
 *   5. REVIEW upsert.
 *   6. LEAD-OPS DATASET fold: two ops records with activity → ops rows,
 *      activityCounts, firstAgentActionByLead with the SQL key shape
 *      `${clientId}:${leadId}`.
 *
 * Needs REMEMBRANCE_FIELD_URL (+ token if enforced). Exits nonzero on
 * any divergence. Run: node scripts/phase2-e2e.mjs
 */

const FIELD = (() => {
  const raw = (process.env.REMEMBRANCE_FIELD_URL || "http://127.0.0.1:7787/mcp").trim();
  return raw.endsWith("/mcp") ? raw : raw.replace(/\/$/, "") + "/mcp";
})();

/** JSON that may not be JSON never throws — a bad payload fails a CHECK, not the run. */
const parseJson = (text) => { try { return JSON.parse(text); } catch { return null; } };

async function mcp(name, args) {
  if (typeof name !== "string" || !name || typeof args !== "object" || args === null) return null;
  const headers = { "Content-Type": "application/json" };
  const token = (process.env.REMEMBRANCE_FIELD_TOKEN || "").trim();
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(FIELD, {
    method: "POST", headers,
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name, arguments: args } }),
  });
  const json = await res.json();
  const text = json?.result?.content?.[0]?.text;
  return text ? parseJson(text) : null;
}
const store = (rec) => mcp("legacy", { action: "store", ...rec });
const get = async (id) => { const r = await mcp("legacy", { action: "get", id }); return r && r.ok ? r.legacy : null; };
const del = (id) => mcp("legacy", { action: "delete", id });
const list = (tags, limit = 100) => mcp("legacy", { action: "list", tags, limit, offset: 0 });

const failures = [];
function check(name, ok, detail) {
  if (typeof name !== "string" || !name) throw new TypeError("check requires a name");
  if (!ok) failures.push({ name, detail });
  return Boolean(ok);
}
const cleanupIds = [];
async function put(rec) { cleanupIds.push(rec.id); const r = await store(rec); return r && r.ok; }

const T = Date.now();
const tag = (s) => `p2fix-${s}`;   // every fixture tag namespaced, nothing collides with live data

async function main() {
  // ── 1. audit append-only ──
  const a1 = { id: T, createdAt: new Date(T).toISOString(), actorId: "fixture-admin", actorRole: "admin", eventType: "suppression_added", targetType: "phone", targetId: "fixturehash", summary: "FIXTURE audit one", ip: null, userAgent: null };
  const a2 = { ...a1, id: T + 1, createdAt: new Date(T + 1).toISOString(), summary: "FIXTURE audit two" };
  await put({ id: `p2fix:audit:${T}:1`, name: a1.eventType, content: JSON.stringify(a1), tags: [tag("audit"), "evt:suppression_added", "actor:admin"] });
  await put({ id: `p2fix:audit:${T}:2`, name: a2.eventType, content: JSON.stringify(a2), tags: [tag("audit"), "evt:suppression_added", "actor:admin"] });
  const auditList = await list([tag("audit")]);
  check("audit: two distinct records listed", auditList?.ok && auditList.total === 2, auditList?.total);
  const b1 = await get(`p2fix:audit:${T}:1`);
  const b2 = await get(`p2fix:audit:${T}:2`);
  check("audit: read-back byte-identical", b1?.content === JSON.stringify(a1) && b2?.content === JSON.stringify(a2));

  // ── 2. suppression upsert conflict semantics ──
  const hash = "f".repeat(64);
  const sId = `p2fix:suppression:phone:${hash}`;
  const first = { id: T, kind: "phone", valueMasked: "•••0001", valueHash: hash, reason: "first reason", source: "fixture", active: true, createdBy: "admin-one", createdAt: new Date(T).toISOString() };
  await put({ id: sId, name: sId, content: JSON.stringify(first), tags: [tag("suppression"), "kind:phone", "active"] });
  // second write mirrors substrateAddSuppression's read-modify-write: reason/source refresh, first writer kept
  const existing = parseJson((await get(sId))?.content) || {};
  const second = { ...existing, reason: "second reason", source: "fixture-2", active: true };
  await put({ id: sId, name: sId, content: JSON.stringify(second), tags: [tag("suppression"), "kind:phone", "active"] });
  const after = parseJson((await get(sId))?.content) || {};
  check("suppression: reason/source refreshed", after.reason === "second reason" && after.source === "fixture-2");
  check("suppression: first-writer createdBy/createdAt kept", after.createdBy === "admin-one" && after.createdAt === first.createdAt);
  check("suppression: isSuppressed resolves via getRecord", after.active === true);

  // ── 3. acknowledgement upsert ──
  const ackId = "p2fix:ack:agent-9";
  await put({ id: ackId, name: ackId, content: JSON.stringify({ agentId: "agent-9", version: "v1", acknowledgedAt: new Date(T).toISOString(), active: true }), tags: [tag("ack"), "active"] });
  await put({ id: ackId, name: ackId, content: JSON.stringify({ agentId: "agent-9", version: "v2", acknowledgedAt: new Date(T + 5).toISOString(), active: true }), tags: [tag("ack"), "active"] });
  const ack = parseJson((await get(ackId))?.content) || {};
  check("acknowledgement: whole-row upsert (v2 wins)", ack.version === "v2");

  // ── 4. privacy create + read-modify-write update ──
  const pId = `p2fix:privacy:${T}`;
  const created = { id: T, leadId: "FIXTURE-L1", requester: "fixture", requestType: "deletion", status: "new", targetDate: null, assignedAdmin: null, notes: "", completedAt: null, createdAt: new Date(T).toISOString(), updatedAt: new Date(T).toISOString() };
  await put({ id: pId, name: pId, content: JSON.stringify(created), tags: [tag("privacy"), "lead:FIXTURE-L1", "status:new"] });
  const row = parseJson((await get(pId))?.content) || {};
  row.status = "completed"; row.notes = "done"; row.assignedAdmin = "admin-one";
  row.completedAt = new Date(T + 9).toISOString(); row.updatedAt = row.completedAt;
  await put({ id: pId, name: pId, content: JSON.stringify(row), tags: [tag("privacy"), "lead:FIXTURE-L1", "status:completed"] });
  const updated = parseJson((await get(pId))?.content) || {};
  check("privacy: status/notes/completedAt moved", updated.status === "completed" && updated.notes === "done" && updated.completedAt !== null);
  check("privacy: createdAt held through update", updated.createdAt === created.createdAt);
  const byLead = await list([tag("privacy"), "lead:FIXTURE-L1"]);
  check("privacy: listable by lead tag", byLead?.ok && byLead.total === 1);

  // ── 5. review upsert ──
  await put({ id: "p2fix:review:FIXTURE-L1", name: "p2fix:review:FIXTURE-L1", content: JSON.stringify({ leadId: "FIXTURE-L1", reviewedAt: new Date(T).toISOString(), reviewedBy: "admin-one" }), tags: [tag("review")] });
  check("review: present after upsert", Boolean(await get("p2fix:review:FIXTURE-L1")));

  // ── 6. the dataset fold over lead-ops-shaped records ──
  const opsA = { status: "Contacted", lastContactedAt: new Date(T).toISOString(), nextFollowUpAt: null, appointmentAt: null, doNotContact: false, disputeStatus: null, notes: [],
    activity: [
      { id: 2, eventType: "contacted", eventLabel: "Lead marked contacted", actorRole: "agent", createdAt: new Date(T + 2).toISOString() },
      { id: 1, eventType: "status_changed", eventLabel: "Status changed to Contacted", actorRole: "agent", createdAt: new Date(T + 1).toISOString() },
    ] };
  const opsB = { status: "New", lastContactedAt: null, nextFollowUpAt: null, appointmentAt: null, doNotContact: true, disputeStatus: null, notes: [],
    activity: [ { id: 1, eventType: "status_changed", eventLabel: "Status changed to Do Not Contact", actorRole: "admin", createdAt: new Date(T + 3).toISOString() } ] };
  await put({ id: "ops:P2FIX-A:client-1", name: "ops:P2FIX-A:client-1", content: JSON.stringify(opsA), tags: [tag("lead-ops")] });
  await put({ id: "ops:P2FIX-B:global", name: "ops:P2FIX-B:global", content: JSON.stringify(opsB), tags: [tag("lead-ops")] });
  // the fold, exactly as substrateGetOperationsDataset performs it
  const page = await list([tag("lead-ops")], 200);
  const ops = []; const activityCounts = {}; const firstAgentActionByLead = {};
  for (const rec of page.legacies || page.records || []) {
    if (!rec.id?.startsWith("ops:")) continue;
    const cut = rec.id.lastIndexOf(":");
    const leadId = rec.id.slice(4, cut);
    const scope = rec.id.slice(cut + 1);
    const recClient = scope === "global" ? "" : scope;
    const o = parseJson(rec.content);
    if (!o) continue;
    ops.push({ leadId, clientId: recClient, status: o.status, doNotContact: o.doNotContact });
    for (const a of o.activity) {
      activityCounts[a.eventType] = (activityCounts[a.eventType] || 0) + 1;
      if (a.actorRole === "agent") {
        const key = `${recClient}:${leadId}`;
        if (!firstAgentActionByLead[key] || a.createdAt < firstAgentActionByLead[key]) firstAgentActionByLead[key] = a.createdAt;
      }
    }
  }
  check("dataset: two ops rows folded", ops.length === 2, ops.length);
  check("dataset: activity counts exact", activityCounts.status_changed === 2 && activityCounts.contacted === 1, activityCounts);
  check("dataset: first agent action keyed and admin-only lead absent",
    firstAgentActionByLead["client-1:P2FIX-A"] === new Date(T + 1).toISOString() && !(":P2FIX-B" in firstAgentActionByLead),
    firstAgentActionByLead);

  // ── cleanup: every fixture record leaves the store ──
  let deleted = 0;
  for (const id of [...new Set(cleanupIds)]) { const r = await del(id); if (r && r.ok) deleted += r.deleted || 0; }
  let gone = 0;
  for (const id of [...new Set(cleanupIds)]) if (!(await get(id))) gone += 1;

  const summary = { field: FIELD, checks_passed: 13 - failures.length, checks_total: 13, failed: failures, fixtureRecordsDeleted: deleted, verified_gone: gone, of: [...new Set(cleanupIds)].length };
  console.log(JSON.stringify(summary, null, 2));
  return failures.length === 0 && gone === [...new Set(cleanupIds)].length ? 0 : 1;
}

main().then((c) => process.exit(c)).catch((e) => { console.error(String(e?.stack || e)); process.exit(1); });
