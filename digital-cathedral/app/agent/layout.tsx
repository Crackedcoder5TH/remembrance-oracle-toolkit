import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Agent Operations", robots: { index: false, follow: false } };

export default function AgentLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-[#f7f5ef] text-[#211a13]">
    <header className="sticky top-0 z-20 border-b border-[#d9d2c3] bg-[#fffdf8]/95 backdrop-blur">
      <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/agent/dashboard" className="font-semibold tracking-wide">Valor Legacies <span className="text-[#176b65]">Agent</span></Link>
        <nav className="flex gap-1 text-sm" aria-label="Agent operations">
          <Link className="rounded-lg px-3 py-2 hover:bg-[#e8f3f1]" href="/agent/buy-leads">Marketplace</Link>
          <Link className="rounded-lg px-3 py-2 hover:bg-[#e8f3f1]" href="/agent/leads">My Leads</Link>
        </nav>
      </div>
    </header>{children}</div>;
}