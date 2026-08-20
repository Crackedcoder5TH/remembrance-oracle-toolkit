import Link from "next/link";
export default function AgentDashboard() { return <main className="mx-auto max-w-6xl p-4 py-8 sm:p-8">
  <p className="text-sm font-semibold uppercase tracking-widest text-[#176b65]">Agent workspace</p><h1 className="mt-2 text-3xl font-semibold">Move every family forward.</h1>
  <p className="mt-2 max-w-2xl text-[#685f52]">Browse compliant leads, respond quickly, and keep your follow-ups organized.</p>
  <div className="mt-8 grid gap-4 sm:grid-cols-2"><Link href="/agent/buy-leads" className="rounded-2xl border bg-white p-6 shadow-sm"><b>Find leads</b><p className="mt-2 text-sm text-[#685f52]">Browse privacy-safe previews matched to your focus.</p></Link><Link href="/agent/leads" className="rounded-2xl border bg-white p-6 shadow-sm"><b>Work My Leads</b><p className="mt-2 text-sm text-[#685f52]">Call, text, email, and open purchased leads.</p></Link></div>
  <section className="mt-8 rounded-2xl bg-[#e8f3f1] p-5"><b>Follow-ups</b><p className="mt-1 text-sm text-[#355d59]">You’re caught up for today. Great work.</p></section>
</main> }