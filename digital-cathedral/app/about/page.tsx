import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About & Contact",
  description:
    "Meet Andrea Golden and learn why she founded Valor Legacies to make family protection more personal, understandable, and rooted in real life.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <article className="w-full max-w-2xl space-y-8">
        <header>
          <Link
            href="/"
            className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
          >
            &larr; Back Home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-2">
            About Valor Legacies
          </h1>
        </header>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Andrea Golden’s Founder Story
          </h2>
          <p>
            Valor Legacies was founded by Andrea Golden, a veteran who believes
            service means showing up with purpose, protecting others, and doing
            the right thing even when no one is watching. That same spirit is
            the foundation of Valor Legacies.
          </p>
          <p>
            Andrea created the company to make life insurance feel personal,
            understandable, and rooted in real life—not complicated or
            intimidating. Whether someone has welcomed a baby, bought a home,
            gotten married, started planning for retirement, or wants to keep a
            financial burden from falling on family, Valor Legacies helps them
            take the next step with confidence.
          </p>
          <p>
            &ldquo;Valor&rdquo; represents courage, bravery, and selfless
            service, the very qualities that define those who have worn the
            uniform. &ldquo;Legacies&rdquo; reflect what you leave behind, your
            impact, your values, and the protection you provide for the people
            you love.
          </p>
          <p>
            Together, Valor Legacies stands for honoring a life of courage by
            protecting the future of those you love.
          </p>
          <p className="font-medium text-[var(--text-primary)]">
            For the life you live, and the love you leave, this is why Valor
            Legacies exists.
          </p>
        </section>

        <section id="who-we-serve" className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed scroll-mt-8">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Who We Serve
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {[
              "Active Duty Service Members",
              "National Guard & Reserve",
              "Veterans",
              "Military Families",
              "Transitioning Service Members",
              "Military Spouses",
              "New Parents",
              "Homeowners & Families",
            ].map((category) => (
              <div
                key={category}
                className="cathedral-surface p-3 text-center text-sm text-[var(--text-primary)]"
              >
                {category}
              </div>
            ))}
          </div>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Important Disclosures
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              We are not an insurance company, agent, or broker, and we do not
              sell, quote, or bind insurance coverage.
            </li>
            <li>
              We are an independent life insurance resource and may connect
              consumers with licensed insurance professionals.
            </li>
            <li>
              We do not provide insurance advice, recommendations, or coverage
              of any kind.
            </li>
            <li>
              Valor Legacies is independently operated and is not affiliated
              with the U.S. Department of Veterans Affairs, the Department of
              Defense, or any government agency.
            </li>
            <li>
              Coverage availability, rates, and terms vary by state and are
              subject to individual carrier underwriting guidelines and approval.
            </li>
            <li>
              By submitting your information, you agree that it may be shared
              with licensed insurance professionals who may contact you to
              discuss coverage options.
            </li>
            <li>
              Submission of your information does not guarantee eligibility or
              coverage.
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Contact
          </h2>
          <p>
            For questions, feedback, or privacy requests:
          </p>
          <div className="cathedral-surface p-4 space-y-3">
            <div className="flex items-center gap-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-teal-cathedral shrink-0"
                aria-hidden="true"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
              <a
                href="mailto:valorlegacies@gmail.com"
                className="text-teal-cathedral hover:underline text-sm"
              >
                valorlegacies@gmail.com
              </a>
            </div>
          </div>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Transparency
          </h2>
          <p>
            We score every lead against a 16-dimensional coherency model so
            spam, bots, and low-quality data never reach the agents who serve
            you. See{" "}
            <Link
              href="/how-we-score"
              className="text-teal-cathedral hover:underline"
            >
              How We Score Quality
            </Link>{" "}
            for the plain-language explanation.
          </p>
          <p>
            For partners, AI agents, and developers integrating with us, see{" "}
            <Link
              href="/developers/agents"
              className="text-teal-cathedral hover:underline"
            >
              the agent API documentation
            </Link>
            . The full OpenAPI schema lives at{" "}
            <a
              href="/api/agent/schema"
              className="text-teal-cathedral hover:underline"
            >
              /api/agent/schema
            </a>
            .
          </p>
          {process.env.NEXT_PUBLIC_FORECAST_REPO_URL && (
            <p>
              We publish our forecasting track record publicly. Every
              prediction is signed and on-chain anchored before resolution
              so it can&apos;t be edited after the fact:{" "}
              <a
                href={process.env.NEXT_PUBLIC_FORECAST_REPO_URL}
                className="text-teal-cathedral hover:underline"
                target="_blank"
                rel="noopener noreferrer"
              >
                public forecasts
              </a>
              .
            </p>
          )}
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Legal
          </h2>
          <p>
            See our{" "}
            <Link
              href="/privacy"
              className="text-teal-cathedral hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link
              href="/terms"
              className="text-teal-cathedral hover:underline"
            >
              Terms of Service
            </Link>{" "}
            for complete details about data handling and site usage.
          </p>
        </section>

        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <nav className="mb-3 flex justify-center gap-4" aria-label="Footer navigation">
            <Link href="/resources" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Guides</Link>
            <Link href="/faq" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">FAQ</Link>
            <Link href="/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Privacy Policy</Link>
            <Link href="/terms" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Terms of Service</Link>
          </nav>
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.
          </p>
        </footer>
      </article>
    </main>
  );
}
