import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { PAGE } from "../lib/valor/design";

export const metadata: Metadata = {
  title: "About Valor Legacies",
  description:
    "Meet founder Andrea Golden and discover the veteran-founded values behind Valor Legacies and its thoughtful approach to family protection.",
};

const PEOPLE_WE_SERVE = [
  "New Parents",
  "Homeowners",
  "Newly Married Couples",
  "Working Families",
  "Families Comparing Work Benefits",
  "Retirement Planners",
  "Legacy Planners",
  "Final Expense Planners",
  "Veterans & Military Families",
];

export default function AboutPage() {
  return (
    <main className={PAGE}>
      <article>
        <header className="px-4 py-20 sm:py-28 text-center bg-gradient-to-b from-[#f3ece0] to-transparent">
          <p className="text-[#b58b3b] text-xs tracking-[0.25em] uppercase mb-5">
            Our Story
          </p>
          <h1 className="font-serif mx-auto max-w-3xl text-3xl sm:text-5xl font-light leading-tight text-[#211a13]">
            For the life you live...
            <span className="block text-[#b58b3b]">...and the love you leave.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-[#6a5c4b] leading-relaxed">
            Valor Legacies was created to help families make confident decisions
            during the chapters that matter most.
          </p>
        </header>

        <div className="mx-auto w-full max-w-5xl px-4 pb-16 space-y-20 sm:space-y-28">
          <section id="our-story" className="scroll-mt-24 max-w-3xl mx-auto text-center space-y-5">
            <h2 className="font-serif text-2xl sm:text-3xl text-[#211a13] font-light">
              What Valor Legacies Means
            </h2>
            <div className="space-y-4 text-sm sm:text-base text-[#6a5c4b] leading-relaxed">
              <p>
                <strong className="text-[#211a13]">“Valor”</strong> represents courage, bravery, and selfless service — the
                qualities that define those who have worn the uniform, and the
                same spirit families carry when they choose to protect the people
                they love.
              </p>
              <p>
                <strong className="text-[#211a13]">“Legacies”</strong> reflect what you leave behind: your impact, your values,
                your love, and the protection you provide for the people who
                matter most.
              </p>
              <p className="text-[#211a13] font-medium">
                Together, Valor Legacies stands for honoring a life of courage by
                protecting the future of those you love.
              </p>
            </div>
          </section>

          <section className="rounded-[1.5rem] border border-[#e6d9c2] bg-white shadow-[0_12px_34px_rgba(61,43,24,0.08)] overflow-hidden grid md:grid-cols-[minmax(260px,0.8fr)_1.2fr]">
            {/* The photograph is 1088x944 — landscape. `fill` + object-cover
                inside a tall narrow column cropped it to a slice, cutting off
                both sides of the subject. Intrinsic sizing at its own aspect
                shows the whole frame, which is the point of a founder portrait. */}
            <div className="flex items-center justify-center bg-[#f3ece0] p-4">
              <Image
                src="/assets/valor/founder-andrea-military.jpg"
                alt="Valor Legacies founder Andrea Golden during her military service"
                width={1088}
                height={944}
                sizes="(min-width: 768px) 40vw, 100vw"
                className="h-auto w-full rounded-[1rem] object-contain"
              />
            </div>
            <div className="p-7 sm:p-10 space-y-4 text-sm text-[#6a5c4b] leading-relaxed">
              <p className="text-[#b58b3b] text-xs tracking-[0.2em] uppercase">Founder Story</p>
              <h2 className="font-serif text-2xl text-[#211a13] font-light">Andrea Golden</h2>
              <p>Valor Legacies was created for the families who are building, growing, planning, grieving, dreaming, and trying to make the right decisions for the people they love most.</p>
              <p>As a veteran, service has always meant more to me than a title. It means showing up with purpose. It means protecting others. It means doing the right thing even when no one is watching. That same spirit is the foundation of Valor Legacies.</p>
              <p>I didn’t build this brand to make life insurance feel complicated or intimidating. I built it to make protection feel personal, understandable, and rooted in real life.</p>
              <p>Whether someone just had a baby, bought a home, got married, started thinking about retirement, or simply wants to make sure their family is not left with a financial burden, Valor Legacies exists to help them take the next step with confidence.</p>
              <p>We are independent, which means we are not tied to one company or one product. We help families look at options that fit their life, their goals, their budget, and the people they are trying to protect.</p>
              <p className="text-[#211a13] font-medium">For the life you live, and the love you leave — this is why Valor Legacies exists.</p>
            </div>
          </section>

          <section id="who-we-serve" className="scroll-mt-24 text-center space-y-7">
            <div>
              <p className="text-[#b58b3b] text-xs tracking-[0.2em] uppercase mb-3">Every chapter matters</p>
              <h2 className="font-serif text-2xl sm:text-3xl text-[#211a13] font-light">Who We Serve</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PEOPLE_WE_SERVE.map((category) => (
                <div key={category} className="rounded-[1.5rem] border border-[#e6d9c2] bg-white shadow-[0_12px_34px_rgba(61,43,24,0.08)] p-5 text-sm text-[#211a13]">{category}</div>
              ))}
            </div>
          </section>

          <section className="grid md:grid-cols-2 gap-6">
            <div id="golden-standard" className="scroll-mt-24 rounded-[1.5rem] border border-[#e6d9c2] bg-white shadow-[0_12px_34px_rgba(61,43,24,0.08)] p-7 sm:p-9">
              <h2 className="font-serif text-2xl text-[#211a13] font-light mb-4">The Golden Standard</h2>
              <p className="text-sm text-[#6a5c4b] leading-relaxed">At Valor Legacies, we believe families deserve more than a quote. They deserve clarity, patience, education, and guidance they can actually understand. The Golden Standard is our commitment to serve people with honesty, care, and purpose, whether they are ready to move forward today or simply trying to understand their options.</p>
            </div>
            <div id="review-process" className="scroll-mt-24 rounded-[1.5rem] border border-[#e6d9c2] bg-white shadow-[0_12px_34px_rgba(61,43,24,0.08)] p-7 sm:p-9">
              <h2 className="font-serif text-2xl text-[#211a13] font-light mb-4">A Thoughtful Review Process</h2>
              <p className="text-sm text-[#6a5c4b] leading-relaxed">Every request is carefully reviewed before a licensed professional follows up, so families receive thoughtful, relevant guidance based on the chapter they are in.</p>
            </div>
          </section>

          <section id="privacy-trust" className="scroll-mt-24 text-center max-w-3xl mx-auto">
            <h2 className="font-serif text-2xl sm:text-3xl text-[#211a13] font-light mb-4">Privacy-Minded Guidance</h2>
            <p className="text-sm sm:text-base text-[#6a5c4b] leading-relaxed">Your information is handled with care and respect. Valor Legacies may connect you with licensed insurance professionals so you can review options based on your needs, goals, and eligibility.</p>
            <Link href="/privacy" className="inline-block mt-6 text-[#b58b3b] text-sm font-medium hover:underline">Read Privacy Policy →</Link>
          </section>

          <section className="rounded-[1.5rem] border border-[#e6d9c2] bg-white shadow-[0_12px_34px_rgba(61,43,24,0.08)] px-6 py-12 text-center">
            <p className="text-[#b58b3b] text-xs tracking-[0.2em] uppercase mb-3">Every New Chapter Deserves Protection.</p>
            <h2 className="font-serif text-2xl sm:text-3xl text-[#211a13] font-light">Ready to protect the chapter you are in?</h2>
            <Link href="/#protection-path" className="inline-block mt-7 px-8 py-3 rounded-lg font-medium text-sm bg-[#b58b3b] text-white hover:bg-[#b58b3b]/90 transition-colors">Start My Protection Path</Link>
          </section>

          <footer className="pt-8 border-t border-[#e6d9c2] text-center text-xs text-[#6a5c4b]">
            <nav className="mb-4 flex flex-wrap justify-center gap-4" aria-label="Footer navigation">
              <Link href="/resources" className="hover:text-[#b58b3b]">Guides</Link>
              <Link href="/faq" className="hover:text-[#b58b3b]">FAQ</Link>
              <Link href="/privacy" className="hover:text-[#b58b3b]">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-[#b58b3b]">Terms of Service</Link>
              <a href="https://valorlegacies.xyz" className="hover:text-[#b58b3b]" rel="external">Agent &amp; Admin Portal</a>
            </nav>
            <p>Life changes. Love lives on. Valor Legacies.</p>
            <p className="mt-2">&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
          </footer>
        </div>
      </article>
    </main>
  );
}
