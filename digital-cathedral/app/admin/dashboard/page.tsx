"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MetricCard, Panel, PortalShell } from "../../components/portal-shell";

type AdminStats = { today: number; total: number; thisWeek: number; thisMonth: number; byState?: Record<string, number>; byCoverage?: Record<string, number>; bySource?: { human: number; agent: number; lattice: number } };

export default function AdminCommandCenter() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [pendingAgents, setPendingAgents] = useState(0);
  const [integrationIssues, setIntegrationIssues] = useState<number | string>("—");
  useEffect(() => { Promise.all([fetch("/api/admin/stats"), fetch("/api/admin/revenue")]).then(async ([s, r]) => { if (s.ok) setStats((await s.json()).stats); if (r.ok) setPendingAgents((await r.json())?.stats?.pendingClients ?? 0); }); }, []);
  useEffect(() => { fetch("/api/admin/integrations").then(async (response) => { if (!response.ok) return; const data = await response.json(); setIntegrationIssues([!data.stripe.checkoutConfigured, !data.stripe.webhookConfigured, !data.email.configured, !data.sms.configured, !data.webhooks.configured].filter(Boolean).length); }); }, []);
  const topStates = Object.entries(stats?.byState ?? {}).sort((a,b) => b[1]-a[1]).slice(0,4);
  return <PortalShell role="admin" eyebrow="Command center" title="Business health at a glance" description="Monitor lead speed, revenue activity, agent readiness, and compliance pressure from one focused workspace.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="New leads today" value={stats?.today ?? "—"} note="Live lead intake"/><MetricCard label="Integration issues" value={integrationIssues} note="Missing provider or webhook configuration" urgent={typeof integrationIssues === "number" && integrationIssues > 0}/><MetricCard label="Webhook failures" value="—" note="Delivery attempts are not persisted"/><MetricCard label="Automation alerts" value="—" note="Run history is not persisted"/><MetricCard label="Pending approvals" value={pendingAgents} note="Agent applications" urgent={pendingAgents > 0}/><MetricCard label="Compliance alerts" value="—" note="Consent flag rollup needed"/><MetricCard label="Open disputes" value="—" note="Dispute status rollup needed"/></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <Panel title="Urgent attention" action={<div className="flex gap-3"><Link href="/admin/analytics" className="text-xs font-bold text-[#176b65]">View Analytics →</Link><Link href="/admin/integrations" className="text-xs font-bold text-[#94732e]">Open integrations →</Link></div>}><Empty text="Integration readiness is measured from server configuration. Durable webhook failures and notification delivery alerts will appear when event-attempt persistence is introduced."/></Panel>
      <Panel title="Lead flow"><div className="space-y-3">{topStates.length ? topStates.map(([state,count]) => <div key={state} className="flex items-center gap-3"><span className="w-8 text-sm font-bold">{state}</span><div className="h-2 flex-1 overflow-hidden rounded-full bg-[#eee7da]"><div className="h-full rounded-full bg-[#c9a75f]" style={{width:`${Math.max(8, count / Math.max(...topStates.map(([,n])=>n)) * 100)}%`}}/></div><span className="w-8 text-right text-sm">{count}</span></div>) : <Empty text="Lead flow will populate as lead intake data becomes available."/>}</div></Panel>
      <Panel title="Revenue snapshot"><Empty text="Connect sales, subscriptions, credit purchases, refunds, and chargebacks to show net revenue here."/></Panel>
      <Panel title="Agent performance"><Empty text="Contact events and outcome tracking are needed to surface fast responders, inactive agents, and conversion activity."/></Panel>
      <div className="xl:col-span-2"><Panel title="Compliance watch"><div className="grid gap-3 sm:grid-cols-3"><Status label="Consent gaps"/><Status label="Opt-outs & DNC"/><Status label="Deletion requests"/></div></Panel></div>
    </div>
  </PortalShell>;
}

function Empty({ text }: { text: string }) { return <div className="rounded-xl border border-dashed border-[#d9cfbd] bg-[#faf8f3] p-5 text-sm leading-6 text-[#776e61]">{text}</div>; }
function Status({ label }: { label: string }) { return <div className="flex items-center justify-between rounded-xl bg-[#f7f3eb] p-4"><span className="text-sm font-semibold">{label}</span><span className="text-xs text-[#857b6d]">Awaiting data</span></div>; }
