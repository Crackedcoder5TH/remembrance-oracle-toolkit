import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";

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
    <main className="min-h-screen">
      <article>
        <header className="px-4 py-20 sm:py-28 text-center bg-gradient-to-b from-teal-cathedral/10 to-transparent">
          <p className="text-teal-cathedral text-xs tracking-[0.25em] uppercase mb-5">
            Our Story
          </p>
          <h1 className="mx-auto max-w-3xl text-3xl sm:text-5xl font-light leading-tight text-[var(--text-primary)]">
            For the life you live...
            <span className="block text-teal-cathedral">...and the love you leave.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base sm:text-lg text-[var(--text-muted)] leading-relaxed">
            Valor Legacies was created to help families make confident decisions
            during the chapters that matter most.
          </p>
        </header>

        <div className="mx-auto w-full max-w-5xl px-4 pb-16 space-y-20 sm:space-y-28">
          <section id="our-story" className="scroll-mt-24 max-w-3xl mx-auto text-center space-y-5">
            <h2 className="text-2xl sm:text-3xl text-[var(--text-primary)] font-light">
              What Valor Legacies Means
            </h2>
            <div className="space-y-4 text-sm sm:text-base text-[var(--text-muted)] leading-relaxed">
              <p>
                <strong className="text-[var(--text-primary)]">“Valor”</strong> represents courage, bravery, and selfless service — the
                qualities that define those who have worn the uniform, and the
                same spirit families carry when they choose to protect the people
                they love.
              </p>
              <p>
                <strong className="text-[var(--text-primary)]">“Legacies”</strong> reflect what you leave behind: your impact, your values,
                your love, and the protection you provide for the people who
                matter most.
              </p>
              <p className="text-[var(--text-primary)] font-medium">
                Together, Valor Legacies stands for honoring a life of courage by
                protecting the future of those you love.
              </p>
            </div>
          </section>

          <section className="cathedral-surface overflow-hidden grid md:grid-cols-[minmax(260px,0.8fr)_1.2fr]">
            <div className="relative min-h-80 md:min-h-full">
              <Image
                src="/assets/valor/founder-andrea-military.jpg"
                alt="Valor Legacies founder Andrea Golden during her military service"
                fill
                sizes="(min-width: 768px) 40vw, 100vw"
                className="object-cover object-top"
              />
            </div>
            <div className="p-7 sm:p-10 space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
              <p className="text-teal-cathedral text-xs tracking-[0.2em] uppercase">Founder Story</p>
              <h2 className="text-2xl text-[var(--text-primary)] font-light">Andrea Golden</h2>
              <p>Valor Legacies was created for the families who are building, growing, planning, grieving, dreaming, and trying to make the right decisions for the people they love most.</p>
              <p>As a veteran, service has always meant more to me than a title. It means showing up with purpose. It means protecting others. It means doing the right thing even when no one is watching. That same spirit is the foundation of Valor Legacies.</p>
              <p>I didn’t build this brand to make life insurance feel complicated or intimidating. I built it to make protection feel personal, understandable, and rooted in real life.</p>
              <p>Whether someone just had a baby, bought a home, got married, started thinking about retirement, or simply wants to make sure their family is not left with a financial burden, Valor Legacies exists to help them take the next step with confidence.</p>
              <p>We are independent, which means we are not tied to one company or one product. We help families look at options that fit their life, their goals, their budget, and the people they are trying to protect.</p>
              <p className="text-[var(--text-primary)] font-medium">For the life you live, and the love you leave — this is why Valor Legacies exists.</p>
            </div>
          </section>

          <section id="who-we-serve" className="scroll-mt-24 text-center space-y-7">
            <div>
              <p className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-3">Every chapter matters</p>
              <h2 className="text-2xl sm:text-3xl text-[var(--text-primary)] font-light">Who We Serve</h2>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {PEOPLE_WE_SERVE.map((category) => (
                <div key={category} className="cathedral-surface p-5 text-sm text-[var(--text-primary)]">{category}</div>
              ))}
            </div>
          </section>

          <section className="grid md:grid-cols-2 gap-6">
            <div id="golden-standard" className="scroll-mt-24 cathedral-surface p-7 sm:p-9">
              <h2 className="text-2xl text-[var(--text-primary)] font-light mb-4">The Golden Standard</h2>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">At Valor Legacies, we believe families deserve more than a quote. They deserve clarity, patience, education, and guidance they can actually understand. The Golden Standard is our commitment to serve people with honesty, care, and purpose — whether they are ready to move forward today or simply trying to understand their options.</p>
            </div>
            <div id="review-process" className="scroll-mt-24 cathedral-surface p-7 sm:p-9">
              <h2 className="text-2xl text-[var(--text-primary)] font-light mb-4">A Thoughtful Review Process</h2>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">Every request is carefully reviewed before a licensed professional follows up, so families receive thoughtful, relevant guidance based on the chapter they are in.</p>
            </div>
          </section>

          <section id="privacy-trust" className="scroll-mt-24 text-center max-w-3xl mx-auto">
            <h2 className="text-2xl sm:text-3xl text-[var(--text-primary)] font-light mb-4">Privacy-Minded Guidance</h2>
            <p className="text-sm sm:text-base text-[var(--text-muted)] leading-relaxed">Your information is handled with care and respect. Valor Legacies may connect you with licensed insurance professionals so you can review options based on your needs, goals, and eligibility.</p>
            <Link href="/privacy" className="inline-block mt-6 text-teal-cathedral text-sm font-medium hover:underline">Read Privacy Policy →</Link>
          </section>

          <section className="cathedral-surface px-6 py-12 text-center">
            <p className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-3">Every New Chapter Deserves Protection.</p>
            <h2 className="text-2xl sm:text-3xl text-[var(--text-primary)] font-light">Ready to protect the chapter you are in?</h2>
            <Link href="/#protection-path" className="inline-block mt-7 px-8 py-3 rounded-lg font-medium text-sm bg-teal-cathedral text-white hover:bg-teal-cathedral/90 transition-colors">Start My Protection Path</Link>
          </section>

          <footer className="pt-8 border-t border-teal-cathedral/10 text-center text-xs text-[var(--text-muted)]">
            <nav className="mb-4 flex flex-wrap justify-center gap-4" aria-label="Footer navigation">
              <Link href="/resources" className="hover:text-teal-cathedral">Guides</Link>
              <Link href="/faq" className="hover:text-teal-cathedral">FAQ</Link>
              <Link href="/privacy" className="hover:text-teal-cathedral">Privacy Policy</Link>
              <Link href="/terms" className="hover:text-teal-cathedral">Terms of Service</Link>
              <a href="https://valorlegacies.xyz" className="hover:text-teal-cathedral" rel="external">Agent &amp; Admin Portal</a>
            </nav>
            <p>Life changes. Love lives on. Valor Legacies.</p>
            <p className="mt-2">&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
          </footer>
        </div>
      </article>
    </main>
  );
}
