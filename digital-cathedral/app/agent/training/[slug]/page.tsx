"use client";
import Link from "next/link";
import { notFound, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CopyScriptButton } from "../../../components/copy-script-button";
import { Panel, PortalShell } from "../../../components/portal-shell";
import { getTrainingModule } from "../../../lib/portal-training-content";

export default function TrainingModulePage({params}:{params:{slug:string}}) {
  const router=useRouter(); const [ready,setReady]=useState(false); const module=getTrainingModule(params.slug);
  useEffect(()=>{fetch("/api/portal/session",{cache:"no-store"}).then(response=>{if(!response.ok)throw new Error();setReady(true)}).catch(()=>router.replace("/portal/login"))},[router]);
  if(!module) notFound();
  if(!ready) return <main className="grid min-h-screen place-items-center bg-[#f4efe5] text-sm text-[#776e61]">Opening module…</main>;
  return <PortalShell role="agent" eyebrow={module.category} title={module.title} description={module.summary}>
    <div className="grid gap-5 xl:grid-cols-[1.35fr_.65fr]"><div className="space-y-5"><Panel title="Best used when"><p className="text-sm leading-7 text-[#62594e]">{module.bestUsedWhen}</p></Panel>
      {module.scripts.length>0&&<Panel title="Scripts & talk tracks"><div className="space-y-4">{module.scripts.map(script=><article key={script.label} className="rounded-xl border border-[#e2d9c9] bg-[#faf8f3] p-4"><div className="flex items-center justify-between gap-3"><h3 className="font-semibold text-[#211d18]">{script.label}</h3><CopyScriptButton text={script.text}/></div><p className="mt-3 whitespace-pre-line text-sm leading-7 text-[#62594e]">“{script.text}”</p></article>)}</div></Panel>}
      {module.sections.map(section=><Panel key={section.heading} title={section.heading}>{section.body&&<p className="text-sm leading-7 text-[#62594e]">{section.body}</p>}{section.bullets&&<ul className="space-y-2 text-sm leading-6 text-[#62594e]">{section.bullets.map(item=><li key={item} className="flex gap-2"><span className="text-[#c9a75f]">•</span><span>{item}</span></li>)}</ul>}</Panel>)}</div>
      <aside className="space-y-5"><Panel title="Why it works"><ul className="space-y-3 text-sm leading-6 text-[#62594e]">{module.whyItWorks.map(item=><li key={item}>✓ {item}</li>)}</ul></Panel><Panel title="Compliance reminders"><ul className="space-y-3 text-sm leading-6 text-[#7c5320]">{module.compliance.map(item=><li key={item}>• {item}</li>)}</ul></Panel><Panel title="Related modules"><div className="space-y-2">{module.related.map(slug=>{const related=getTrainingModule(slug);return related?<Link key={slug} href={`/agent/training/${slug}`} className="block rounded-lg border border-[#e2d9c9] p-3 text-sm font-semibold hover:border-[#c9a75f]">{related.title} →</Link>:null})}</div></Panel></aside></div>
    <div className="mt-6 flex flex-wrap gap-3"><Link href="/agent/training" className="rounded-xl bg-[#176b65] px-5 py-3 text-sm font-semibold text-white">Back to Training Library</Link><Link href="/agent/leads" className="rounded-xl border border-[#e2d9c9] bg-white px-5 py-3 text-sm font-semibold">Go to My Leads</Link></div>
  </PortalShell>;
}
