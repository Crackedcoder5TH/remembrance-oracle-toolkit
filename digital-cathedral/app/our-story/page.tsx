import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Our Story",
  description:
    "Valor Legacies was founded by Andrea Golden, a veteran who built it to make protection feel personal, understandable, and rooted in real life.",
};

/**
 * Our story — moved off the homepage into its own tab.
 *
 * Keeps the dark founder panel and portrait exactly as the homepage section
 * presented them; this was a move, not a redesign.
 *
 * Note on overlap: /about also carries a founder-story section (added with the
 * guides/copy work). This page is the fuller telling and /about remains the
 * mission-plus-contact page, so the header links here for the story. If the two
 * are ever consolidated, this is the one to keep — /about carries the contact
 * details and regulatory disclosures that have nowhere else to live.
 */
export default function OurStoryPage() {
  return (
    <main className="min-h-screen px-4 py-20 md:px-8 md:py-28">
      <div className="mx-auto max-w-7xl">
        <Link
          href="/"
          className="mb-6 inline-block text-xs uppercase tracking-[0.2em] text-[#6a5c4b] transition-opacity hover:opacity-80"
        >
          &larr; Back Home
        </Link>
        <div
          className="grid gap-10 rounded-[2rem] bg-[#241d15] p-8 text-white md:p-12 lg:grid-cols-[1fr_0.7fr] lg:items-center"
          aria-labelledby="about-heading"
        >
          <div>
            <p className="mb-4 text-xs font-semibold uppercase tracking-[0.32em] text-[#b58b3b]">Our story</p>
            <h1 id="about-heading" className="font-serif text-4xl font-light md:text-6xl">
              Veteran-Founded. Family-Focused. Independent.
            </h1>
            <p className="mt-6 text-lg leading-8 text-[#eadcc7]">
              Valor Legacies was created for the families who are building, growing, planning, grieving,
              dreaming, and trying to make the right decisions for the people they love most.
            </p>
            <p className="mt-5 text-lg leading-8 text-[#eadcc7]">
              As a veteran, service has always meant more to me than a title. It means showing up with
              purpose. It means protecting others. It means doing the right thing even when no one is
              watching. That same spirit is the foundation of Valor Legacies. I didn’t build this brand to
              make life insurance feel complicated or intimidating. I built it to make protection feel
              personal, understandable, and rooted in real life. Whether someone just had a baby, bought a
              home, got married, started thinking about retirement, or simply wants to make sure their
              family is not left with a financial burden, Valor Legacies exists to help them take the next
              step with confidence.
            </p>
            <p className="mt-6 font-serif text-2xl leading-snug text-[#d6b35f]">
              For the life you live, and the love you leave, this is why Valor Legacies exists.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link
                href="/#protection-path"
                className="inline-flex rounded-full bg-[#d6b35f] px-7 py-3 text-sm font-semibold text-[#241d15] transition-all hover:-translate-y-0.5"
              >
                Find My Protection Path
              </Link>
              <Link
                href="/about"
                className="inline-flex rounded-full border border-[#d6b35f]/55 px-7 py-3 text-sm font-semibold text-[#f6e5c4] transition-all hover:-translate-y-0.5"
              >
                About &amp; Contact
              </Link>
            </div>
          </div>
          <figure className="overflow-hidden rounded-[1.5rem] border border-[#d6b35f]/40 bg-gradient-to-br from-[#f6e5c4]/15 to-[#b58b3b]/10 p-3 shadow-[0_30px_90px_rgba(0,0,0,0.35)]">
            <img
              src="/assets/valor/founder-andrea-military.jpg"
              alt="Andrea Golden, veteran and founder of Valor Legacies"
              className="w-full rounded-[1.15rem]"
              loading="lazy"
            />
            <figcaption className="px-2 pb-1 pt-4 text-center">
              <p className="font-serif text-2xl text-[#f6e5c4]">Andrea Golden</p>
              <p className="mt-1 text-xs uppercase tracking-[0.24em] text-[#d6b35f]">Founder · Veteran</p>
            </figcaption>
          </figure>
        </div>
      </div>
    </main>
  );
}
