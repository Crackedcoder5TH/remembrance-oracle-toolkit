import { getFilteredLeads, getLeadsByIds, type LeadRecord } from "./database";
import { getAllPurchases, getPurchasesByClient, type LeadPurchase } from "./client-database";
import { AGENT_STATUSES, getOperationsDataset, type OperationsDataset } from "./lead-operations";

export type PerformanceSnapshot = ReturnType<typeof summarizePerformance>;

const monthStart = () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
const countBy = (values: string[]) => values.reduce<Record<string, number>>((out, value) => {
  const key = value || "Not provided";
  out[key] = (out[key] || 0) + 1;
  return out;
}, {});

function summarizePerformance(leads: LeadRecord[], purchases: LeadPurchase[], dataset: OperationsDataset) {
  const now = new Date();
  const start = monthStart();
  const monthPurchases = purchases.filter(p => new Date(p.purchasedAt) >= start);
  const delivered = purchases.filter(p => p.status === "delivered");
  const monthDelivered = monthPurchases.filter(p => p.status === "delivered");

  // Pipeline / activity / appointment / follow-up metrics come from the bulk
  // operations dataset — a fixed set of aggregate queries, not a per-lead read
  // fan-out. Only leads that have an operations row are counted, so unworked
  // inventory no longer inflates the "New" stage.
  const stageCounts = Object.fromEntries(AGENT_STATUSES.map(status => [status, 0])) as Record<string, number>;
  dataset.ops.forEach(op => { stageCounts[op.status] = (stageCounts[op.status] || 0) + 1; });
  const dueToday = dataset.ops.filter(op => op.nextFollowUpAt && new Date(op.nextFollowUpAt).toDateString() === now.toDateString()).length;
  const overdue = dataset.ops.filter(op => op.nextFollowUpAt && new Date(op.nextFollowUpAt) < now).length;
  const ev = (type: string) => dataset.activityCounts[type] || 0;

  // Speed-to-lead and not-contacted are scoped to PURCHASED leads only, so
  // unsold inventory (which trivially has no contact) never inflates them.
  const contactedByLead = new Map(dataset.ops.map(op => [op.leadId, op.lastContactedAt]));
  const purchasedAtByLead = new Map(purchases.map(p => [p.leadId, p.purchasedAt]));
  const purchasedLeadIds = [...purchasedAtByLead.keys()];
  const notContacted = purchasedLeadIds.filter(id => !contactedByLead.get(id)).length;
  const firstActionMinutes = purchasedLeadIds.flatMap(id => {
    const purchasedAt = purchasedAtByLead.get(id);
    const action = dataset.firstAgentActionByLead[id];
    return purchasedAt && action ? [Math.max(0, (new Date(action).getTime() - new Date(purchasedAt).getTime()) / 60000)] : [];
  });

  return {
    leads: leads.length,
    purchasedThisMonth: monthPurchases.length,
    deliveredThisMonth: monthDelivered.length,
    revenueThisMonth: monthDelivered.reduce((sum, p) => sum + p.pricePaid, 0),
    totalRevenue: delivered.reduce((sum, p) => sum + p.pricePaid, 0),
    averageLeadPrice: delivered.length ? Math.round(delivered.reduce((sum, p) => sum + p.pricePaid, 0) / delivered.length) : null,
    disputes: purchases.filter(p => p.status === "disputed").length,
    refunds: purchases.filter(p => p.status === "returned").length,
    averageFirstActionMinutes: firstActionMinutes.length ? Math.round(firstActionMinutes.reduce((a, b) => a + b, 0) / firstActionMinutes.length) : null,
    notContacted,
    appointments: dataset.ops.filter(op => op.appointmentAt).length,
    followUps: {
      dueToday,
      overdue,
      scheduled: dataset.ops.filter(op => op.nextFollowUpAt).length,
      noNextStep: dataset.ops.filter(op => !op.nextFollowUpAt && !["Won", "Lost", "Do Not Contact"].includes(op.status)).length,
    },
    pipeline: stageCounts,
    activity: {
      calls: ev("call_clicked"), texts: ev("text_clicked"), emails: ev("email_clicked"),
      notes: ev("note_added"), followUpsSet: ev("follow_up_set"), appointmentsCreated: ev("appointment_set"), statusesUpdated: ev("status_changed"),
    },
    breakdowns: {
      source: countBy(leads.map(lead => lead.utmSource || (lead.latticeSrc ? "Lattice" : "Direct / unknown"))),
      campaign: countBy(leads.map(lead => lead.utmCampaign || "Not attributed")),
      sourcePage: countBy(leads.map(lead => lead.latticeFrom || lead.consentPageUrl || "Not attributed")),
      lifeChapter: countBy(leads.map(lead => lead.purchaseIntent || "Not provided")),
      coverage: countBy(leads.map(lead => lead.coverageInterest)),
      state: countBy(leads.map(lead => lead.state)),
    },
  };
}

export async function getAdminPerformanceSnapshot() {
  const [leadResult, purchaseResult, dataset] = await Promise.all([
    getFilteredLeads({ limit: 5000 }),
    getAllPurchases(5000),
    getOperationsDataset(), // store-wide operations snapshot (bulk, not per-lead)
  ]);
  const leads = leadResult.ok ? leadResult.value.leads : [];
  const purchases = purchaseResult.ok ? purchaseResult.value.purchases : [];
  return summarizePerformance(leads, purchases, dataset);
}

export async function getAgentPerformanceSnapshot(clientId: string) {
  const purchaseResult = await getPurchasesByClient(clientId, 5000);
  const purchases = purchaseResult.ok ? purchaseResult.value.purchases : [];
  const leadIds = [...new Set(purchases.map(p => p.leadId))];
  const [leadResult, dataset] = await Promise.all([
    getLeadsByIds(leadIds),
    getOperationsDataset(leadIds), // scoped to this agent's purchased leads
  ]);
  const leads = leadResult.ok ? leadResult.value : [];
  return summarizePerformance(leads, purchases, dataset);
}
