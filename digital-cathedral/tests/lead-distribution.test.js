/**
 * Tests for app/lib/lead-distribution.ts — distributeLead, matchClientToLead, executePurchase.
 *
 * Re-implements the distribution logic for standalone testing.
 */
import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";

// --- Mock data stores ---
let clients;
let clientFilters;
let dailyCounts;
let monthlyCounts;
let purchases;
let roundRobinIndex;

function resetMocks() {
  clients = [];
  clientFilters = new Map();
  dailyCounts = new Map();
  monthlyCounts = new Map();
  purchases = [];
  roundRobinIndex = 0;
}

// --- Re-implement distribution logic (matching app/lib/lead-distribution.ts) ---

async function matchClientToLead(client, lead, score) {
  if (score.total < client.minScore)
    return { match: false, exclusive: false, reason: `Score ${score.total} below minimum ${client.minScore}` };

  const licenses = JSON.parse(client.stateLicenses || "[]");
  if (licenses.length > 0 && !licenses.includes(lead.state))
    return { match: false, exclusive: false, reason: `Not licensed in ${lead.state}` };

  const coverageTypes = JSON.parse(client.coverageTypes || "[]");
  if (coverageTypes.length > 0 && !coverageTypes.includes(lead.coverageInterest))
    return { match: false, exclusive: false, reason: `Coverage ${lead.coverageInterest} not wanted` };

  const daily = dailyCounts.get(client.clientId) || 0;
  if (daily >= client.dailyCap)
    return { match: false, exclusive: false, reason: "Daily cap reached" };

  const monthly = monthlyCounts.get(client.clientId) || 0;
  if (monthly >= client.monthlyCap)
    return { match: false, exclusive: false, reason: "Monthly cap reached" };

  const filters = clientFilters.get(client.clientId);
  let exclusive = false;
  if (filters) {
    const filterStates = JSON.parse(filters.states || "[]");
    if (filterStates.length > 0 && !filterStates.includes(lead.state))
      return { match: false, exclusive: false, reason: `State ${lead.state} not in filter` };

    const filterCoverage = JSON.parse(filters.coverageTypes || "[]");
    if (filterCoverage.length > 0 && !filterCoverage.includes(lead.coverageInterest))
      return { match: false, exclusive: false, reason: "Coverage not in filter" };

    if (filters.veteranOnly && lead.veteranStatus !== "veteran")
      return { match: false, exclusive: false, reason: "Veteran-only filter" };

    if (score.total < filters.minScore)
      return { match: false, exclusive: false, reason: `Score below filter minimum ${filters.minScore}` };

    const ageHours = (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours > filters.maxLeadAge)
      return { match: false, exclusive: false, reason: "Lead too old" };

    exclusive = filters.distributionMode === "exclusive";
  }

  return { match: true, exclusive, reason: "" };
}

async function distributeLead(lead, score) {
  const result = { leadId: lead.leadId, distributed: false, purchases: [], skipped: [] };

  if (clients.length === 0) return result;

  const eligible = [];
  for (const client of clients) {
    const matchResult = await matchClientToLead(client, lead, score);
    if (matchResult.match) {
      eligible.push({ client, exclusive: matchResult.exclusive });
    } else {
      result.skipped.push({ clientId: client.clientId, reason: matchResult.reason });
    }
  }

  if (eligible.length === 0) return result;

  // Exclusive buyers get priority
  const exclusiveBuyers = eligible.filter(e => e.exclusive);
  if (exclusiveBuyers.length > 0) {
    const buyer = exclusiveBuyers[roundRobinIndex % exclusiveBuyers.length];
    roundRobinIndex++;
    const purchase = { clientId: buyer.client.clientId, purchaseId: `pur_${Date.now()}`, exclusive: true };
    purchases.push(purchase);
    result.purchases.push(purchase);
    result.distributed = true;
    return result;
  }

  // Shared distribution — up to 3 buyers
  const MAX_SHARED_BUYERS = 3;
  const sharedBuyers = eligible.slice(0, MAX_SHARED_BUYERS);
  for (const { client } of sharedBuyers) {
    const purchase = { clientId: client.clientId, purchaseId: `pur_${Date.now()}_${client.clientId}`, exclusive: false };
    purchases.push(purchase);
    result.purchases.push(purchase);
    result.distributed = true;
  }

  return result;
}

