"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Panel, PortalShell } from "../../components/portal-shell";

type State = { internalAppointments: boolean; calendarExport: boolean; externalCalendar: boolean; emailSending: boolean; smsAutomation: boolean; billingPortal: boolean; billingPortalUrl: string | null };

export default function AgentIntegrations() {
  const [data, setData] = useState<State | null>(null);
  useEffect(() => { fetch("/api/client/integrations", { cache: "no-store" }).then((r) => { if (r.status === 401) location.href = "/portal/login"; return r.json(); }).then(setData); }, []);
  return <PortalShell role="agent" eyebrow="Account" title="Integrations & preferences" description="See which tools are available and choose safe, agent-controlled ways to manage follow-ups and appointments.">
    {!data ? <p className="text-sm text-[#8a8175]">Checking available tools…</p> : <div className="grid gap-4 md:grid-cols-2">
      <Panel title="Calendar"><Status active={data.internalAppointments} label="Internal appointment tracking: active"/><Status active={data.calendarExport} label="Calendar export: available"/><Status active={data.externalCalendar} label="External calendar sync: not connected"/><p className="mt-4 text-sm text-[#8a8175]">Google Calendar connection is not enabled yet. Export an authorized appointment from its lead page instead.</p></Panel>
      <Panel title="Email"><Status active={data.emailSending} label="Automated sending: not configured"/><p className="mt-4 text-sm text-[#8a8175]">Email sending is not configured. Use copy templates or mailto actions for now.</p></Panel>
      <Panel title="SMS & calls"><Status active={data.smsAutomation} label="SMS automation: not configured"/><p className="mt-4 text-sm text-[#8a8175]">Manual text and call actions are available for authorized leads. Respect opt-outs at all times.</p></Panel>
      <Panel title="Reminders & notifications"><Status active label="Internal follow-up and appointment reminders: available"/><p className="mt-4 text-sm text-[#8a8175]">Reminders are derived from your own purchased leads; persisted read/unread preferences are planned.</p><Link href="/agent/notifications" className="mt-4 inline-flex text-sm font-semibold text-[#176b65]">Open notifications →</Link></Panel>
      <Panel title="Billing portal"><Status active={data.billingPortal} label={data.billingPortal ? "Customer portal: configured" : "Stripe Customer Portal is not configured yet."}/>{data.billingPortal && data.billingPortalUrl ? <a href={data.billingPortalUrl} className="mt-4 inline-flex rounded-lg bg-[#176b65] px-4 py-2 text-sm font-semibold text-white">Manage billing</a> : <Link href="/agent/billing" className="mt-4 inline-flex text-sm font-semibold text-[#176b65]">View billing →</Link>}</Panel>
      <Panel title="Preferences"><p className="text-sm leading-6 text-[#8a8175]">Editable delivery channels, appointment reminders, and follow-up reminder timing require persisted preference support and are planned for a future phase.</p></Panel>
    </div>}
  </PortalShell>;
}

function Status({ active, label }: { active: boolean; label: string }) { return <p className="mt-2 flex items-center gap-2 text-sm"><span className={`h-2 w-2 rounded-full ${active ? "bg-emerald-500" : "bg-[#c9a75f]"}`}/>{label}</p>; }
