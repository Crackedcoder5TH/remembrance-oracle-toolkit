"use client";

import { useEffect, useState } from "react";
import { MetricCard, Panel, PortalShell } from "../../components/portal-shell";
import type { PerformanceSnapshot } from "../../lib/performance-analytics";

const money = (cents: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
const duration = (minutes: number | null) => minutes === null ? "—" : minutes < 60 ? `${minutes} min` : `${(minutes / 60).toFixed(1)} hr`;

export default function AdminAnalytics() {
  const [data, setData] = useState<PerformanceSnapshot | null>(null);
  useEffect(() => { fetch("/api/admin/analytics").then(r => r.ok ? r.json() : Promise.reject()).then(body => setData(body.analytics)).catch(() => setData(null)); }, []);
  const pipeline = data?.pipeline ?? {};
  return <PortalShell role="admin" eyebrow="Business Intelligence" title="Analytics & Reporting" description="Track lead flow, revenue, agent activity, compliance signals, and conversion trends across Valor Legacies operations.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <MetricCard label="Leads in reporting set" value={data?.leads ?? "—"} note="Persisted lead records"/><MetricCard label="Leads sold this month" value={data?.deliveredThisMonth ?? "—"} note="Completed deliveries only"/><MetricCard label="Revenue this month" value={data ? money(data.revenueThisMonth) : "—"} note={data?.deliveredThisMonth ? "Completed purchases" : "Revenue appears after completed purchases."}/><MetricCard label="Average first-action time" value={duration(data?.averageFirstActionMinutes ?? null)} note="Agent activity after purchase"/>
      <MetricCard label="Appointments set" value={data?.appointments ?? "—"} note="Current appointment records"/><MetricCard label="Open disputes" value={data?.disputes ?? "—"} note="Purchase disputes" urgent={Boolean(data?.disputes)}/><MetricCard label="DNC leads" value={pipeline["Do Not Contact"] ?? "—"} note="Current pipeline status" urgent={Boolean(pipeline["Do Not Contact"])}/><MetricCard label="Not contacted" value={data?.notContacted ?? "—"} note="Purchased leads without marked contact" urgent={Boolean(data?.notContacted)}/>
    </div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <Panel title="Reporting filters"><div className="grid gap-3 sm:grid-cols-3"><Select label="Date range" options={["All available data","Today","Last 7 days","Last 30 days","This month"]}/><Select label="Source" options={["All sources",...Object.keys(data?.breakdowns.source ?? {})]}/><Select label="State" options={["All states",...Object.keys(data?.breakdowns.state ?? {})]}/></div><p className="mt-3 text-xs text-[#8a8175]">Additional persisted-data filters will be enabled with server-side date and status query support.</p></Panel>
      <Panel title="Revenue Snapshot"><StatRows rows={[["Revenue this month", data ? money(data.revenueThisMonth) : "—"],["Completed purchases", data?.deliveredThisMonth ?? "—"],["Average lead price", data?.averageLeadPrice == null ? "—" : money(data.averageLeadPrice)],["Refunds / returns", data?.refunds ?? "—"],["Disputes", data?.disputes ?? "—"]]}/>{data?.deliveredThisMonth === 0 && <Empty text="No completed purchases yet. Revenue reporting will appear after lead purchases are completed."/>}</Panel>
      <Panel title="Lead Flow"><Breakdown title="Lead source" values={data?.breakdowns.source}/><Breakdown title="Life chapter" values={data?.breakdowns.lifeChapter}/><Breakdown title="Coverage interest" values={data?.breakdowns.coverage}/><Breakdown title="State" values={data?.breakdowns.state}/></Panel>
      <Panel title="Lead Funnel"><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{Object.entries(pipeline).map(([stage,count]) => <div key={stage} className="rounded-xl bg-[#f6f1e8] p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-[#776e61]">{stage}</span><p className="mt-2 font-serif text-2xl">{count}</p></div>)}</div>{!data?.leads && <Empty text="Conversion reporting appears once leads move through pipeline stages."/>}</Panel>
      <Panel title="Speed to Lead"><StatRows rows={[["Average purchase to first action",duration(data?.averageFirstActionMinutes ?? null)],["No marked contact",data?.notContacted ?? "—"],["Overdue follow-ups",data?.followUps.overdue ?? "—"],["Follow-ups due today",data?.followUps.dueToday ?? "—"]]}/><p className="mt-3 text-xs leading-5 text-[#8a8175]">Clicks are counted as contact attempts, not successful contact. “Marked contacted” is reported from the explicit CRM status.</p></Panel>
      <Panel title="Agent Performance"><Empty text="System totals are live. Per-agent comparisons will appear when agent identity is consistently attached to purchase and activity records."/></Panel>
      <Panel title="Content & Campaign Performance"><Breakdown title="UTM campaign" values={data?.breakdowns.campaign}/><Breakdown title="Source / guide page" values={data?.breakdowns.sourcePage}/>{!Object.keys(data?.breakdowns.campaign ?? {}).some(k => k !== "Not attributed") && <Empty text="Guide attribution will appear when lead submissions include source page or campaign data."/>}</Panel>
      <Panel title="Reporting exports"><Empty text="Export controls can be added in a future reporting phase. Existing lead exports remain admin-gated and audit-controlled."/></Panel>
    </div>
  </PortalShell>;
}

function Select({label,options}:{label:string;options:string[]}) { return <label className="text-xs font-semibold text-[#776e61]">{label}<select disabled className="mt-1 w-full rounded-xl border border-[#e2d9c9] bg-[#faf8f3] px-3 py-2 text-sm text-[#211d18] disabled:opacity-70">{options.map(o=><option key={o}>{o}</option>)}</select></label>; }
function Empty({text}:{text:string}) { return <p className="mt-3 rounded-xl border border-dashed border-[#d9cfbd] bg-[#faf8f3] p-4 text-sm leading-6 text-[#776e61]">{text}</p>; }
function StatRows({rows}:{rows:[string,string|number][]}) { return <div className="divide-y divide-[#eee7da]">{rows.map(([label,value])=><div key={label} className="flex justify-between gap-4 py-3 text-sm"><span className="text-[#776e61]">{label}</span><strong>{value}</strong></div>)}</div>; }
function Breakdown({title,values}:{title:string;values?:Record<string,number>}) { const rows=Object.entries(values??{}).sort((a,b)=>b[1]-a[1]).slice(0,5); return <div className="mb-5"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#776e61]">{title}</h3>{rows.length?<div className="space-y-2">{rows.map(([label,count])=><div key={label} className="flex items-center justify-between rounded-lg bg-[#f7f3eb] px-3 py-2 text-sm"><span className="truncate">{label}</span><strong>{count}</strong></div>)}</div>:<Empty text="No attributed data is available yet."/>}</div>; }
