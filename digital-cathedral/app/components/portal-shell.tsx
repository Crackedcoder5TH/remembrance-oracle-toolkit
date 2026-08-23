"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { ReactNode } from "react";

export type PortalRole = "admin" | "agent" | "developer";

const NAVIGATION: Record<PortalRole, { label: string; href: string }[]> = {
  admin: [
    { label: "Dashboard", href: "/admin/dashboard" },
    { label: "Leads", href: "/admin/leads" },
    { label: "Agents", href: "/admin/clients" },
    { label: "Lead Marketplace", href: "/portal/marketplace" },
    { label: "Orders & Payments", href: "/admin/payments" },
    { label: "Compliance", href: "/admin/compliance" },
    { label: "Training", href: "/admin/training" },
    { label: "Analytics", href: "/admin/analytics" },
    { label: "Content / Campaigns", href: "/admin" },
    { label: "Support / Disputes", href: "/admin/disputes" },
    { label: "Settings", href: "/admin/ops" },
  ],
  agent: [
    { label: "Dashboard", href: "/agent/dashboard" },
    { label: "Buy Leads", href: "/agent/buy-leads" },
    { label: "My Leads", href: "/agent/leads" },
    { label: "Pipeline", href: "/agent/pipeline" },
    { label: "Appointments / Tasks", href: "/agent/tasks" },
    { label: "Scripts & Training", href: "/agent/training" },
    { label: "Billing / Credits", href: "/agent/billing" },
    { label: "Performance", href: "/agent/performance" },
    { label: "Support", href: "/agent/support" },
  ],
  developer: [
    { label: "Developer Dashboard", href: "/developers" },
    { label: "API Documentation", href: "/developers/agents" },
    { label: "API Keys", href: "/developers#api-keys" },
    { label: "Consent Flow", href: "/developers#consent" },
    { label: "Webhooks / Logs", href: "/developers#webhooks" },
    { label: "Usage", href: "/developers#usage" },
    { label: "Support", href: "/developers#support" },
  ],
};

export function PortalShell({ role, eyebrow, title, description, children }: {
  role: PortalRole;
  eyebrow: string;
  title: string;
  description: string;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const router = useRouter();

  async function logout() {
    await fetch(role === "admin" ? "/api/admin/logout" : "/api/portal/logout", { method: "POST" });
    router.replace(role === "admin" ? "/admin/login" : "/portal/login");
  }

  return (
    <div className="min-h-screen bg-[#f4efe5] text-[#211d18] lg:grid lg:grid-cols-[260px_1fr]">
      <aside className="border-b border-white/10 bg-[#171714] text-[#f7f0e3] lg:sticky lg:top-0 lg:h-screen lg:border-b-0 lg:border-r">
        <div className="flex items-center justify-between px-5 py-5 lg:block lg:px-6 lg:py-7">
          <Link href="/portal" className="flex items-center gap-3" aria-label="Valor Legacies portal home">
            <span className="grid h-9 w-9 place-items-center rounded-full border border-[#c9a75f]/45 bg-[#c9a75f]/10 font-serif text-lg text-[#d5b972]">V</span>
            <span><strong className="block text-sm tracking-wide">Valor Legacies</strong><small className="text-[10px] uppercase tracking-[0.22em] text-[#c9a75f]">Operations portal</small></span>
          </Link>
          <span className="rounded-full border border-[#c9a75f]/25 px-3 py-1 text-[10px] uppercase tracking-[0.18em] text-[#d5b972] lg:mt-6 lg:inline-block">{role}</span>
        </div>
        <nav className="flex gap-1 overflow-x-auto px-4 pb-4 lg:block lg:space-y-1 lg:overflow-visible lg:px-3" aria-label={`${role} navigation`}>
          {NAVIGATION[role].map((item) => {
            const active = pathname === item.href || (item.href !== "/admin" && pathname.startsWith(`${item.href}/`));
            return <Link key={item.label} href={item.href} className={`whitespace-nowrap rounded-xl px-3 py-2.5 text-sm transition lg:block ${active ? "bg-[#c9a75f] font-semibold text-[#181510]" : "text-[#cfc7b9] hover:bg-white/5 hover:text-white"}`} aria-current={active ? "page" : undefined}>{item.label}</Link>;
          })}
        </nav>
        <div className="hidden border-t border-white/10 p-4 lg:absolute lg:inset-x-0 lg:bottom-0 lg:block">
          <button onClick={logout} className="w-full rounded-xl border border-white/10 px-3 py-2 text-left text-sm text-[#cfc7b9] hover:border-[#c9a75f]/50 hover:text-white">Sign out</button>
        </div>
      </aside>
      <main className="min-w-0 px-4 py-6 sm:px-7 lg:px-10 lg:py-9">
        <header className="mb-7 flex flex-wrap items-end justify-between gap-4 border-b border-[#d9cfbd] pb-6">
          <div><p className="mb-2 text-[11px] font-bold uppercase tracking-[0.24em] text-[#94732e]">{eyebrow}</p><h1 className="font-serif text-3xl leading-tight sm:text-4xl">{title}</h1><p className="mt-2 max-w-2xl text-sm leading-6 text-[#71695e]">{description}</p></div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-emerald-500"/><span className="text-xs font-medium text-[#71695e]">Systems operational</span></div>
        </header>
        {children}
      </main>
    </div>
  );
}

export function MetricCard({ label, value, note, urgent = false }: { label: string; value: string | number; note: string; urgent?: boolean }) {
  return <article className={`rounded-2xl border bg-white p-5 shadow-[0_8px_30px_rgba(39,32,20,0.05)] ${urgent ? "border-amber-300" : "border-[#e2d9c9]"}`}><p className="text-xs font-semibold uppercase tracking-[0.12em] text-[#776e61]">{label}</p><p className="mt-3 font-serif text-3xl text-[#211d18]">{value}</p><p className={`mt-2 text-xs ${urgent ? "font-medium text-amber-700" : "text-[#8a8175]"}`}>{note}</p></article>;
}

export function Panel({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return <section className="rounded-2xl border border-[#e2d9c9] bg-white p-5 shadow-[0_8px_30px_rgba(39,32,20,0.04)]"><div className="mb-5 flex items-center justify-between gap-3"><h2 className="font-serif text-xl">{title}</h2>{action}</div>{children}</section>;
}
