/**
 * Lead Distribution Engine
 *
 * Matches incoming leads to eligible client buyers based on:
 *   - Client filters (state, coverage, veteran, min score)
 *   - Cap enforcement (daily + monthly limits)
 *   - Distribution mode (exclusive, shared, round-robin)
 *
 * Called after a lead is persisted, scored, and broadcast.
 */

import {
  getFilteredClients,
  getClientFilters,
  getClientDailyPurchaseCount,
  getClientMonthlyPurchaseCount,
  createPurchase,
  generatePurchaseId,
} from "./client-database";
import type { ClientRecord, LeadPurchase } from "./client-database";
import type { LeadRecord } from "./database";
import type { LeadScore } from "./lead-scoring";

export interface DistributionResult {
  leadId: string;
  distributed: boolean;
  purchases: Array<{ clientId: string; purchaseId: string; exclusive: boolean }>;
  skipped: Array<{ clientId: string; reason: string }>;
}

// Round-robin index tracked in-memory (resets on restart — acceptable for distribution fairness)
let roundRobinIndex = 0;

/**
 * Distribute a lead to matching clients.
 *
 * This is non-blocking — called fire-and-forget after lead creation.
 */
export async function distributeLead(
  lead: LeadRecord,
  score: LeadScore
): Promise<DistributionResult> {
  const result: DistributionResult = {
    leadId: lead.leadId,
    distributed: false,
    purchases: [],
    skipped: [],
  };

  // Get all active clients
  const clientsResult = await getFilteredClients({ status: "active", limit: 200 });
  if (!clientsResult.ok || clientsResult.value.clients.length === 0) {
    return result;
  }

  const allClients = clientsResult.value.clients;

  // Filter clients by match criteria
  const eligible: Array<{ client: ClientRecord; exclusive: boolean }> = [];

  for (const client of allClients) {
    const matchResult = await matchClientToLead(client, lead, score);
    if (matchResult.match) {
      eligible.push({ client, exclusive: matchResult.exclusive });
    } else {
      result.skipped.push({ clientId: client.clientId, reason: matchResult.reason });
    }
  }

  if (eligible.length === 0) return result;

  // Check for exclusive buyers first — they get priority
  const exclusiveBuyers = eligible.filter((e) => e.exclusive);
  if (exclusiveBuyers.length > 0) {
    // Round-robin among exclusive buyers
    const buyer = exclusiveBuyers[roundRobinIndex % exclusiveBuyers.length];
    roundRobinIndex++;

    const purchaseResult = await executePurchase(buyer.client, lead, true);
    if (purchaseResult) {
      result.purchases.push(purchaseResult);
      result.distributed = true;
    }
    return result;
  }

  // Shared distribution — send to all eligible (up to 3 buyers per lead)
  const MAX_SHARED_BUYERS = 3;
  const sharedBuyers = eligible.slice(0, MAX_SHARED_BUYERS);

  for (const { client } of sharedBuyers) {
    const purchaseResult = await executePurchase(client, lead, false);
    if (purchaseResult) {
      result.purchases.push(purchaseResult);
      result.distributed = true;
    }
  }

  return result;
}

async function matchClientToLead(
  client: ClientRecord,
  lead: LeadRecord,
  score: LeadScore
): Promise<{ match: boolean; exclusive: boolean; reason: string }> {
  // Check minimum score
  if (score.total < client.minScore) {
    return { match: false, exclusive: false, reason: `Score ${score.total} below minimum ${client.minScore}` };
  }

  // Check state licenses
  const licenses: string[] = JSON.parse(client.stateLicenses || "[]");
  if (licenses.length > 0 && !licenses.includes(lead.state)) {
    return { match: false, exclusive: false, reason: `Not licensed in ${lead.state}` };
  }

  // Check coverage types
  const coverageTypes: string[] = JSON.parse(client.coverageTypes || "[]");
  if (coverageTypes.length > 0 && !coverageTypes.includes(lead.coverageInterest)) {
    return { match: false, exclusive: false, reason: `Coverage ${lead.coverageInterest} not wanted` };
  }

  // Check daily cap
  const dailyResult = await getClientDailyPurchaseCount(client.clientId);
  if (dailyResult.ok && dailyResult.value >= client.dailyCap) {
    return { match: false, exclusive: false, reason: "Daily cap reached" };
  }

  // Check monthly cap
  const monthlyResult = await getClientMonthlyPurchaseCount(client.clientId);
  if (monthlyResult.ok && monthlyResult.value >= client.monthlyCap) {
    return { match: false, exclusive: false, reason: "Monthly cap reached" };
  }

  // Check client-specific filters
  const filtersResult = await getClientFilters(client.clientId);
  let exclusive = false;

  if (filtersResult.ok && filtersResult.value) {
    const filters = filtersResult.value;

    // State filter
    const filterStates: string[] = JSON.parse(filters.states || "[]");
    if (filterStates.length > 0 && !filterStates.includes(lead.state)) {
      return { match: false, exclusive: false, reason: `State ${lead.state} not in filter` };
    }

    // Coverage filter
    const filterCoverage: string[] = JSON.parse(filters.coverageTypes || "[]");
    if (filterCoverage.length > 0 && !filterCoverage.includes(lead.coverageInterest)) {
      return { match: false, exclusive: false, reason: `Coverage not in filter` };
    }

    // Veteran-only filter
    if (filters.veteranOnly && lead.veteranStatus !== "veteran") {
      return { match: false, exclusive: false, reason: "Veteran-only filter" };
    }

    // Min score filter (may be more restrictive than client-level)
    if (score.total < filters.minScore) {
      return { match: false, exclusive: false, reason: `Score below filter minimum ${filters.minScore}` };
    }

    // Lead age filter
    const ageHours = (Date.now() - new Date(lead.createdAt).getTime()) / (1000 * 60 * 60);
    if (ageHours > filters.maxLeadAge) {
      return { match: false, exclusive: false, reason: "Lead too old" };
    }

    exclusive = filters.distributionMode === "exclusive";
  }

  return { match: true, exclusive, reason: "" };
}

async function executePurchase(
  client: ClientRecord,
  lead: LeadRecord,
  exclusive: boolean
): Promise<{ clientId: string; purchaseId: string; exclusive: boolean } | null> {
  const price = exclusive ? client.exclusivePrice : client.pricePerLead;

  // Create return deadline (72 hours from now)
  const returnDeadline = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();

  const purchase: LeadPurchase = {
    purchaseId: generatePurchaseId(),
    leadId: lead.leadId,
    clientId: client.clientId,
    pricePaid: price,
    purchasedAt: new Date().toISOString(),
    status: "delivered",
    exclusive,
    returnReason: "",
    returnDeadline,
  };

  const result = await createPurchase(purchase);
  if (!result.ok) return null;

  return { clientId: client.clientId, purchaseId: purchase.purchaseId, exclusive };
}
