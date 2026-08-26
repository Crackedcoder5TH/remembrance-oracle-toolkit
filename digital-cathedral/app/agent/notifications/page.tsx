"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { MetricCard, Panel, PortalShell } from "../../components/portal-shell";

type Lead = { leadId: string; firstName?: string; lastName?: string; purchased: boolean; status?: string; nextFollowUpAt?: string | null; appointmentAt?: string | null; doNotContact?: boolean; disputeStatus?: string | null };
type Reminder = { type: string; title: string; message: string; href: string; urgent: boolean; at?: string };

export default function AgentNotifications() {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/client/leads?limit=100", { cache: "no-store" }).then((r) => { if (r.status === 401) location.href = "/portal/login"; return r.json(); }).then((d) => setLeads((d.leads ?? []).filter((lead: Lead) => lead.purchased))).finally(() => setLoading(false)); }, []);
  const reminders = useMemo(() => deriveReminders(leads), [leads]);
  const urgent = reminders.filter((item) => item.urgent).length;
  return <PortalShell role="agent" eyebrow="Daily work hub" title="Notifications" description="Real reminders derived from your authorized leads, appointments, follow-ups, compliance states, and disputes.">
    <div className="grid gap-3 sm:grid-cols-2"><MetricCard label="Active reminders" value={loading ? "—" : reminders.length} note="Derived from your purchased leads"/><MetricCard label="Needs attention" value={loading ? "—" : urgent} note="Due, overdue, DNC, or dispute items" urgent={urgent > 0}/></div>
    <div className="mt-5"><Panel title="Reminder center">{loading ? <p className="text-sm text-[#8a8175]">Loading reminders…</p> : reminders.length ? <div className="space-y-3">{reminders.map((item, index) => <Link href={item.href} key={`${item.type}-${item.href}-${index}`} className="block rounded-xl border border-[#e2d9c9] p-4 hover:border-[#c9a75f]"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-xs font-bold uppercase tracking-wide text-[#94732e]">{item.type}</p><h3 className="mt-1 font-serif text-lg">{item.title}</h3></div>{item.urgent && <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">Needs attention</span>}</div><p className="mt-2 text-sm text-[#8a8175]">{item.message}</p>{item.at && <p className="mt-2 text-xs text-[#776e61]">{new Date(item.at).toLocaleString()}</p>}</Link>)}</div> : <p className="rounded-xl border border-dashed border-[#d9cfbd] bg-[#faf8f3] p-6 text-sm text-[#8a8175]">No active notifications. Read/unread notification persistence is not enabled, so no unread count is shown.</p>}<p className="mt-4 text-xs leading-5 text-[#8a8175]">These reminders are generated from current records and are not a delivery log. Mark-as-read will be available when notification persistence is introduced.</p></Panel></div>
  </PortalShell>;
}

function deriveReminders(leads: Lead[]): Reminder[] {
  const now = Date.now(); const day = 86_400_000; const items: Reminder[] = [];
  for (const lead of leads) {
    const name = `${lead.firstName ?? "Lead"} ${lead.lastName ?? ""}`.trim(); const href = `/agent/leads/${lead.leadId}`;
    if (lead.doNotContact || lead.status === "Do Not Contact") items.push({ type: "Compliance", title: `${name} is Do Not Contact`, message: "Call, text, and email actions are blocked.", href, urgent: true });
    if (lead.disputeStatus) items.push({ type: "Dispute", title: `Dispute update for ${name}`, message: `Current dispute status: ${lead.disputeStatus}.`, href, urgent: true });
    if (lead.nextFollowUpAt) { const at = Date.parse(lead.nextFollowUpAt); if (at <= now + day) items.push({ type: "Follow-up", title: at < now ? `Follow-up overdue for ${name}` : `Follow-up due for ${name}`, message: "Open the lead to review the next step.", href, urgent: at < now, at: lead.nextFollowUpAt }); }
    if (lead.appointmentAt) { const at = Date.parse(lead.appointmentAt); if (at <= now + day && at >= now - day) items.push({ type: "Appointment", title: at < now ? `Appointment may be overdue for ${name}` : `Appointment today for ${name}`, message: "Open the authorized lead workspace for appointment details.", href, urgent: at < now, at: lead.appointmentAt }); }
  }
  return items.sort((a, b) => Number(b.urgent) - Number(a.urgent) || Date.parse(a.at ?? "9999") - Date.parse(b.at ?? "9999"));
}
