"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { MetricCard, Panel, PortalShell } from "../../components/portal-shell";
import type { PerformanceSnapshot } from "../../lib/performance-analytics";

const money=(cents:number)=>new Intl.NumberFormat("en-US",{style:"currency",currency:"USD"}).format(cents/100);
export default function AgentPerformance() {
  const [data,setData]=useState<PerformanceSnapshot|null>(null); const [credits,setCredits]=useState<number|null>(null);
  useEffect(()=>{fetch("/api/agent/performance").then(r=>r.ok?r.json():Promise.reject()).then(body=>{setData(body.analytics);setCredits(body.creditsAvailable)}).catch(()=>setData(null));},[]);
  return <PortalShell role="agent" eyebrow="Agent Performance" title="My Performance" description="Track your lead activity, follow-ups, appointments, and progress so you can work leads with more consistency.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="Purchased leads this month" value={data?.purchasedThisMonth??"—"} note="Your completed and returned purchases"/><MetricCard label="New leads not contacted" value={data?.notContacted??"—"} note="No marked contact yet" urgent={Boolean(data?.notContacted)}/><MetricCard label="Follow-ups due" value={data?.followUps.dueToday??"—"} note="Due today"/><MetricCard label="Appointments set" value={data?.appointments??"—"} note="Current appointment records"/><MetricCard label="Applications started" value={data?.pipeline["Application Started"]??"—"} note="Current pipeline stage"/><MetricCard label="Won / closed" value={data?.pipeline.Won??"—"} note="Current pipeline stage"/><MetricCard label="Average first-action time" value={data?.averageFirstActionMinutes==null?"—":`${data.averageFirstActionMinutes} min`} note="After purchase"/><MetricCard label="Credits available" value={credits==null?"—":money(credits)} note="Persisted account balance"/></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-2">
      <Panel title="My Pipeline"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{["New","Contacted","Follow-Up","Appointment Set","Application Started","Submitted","Won","Lost"].map(stage=><div key={stage} className="rounded-xl bg-[#f6f1e8] p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-[#776e61]">{stage}</span><p className="mt-2 font-serif text-2xl">{data?.pipeline[stage]??"—"}</p></div>)}</div></Panel>
      <Panel title="My Activity"><Rows values={data?.activity}/><p className="mt-3 text-xs text-[#8a8175]">Call, text, and email clicks are contact attempts; they are not treated as successful contact.</p></Panel>
      <Panel title="Follow-Up Discipline"><Rows values={data?.followUps}/></Panel>
      <Panel title="Lead Source / Life Chapter Breakdown"><Breakdown label="Life chapter" values={data?.breakdowns.lifeChapter}/><Breakdown label="State" values={data?.breakdowns.state}/><Breakdown label="Coverage" values={data?.breakdowns.coverage}/></Panel>
      <Panel title="Spend & ROI"><Rows values={{leadsPurchasedThisMonth:data?.purchasedThisMonth??"—",amountSpentThisMonth:data?money(data.revenueThisMonth):"—",averageCostPerLead:data?.averageLeadPrice==null?"—":money(data.averageLeadPrice),refundsOrDisputes:(data?.refunds??0)+(data?.disputes??0)}}/><p className="mt-3 rounded-xl border border-dashed border-[#d9cfbd] bg-[#faf8f3] p-4 text-sm leading-6 text-[#776e61]">Closed revenue tracking is not enabled yet, so ROI is not calculated. You can still use activity and appointment metrics to measure consistency.</p></Panel>
      <Panel title="Training Progress" action={<Link href="/agent/training" className="text-xs font-bold text-[#94732e]">Visit Scripts & Training →</Link>}><p className="rounded-xl border border-dashed border-[#d9cfbd] bg-[#faf8f3] p-4 text-sm leading-6 text-[#776e61]">Training progress tracking is not enabled yet. Visit Scripts & Training to review resources.</p></Panel>
    </div>
  </PortalShell>;
}
function Rows({values}:{values?:Record<string,string|number>}) { return <div className="divide-y divide-[#eee7da]">{Object.entries(values??{}).map(([label,value])=><div key={label} className="flex justify-between gap-3 py-3 text-sm"><span className="capitalize text-[#776e61]">{label.replace(/([A-Z])/g," $1")}</span><strong>{value}</strong></div>)}</div>; }
function Breakdown({label,values}:{label:string;values?:Record<string,number>}) { return <div className="mb-4"><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-[#776e61]">{label}</h3>{Object.entries(values??{}).sort((a,b)=>b[1]-a[1]).slice(0,4).map(([name,count])=><div key={name} className="mb-2 flex justify-between rounded-lg bg-[#f7f3eb] px-3 py-2 text-sm"><span>{name}</span><strong>{count}</strong></div>)}</div>; }
