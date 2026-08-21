import Link from "next/link";

export function PortalLanding() {
  return <main className="relative min-h-screen overflow-hidden bg-[#171714] px-5 text-[#f7f0e3]">
    <div className="absolute inset-0 opacity-70 [background:radial-gradient(circle_at_75%_20%,rgba(201,167,95,.2),transparent_28%),linear-gradient(120deg,#171714_45%,#25231e)]" />
    <div className="relative mx-auto flex min-h-screen max-w-6xl flex-col">
      <header className="flex items-center justify-between border-b border-white/10 py-6"><div className="flex items-center gap-3"><span className="grid h-10 w-10 place-items-center rounded-full border border-[#c9a75f]/50 font-serif text-xl text-[#d5b972]">V</span><div><strong className="block text-sm">Valor Legacies</strong><span className="text-[10px] uppercase tracking-[.24em] text-[#c9a75f]">Operations</span></div></div><Link href="/developers" className="text-sm text-[#d8d0c3] hover:text-white">Developer resources →</Link></header>
      <section className="grid flex-1 items-center gap-12 py-16 lg:grid-cols-[1.15fr_.85fr]">
        <div><p className="mb-5 text-xs font-semibold uppercase tracking-[.3em] text-[#c9a75f]">Secure operational workspace</p><h1 className="max-w-4xl font-serif text-5xl font-light leading-[1.04] sm:text-6xl lg:text-7xl">Valor Legacies<br/><span className="text-[#d5b972]">Agent &amp; Admin Portal</span></h1><p className="mt-7 max-w-2xl text-base leading-7 text-[#c9c1b4] sm:text-lg">Manage leads, track performance, access resources, and support the operational side of Valor Legacies.</p><div className="mt-9 flex flex-wrap gap-3"><Link href="/portal/login" className="rounded-full bg-[#c9a75f] px-6 py-3 text-sm font-bold text-[#17140f] hover:bg-[#d8bb78]">Agent Login</Link><Link href="/admin/login" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold hover:border-[#c9a75f]">Admin Login</Link><Link href="/developers" className="rounded-full border border-white/20 px-6 py-3 text-sm font-semibold hover:border-[#c9a75f]">Developer Portal</Link></div></div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1"><PortalFeature number="01" title="Move at lead speed" text="Keep priority work, follow-ups, and performance signals visible."/><PortalFeature number="02" title="Operate with confidence" text="Role-based access keeps agent, admin, and developer work focused."/><PortalFeature number="03" title="Protect every interaction" text="Compliance, consent, and operational accountability stay close to the work."/></div>
      </section>
      <footer className="border-t border-white/10 py-6 text-sm text-[#aaa296]">Looking for life insurance guidance? <a href="https://valorlegacies.com" className="font-semibold text-[#d5b972] hover:text-white">Visit valorlegacies.com</a></footer>
    </div>
  </main>;
}

function PortalFeature({ number, title, text }: { number: string; title: string; text: string }) {
  return <div className="rounded-2xl border border-white/10 bg-white/[.035] p-5 backdrop-blur"><span className="text-xs tracking-[.2em] text-[#c9a75f]">{number}</span><h2 className="mt-3 font-serif text-xl">{title}</h2><p className="mt-2 text-sm leading-6 text-[#aaa296]">{text}</p></div>;
}
