import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Why Families Trust Us",
  description:
    "Veteran-founded, family-focused, and independent. The principles behind how Valor Legacies works with the families it serves.",
};

/**
 * Trust pillars — moved off the homepage into its own tab.
 *
 * The markup keeps the presentation it had as a homepage section (the same
 * gradient ground and card treatment) rather than being restyled into the
 * narrow document shell that /about and /faq use. This was a move, not a
 * redesign: a visitor following the header link should recognise the section
 * they remember, and the cards carry their own visual weight.
 */
const TRUST_PILLARS: [string, string][] = [
  ["Veteran-Founded", "Rooted in service, protection, and responsibility."],
  ["Family-Focused", "Every conversation begins with the people you love most."],
  ["Independent", "We are not limited to one insurance company."],
  ["Multiple Highly Rated Carriers", "Options may be reviewed from trusted life insurance providers."],
  ["No-Pressure Guidance", "Education first. Decisions second."],
  ["Privacy-Minded Process", "Your information is handled with care and respect."],
];

export default function TrustPage() {
  return (
    <main className="min-h-screen">
      <section
        className="bg-gradient-to-b from-[#e4e6ea] to-[#33363d] px-4 py-20 md:px-8 md:py-28"
        aria-labelledby="trust-heading"
      >
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto max-w-3xl text-center">
            <Link
              href="/"
              className="mb-6 inline-block text-xs uppercase tracking-[0.2em] text-[#6a5c4b] transition-opacity hover:opacity-80"
            >
              &larr; Back Home
            </Link>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-[#b58b3b]">Trust pillars</p>
            <h1 id="trust-heading" className="font-serif text-3xl font-light leading-tight text-[#211a13] md:text-5xl">
              Guided by Service. Built on Trust.
            </h1>
          </div>
          <div className="mt-10 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {TRUST_PILLARS.map(([title, desc]) => (
              <div
                key={title}
                className="rounded-[1.5rem] border border-white/60 bg-white p-6 shadow-[0_12px_34px_rgba(0,0,0,0.12)]"
              >
                <h2 className="font-serif text-2xl text-[#241d15]">{title}</h2>
                <p className="mt-3 leading-7 text-[#6a5c4b]">{desc}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <Link
              href="/#protection-path"
              className="inline-flex rounded-full bg-[#b58b3b] px-7 py-3 text-sm font-semibold text-white transition-all hover:-translate-y-0.5 hover:bg-[#9f782f]"
            >
              Find My Protection Path
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