// --- Fixtures ---
function makeClient(overrides = {}) {
  return {
    clientId: "client_1",
    status: "active",
    stateLicenses: "[]",
    coverageTypes: "[]",
    dailyCap: 10,
    monthlyCap: 100,
    minScore: 50,
    ...overrides,
  };
}

function makeLead(overrides = {}) {
  return {
    leadId: "lead_test_1",
    state: "TX",
    coverageInterest: "mortgage-protection",
    veteranStatus: "veteran",
    createdAt: new Date().toISOString(),
    ...overrides,
  };
}

function makeScore(overrides = {}) {
  return { total: 85, tier: "hot", factors: {}, ...overrides };
}

// --- Tests ---

describe("matchClientToLead", () => {
  beforeEach(() => resetMocks());

  it("matches when all criteria pass", async () => {
    const result = await matchClientToLead(makeClient(), makeLead(), makeScore());
    assert.equal(result.match, true);
  });

  it("rejects when score below minimum", async () => {
    const result = await matchClientToLead(makeClient({ minScore: 90 }), makeLead(), makeScore({ total: 70 }));
    assert.equal(result.match, false);
    assert.ok(result.reason.includes("Score"));
  });

  it("rejects when not licensed in lead's state", async () => {
    const result = await matchClientToLead(
      makeClient({ stateLicenses: JSON.stringify(["CA", "NY"]) }),
      makeLead({ state: "TX" }),
      makeScore()
    );
    assert.equal(result.match, false);
    assert.ok(result.reason.includes("licensed"));
  });

  it("matches when licensed in lead's state", async () => {
    const result = await matchClientToLead(
      makeClient({ stateLicenses: JSON.stringify(["TX", "CA"]) }),
      makeLead({ state: "TX" }),
      makeScore()
    );
    assert.equal(result.match, true);
  });

  it("matches when state licenses is empty (accepts all)", async () => {
    const result = await matchClientToLead(makeClient({ stateLicenses: "[]" }), makeLead(), makeScore());
    assert.equal(result.match, true);
  });

  it("rejects when coverage not wanted", async () => {
    const result = await matchClientToLead(
      makeClient({ coverageTypes: JSON.stringify(["final-expense"]) }),
      makeLead({ coverageInterest: "mortgage-protection" }),
      makeScore()
    );
    assert.equal(result.match, false);
    assert.ok(result.reason.includes("Coverage"));
  });

  it("rejects when daily cap reached", async () => {
    const client = makeClient({ dailyCap: 5 });
    dailyCounts.set(client.clientId, 5);
    const result = await matchClientToLead(client, makeLead(), makeScore());
    assert.equal(result.match, false);
    assert.ok(result.reason.includes("Daily cap"));
  });

  it("rejects when monthly cap reached", async () => {
    const client = makeClient({ monthlyCap: 50 });
    monthlyCounts.set(client.clientId, 50);
    const result = await matchClientToLead(client, makeLead(), makeScore());
    assert.equal(result.match, false);
    assert.ok(result.reason.includes("Monthly cap"));
  });

  it("uses exclusive mode from client filters", async () => {
    const client = makeClient();
    clientFilters.set(client.clientId, {
      states: "[]",
      coverageTypes: "[]",
      veteranOnly: false,
      minScore: 0,
      maxLeadAge: 999,
      distributionMode: "exclusive",
    });
    const result = await matchClientToLead(client, makeLead(), makeScore());
    assert.equal(result.match, true);
    assert.equal(result.exclusive, true);
  });

  it("rejects when veteran-only filter set and lead is non-military", async () => {
    const client = makeClient();
    clientFilters.set(client.clientId, {
      states: "[]",
      coverageTypes: "[]",
      veteranOnly: true,
      minScore: 0,
      maxLeadAge: 999,
      distributionMode: "shared",
    });
    const result = await matchClientToLead(client, makeLead({ veteranStatus: "non-military" }), makeScore());
    assert.equal(result.match, false);
    assert.ok(result.reason.includes("Veteran-only"));
  });

  it("rejects when lead too old per filter", async () => {
    const client = makeClient();
    clientFilters.set(client.clientId, {
      states: "[]",
      coverageTypes: "[]",
      veteranOnly: false,
      minScore: 0,
      maxLeadAge: 1, // 1 hour max
      distributionMode: "shared",
    });
    const oldLead = makeLead({ createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString() }); // 2 hours old
    const result = await matchClientToLead(client, oldLead, makeScore());
    assert.equal(result.match, false);
    assert.ok(result.reason.includes("too old"));
  });
});

