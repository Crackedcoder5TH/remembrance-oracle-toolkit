"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { MetricCard, Panel, PortalShell } from "../../components/portal-shell";

type Lead = { leadId: string; firstName: string; lastName: string; coverageInterest: string; state: string; createdAt: string };
type User = { firstName: string };

export default function AgentDailyHub() {
  const router = useRouter();
  const [user, setUser] = useState<User | null>(null);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => { fetch("/api/portal/session").then(async r => { if (!r.ok) throw new Error(); const data = await r.json(); setUser(data.user); setLeads(data.leads ?? []); }).catch(() => router.replace("/portal/login")).finally(() => setLoading(false)); }, [router]);
  if (loading || !user) return <main className="grid min-h-screen place-items-center bg-[#171714] text-sm text-[#d8d0c3]">Preparing your daily workspace…</main>;
  const pipeline = ["New", "Contacted", "Follow-Up", "Appointment Set", "Application Started", "Submitted", "Won", "Lost"];
  return <PortalShell role="agent" eyebrow="Daily work hub" title={`Good to see you, ${user.firstName}`} description="Start with the freshest opportunity, complete today’s follow-ups, and keep every lead moving forward.">
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"><MetricCard label="New purchased leads" value={leads.length} note="Ready for first contact" urgent={leads.length > 0}/><MetricCard label="Not contacted" value={leads.length ? "—" : 0} note={leads.length ? "Contact events needed" : "You are caught up"}/><MetricCard label="Follow-ups today" value="—" note="Task data needed"/><MetricCard label="Appointments today" value="—" note="Calendar data needed"/><MetricCard label="Credits available" value="—" note="Credit balance needed"/><MetricCard label="Month purchases" value="—" note="Purchase rollup needed"/><MetricCard label="Estimated ROI" value="—" note="Available after outcome tracking"/></div>
    <div className="mt-5 grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Panel title="Today’s priority leads" action={<Link href="/agent/leads" className="text-xs font-bold text-[#94732e]">View all →</Link>}>{leads.length ? <div className="space-y-2">{leads.slice(0,4).map((lead,i) => <div key={lead.leadId} className="flex items-center justify-between gap-3 rounded-xl border border-[#e8e0d2] p-4"><div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded-full bg-amber-100 px-2 py-1 text-[10px] font-bold uppercase text-amber-800">Priority {i+1}</span><strong className="truncate text-sm">{lead.firstName} {lead.lastName}</strong></div><p className="mt-2 text-xs text-[#776e61]">{lead.state} · {lead.coverageInterest || "Coverage guidance"} · {new Date(lead.createdAt).toLocaleDateString()}</p></div><button className="rounded-full bg-[#211d18] px-4 py-2 text-xs font-bold text-white">Open</button></div>)}</div> : <div className="rounded-xl border border-dashed border-[#d9cfbd] bg-[#faf8f3] p-7 text-center"><h3 className="font-serif text-lg">Your lead queue is ready when you are.</h3><p className="mx-auto mt-2 max-w-md text-sm leading-6 text-[#776e61]">You do not have any leads yet. Visit the marketplace to find leads that match your licensed states and focus areas.</p><Link href="/portal/marketplace" className="mt-4 inline-block rounded-full bg-[#c9a75f] px-5 py-2.5 text-xs font-bold">Browse leads</Link></div>}</Panel>
      <Panel title="Quick actions"><div className="grid grid-cols-2 gap-2">{[["Buy Leads","/portal/marketplace"],["Open My Leads","/agent/leads"],["View Scripts","/agent/training"],["Add Appointment","/agent/tasks"],["Contact Support","/agent/support"]].map(([label,href]) => <Link key={label} href={href} className="rounded-xl border border-[#e2d9c9] p-3 text-sm font-semibold hover:border-[#c9a75f] hover:bg-[#faf7f0]">{label}<span className="mt-2 block text-[#b18a38]">→</span></Link>)}</div></Panel>
      <div className="xl:col-span-2"><Panel title="My pipeline"><div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:grid-cols-8">{pipeline.map((stage,i) => <div key={stage} className="rounded-xl bg-[#f6f1e8] p-3"><span className="text-[10px] font-bold uppercase tracking-wide text-[#857b6d]">{stage}</span><p className="mt-3 font-serif text-2xl">{i === 0 ? leads.length : "—"}</p></div>)}</div></Panel></div>
      <div className="xl:col-span-2"><Panel title="Golden Standard tip"><blockquote className="border-l-2 border-[#c9a75f] pl-5 text-sm leading-7 text-[#62594e]">Speed matters, but clarity earns trust. Open by acknowledging the consumer’s life chapter, confirm why they asked for guidance, and agree on the next useful step.</blockquote></Panel></div>
    </div>
  </PortalShell>;
}
