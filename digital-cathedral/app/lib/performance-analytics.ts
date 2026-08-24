import { getFilteredLeads, getLeadById, type LeadRecord } from "./database";
import { getAllPurchases, getPurchasesByClient, type LeadPurchase } from "./client-database";
import { AGENT_STATUSES, getLeadOperations, type LeadOperations } from "./lead-operations";

export type PerformanceSnapshot = ReturnType<typeof summarizePerformance>;

const monthStart = () => new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
const countBy = (values: string[]) => values.reduce<Record<string, number>>((out, value) => {
  const key = value || "Not provided";
  out[key] = (out[key] || 0) + 1;
  return out;
}, {});
const eventCount = (operations: LeadOperations[], type: string) => operations.reduce((total, op) => total + op.activity.filter(event => event.eventType === type).length, 0);

function summarizePerformance(leads: LeadRecord[], purchases: LeadPurchase[], operations: LeadOperations[]) {
  const now = new Date();
  const start = monthStart();
  const monthPurchases = purchases.filter(p => new Date(p.purchasedAt) >= start);
  const delivered = purchases.filter(p => p.status === "delivered");
  const monthDelivered = monthPurchases.filter(p => p.status === "delivered");
  const stageCounts = Object.fromEntries(AGENT_STATUSES.map(status => [status, 0])) as Record<string, number>;
  operations.forEach(op => { stageCounts[op.status] = (stageCounts[op.status] || 0) + 1; });
  const firstActionMinutes = operations.flatMap((op, index) => {
    const purchasedAt = purchases.find(p => p.leadId === leads[index]?.leadId)?.purchasedAt;
    const action = op.activity.filter(event => event.actorRole === "agent").at(-1)?.createdAt;
    return purchasedAt && action ? [Math.max(0, (new Date(action).getTime() - new Date(purchasedAt).getTime()) / 60000)] : [];
  });
  const dueToday = operations.filter(op => op.nextFollowUpAt && new Date(op.nextFollowUpAt).toDateString() === now.toDateString()).length;
  const overdue = operations.filter(op => op.nextFollowUpAt && new Date(op.nextFollowUpAt) < now).length;
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
    notContacted: operations.filter(op => !op.lastContactedAt).length,
    appointments: operations.filter(op => op.appointmentAt).length,
    followUps: { dueToday, overdue, scheduled: operations.filter(op => op.nextFollowUpAt).length, noNextStep: operations.filter(op => !op.nextFollowUpAt && !["Won", "Lost", "Do Not Contact"].includes(op.status)).length },
    pipeline: stageCounts,
    activity: {
      calls: eventCount(operations, "call_clicked"), texts: eventCount(operations, "text_clicked"), emails: eventCount(operations, "email_clicked"),
      notes: eventCount(operations, "note_added"), followUpsSet: eventCount(operations, "follow_up_set"), appointmentsCreated: eventCount(operations, "appointment_set"), statusesUpdated: eventCount(operations, "status_changed"),
    },
    breakdowns: {
      source: countBy(leads.map(lead => lead.utmSource || (lead.latticeSrc ? "Lattice" : "Direct / unknown"))),
      campaign: countBy(leads.map(lead => lead.utmCampaign || "Not attributed")),
      sourcePage: countBy(leads.map(lead => lead.latticeFrom || lead.consentPageUrl || "Not attributed")),
      lifeChapter: countBy(leads.map(lead => lead.purchaseIntent || "Not provided")),
      coverage: countBy(leads.map(lead => lead.coverageInterest)), state: countBy(leads.map(lead => lead.state)),
    },
  };
}

async function withOperations(leads: LeadRecord[]) {
  return Promise.all(leads.map(lead => getLeadOperations(lead.leadId, false)));
}

export async function getAdminPerformanceSnapshot() {
  const [leadResult, purchaseResult] = await Promise.all([getFilteredLeads({ limit: 5000 }), getAllPurchases(5000)]);
  const leads = leadResult.ok ? leadResult.value.leads : [];
  const purchases = purchaseResult.ok ? purchaseResult.value.purchases : [];
  return summarizePerformance(leads, purchases, await withOperations(leads));
}

export async function getAgentPerformanceSnapshot(clientId: string) {
  const purchaseResult = await getPurchasesByClient(clientId, 5000);
  const purchases = purchaseResult.ok ? purchaseResult.value.purchases : [];
  const leadResults = await Promise.all(purchases.map(purchase => getLeadById(purchase.leadId)));
  const leads = leadResults.flatMap(result => result.ok && result.value ? [result.value] : []);
  return summarizePerformance(leads, purchases, await withOperations(leads));
}