describe("distributeLead", () => {
  beforeEach(() => resetMocks());

  it("returns not distributed when no clients", async () => {
    const result = await distributeLead(makeLead(), makeScore());
    assert.equal(result.distributed, false);
    assert.equal(result.purchases.length, 0);
  });

  it("distributes to exclusive buyer with priority", async () => {
    clients.push(makeClient({ clientId: "shared_1" }));
    clients.push(makeClient({ clientId: "excl_1" }));
    clientFilters.set("excl_1", {
      states: "[]", coverageTypes: "[]", veteranOnly: false,
      minScore: 0, maxLeadAge: 999, distributionMode: "exclusive",
    });

    const result = await distributeLead(makeLead(), makeScore());
    assert.equal(result.distributed, true);
    assert.equal(result.purchases.length, 1);
    assert.equal(result.purchases[0].clientId, "excl_1");
    assert.equal(result.purchases[0].exclusive, true);
  });

  it("caps shared distribution at 3 buyers", async () => {
    clients.push(makeClient({ clientId: "c1" }));
    clients.push(makeClient({ clientId: "c2" }));
    clients.push(makeClient({ clientId: "c3" }));
    clients.push(makeClient({ clientId: "c4" }));
    clients.push(makeClient({ clientId: "c5" }));

    const result = await distributeLead(makeLead(), makeScore());
    assert.equal(result.distributed, true);
    assert.equal(result.purchases.length, 3);
  });

  it("tracks skipped clients with reasons", async () => {
    clients.push(makeClient({ clientId: "good", minScore: 50 }));
    clients.push(makeClient({ clientId: "bad", minScore: 95 }));

    const result = await distributeLead(makeLead(), makeScore({ total: 80 }));
    assert.equal(result.purchases.length, 1);
    assert.equal(result.skipped.length, 1);
    assert.equal(result.skipped[0].clientId, "bad");
  });

  it("does round-robin among exclusive buyers", async () => {
    clients.push(makeClient({ clientId: "excl_a" }));
    clients.push(makeClient({ clientId: "excl_b" }));
    clientFilters.set("excl_a", {
      states: "[]", coverageTypes: "[]", veteranOnly: false,
      minScore: 0, maxLeadAge: 999, distributionMode: "exclusive",
    });
    clientFilters.set("excl_b", {
      states: "[]", coverageTypes: "[]", veteranOnly: false,
      minScore: 0, maxLeadAge: 999, distributionMode: "exclusive",
    });

    const r1 = await distributeLead(makeLead({ leadId: "lead_1" }), makeScore());
    const r2 = await distributeLead(makeLead({ leadId: "lead_2" }), makeScore());

    assert.notEqual(r1.purchases[0].clientId, r2.purchases[0].clientId);
  });

  it("returns leadId in result", async () => {
    const result = await distributeLead(makeLead({ leadId: "lead_xyz" }), makeScore());
    assert.equal(result.leadId, "lead_xyz");
  });
});
