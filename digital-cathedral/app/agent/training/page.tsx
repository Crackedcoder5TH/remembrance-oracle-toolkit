"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Panel, PortalShell } from "../../components/portal-shell";
import { trainingModules } from "../../lib/portal-training-content";

const filters = ["All", "New Parents", "Homeowners", "Employer Coverage", "Protecting Spouse / Income", "Final Expense", "Retirement & Legacy", "Veterans & Military Families", "Coverage Basics", "Objection Handling", "Follow-Up", "Compliance"];

export default function TrainingLibraryPage() {
  const router = useRouter();
  const [ready,setReady] = useState(false); const [query,setQuery] = useState(""); const [filter,setFilter] = useState("All");
  useEffect(()=>{fetch("/api/portal/session",{cache:"no-store"}).then(response=>{if(!response.ok) throw new Error(); setReady(true)}).catch(()=>router.replace("/portal/login"))},[router]);
  const modules = useMemo(()=>trainingModules.filter(module=>{
    const haystack = [module.title,module.category,module.summary,module.bestUsedWhen,...module.tags,...module.scripts.map(script=>script.text),...module.sections.flatMap(section=>[section.heading,section.body??"",...(section.bullets??[])])].join(" ").toLowerCase();
    const categoryMatch = filter === "All" || module.category === filter || (filter === "Homeowners" && module.tags.includes("mortgage-protection")) || (filter === "Protecting Spouse / Income" && module.slug === "life-chapter-openers");
    return categoryMatch && haystack.includes(query.trim().toLowerCase());
  }),[query,filter]);
  if(!ready) return <main className="grid min-h-screen place-items-center bg-[#f4efe5] text-sm text-[#776e61]">Opening your training library…</main>;
  return <PortalShell role="agent" eyebrow="The Golden Standard" title="Scripts & Training Library" description="Practical talk tracks, follow-up templates, objection handling, and life-chapter guidance to help you serve leads with clarity, confidence, and care.">
    <Panel title="What do I say to this lead right now?"><label htmlFor="training-search" className="text-xs font-bold uppercase tracking-[0.12em] text-[#776e61]">Quick search</label><input id="training-search" value={query} onChange={event=>setQuery(event.target.value)} placeholder="Search life chapter, objection, stage, channel, or keyword" className="mt-2 w-full rounded-xl border border-[#e2d9c9] bg-white px-4 py-3 text-sm outline-none focus:border-[#c9a75f]"/><div className="mt-4 flex gap-2 overflow-x-auto pb-2" aria-label="Training category filters">{filters.map(item=><button key={item} onClick={()=>setFilter(item)} className={`whitespace-nowrap rounded-full border px-3 py-2 text-xs font-semibold ${filter===item?"border-[#176b65] bg-[#176b65] text-white":"border-[#e2d9c9] bg-[#faf8f3] text-[#62594e]"}`}>{item}</button>)}</div></Panel>
    <section className="mt-6"><div className="mb-3 flex items-end justify-between"><div><p className="text-xs font-bold uppercase tracking-[0.12em] text-[#94732e]">Featured modules</p><h2 className="mt-1 font-serif text-2xl">Guidance for every conversation</h2></div><span className="text-xs text-[#8a8175]">{modules.length} module{modules.length===1?"":"s"}</span></div>
      {modules.length?<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{modules.map(module=><Link href={`/agent/training/${module.slug}`} key={module.slug} className="group rounded-2xl border border-[#e2d9c9] bg-white p-5 shadow-[0_8px_30px_rgba(39,32,20,0.04)] transition hover:-translate-y-0.5 hover:border-[#c9a75f]"><div className="flex items-start justify-between gap-3"><span className="rounded-full bg-[#f4efe5] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[#776e61]">{module.category}</span>{module.complianceSensitive&&<span className="text-[10px] font-bold uppercase tracking-wide text-[#94732e]">Compliance-sensitive</span>}</div><h3 className="mt-4 font-serif text-xl group-hover:text-[#176b65]">{module.title}</h3><p className="mt-2 text-sm leading-6 text-[#776e61]">{module.summary}</p><div className="mt-4 flex flex-wrap gap-1.5">{module.tags.slice(0,4).map(tag=><span key={tag} className="text-[10px] text-[#8a8175]">#{tag}</span>)}</div><span className="mt-5 block text-xs font-bold text-[#176b65]">Open module →</span></Link>)}</div>:<div className="rounded-2xl border border-dashed border-[#d9cfbd] bg-white p-8 text-center text-sm text-[#776e61]">No modules match those filters. Try a broader keyword or choose All.</div>}
    </section>
    <div className="mt-6"><Panel title="Recently used & favorites"><p className="text-sm leading-6 text-[#776e61]">Personal history and favorites are not stored yet. Use search and tags to find modules now; progress tracking can be added in a future phase without showing invented activity.</p></Panel></div>
  </PortalShell>;
}
