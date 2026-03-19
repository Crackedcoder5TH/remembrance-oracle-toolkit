import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About & Contact",
  description:
    "Learn about Valor Legacies — veteran-founded life insurance lead generation for military families.",
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
            Our Mission
          </h2>
          <p>
            Valor Legacies was founded by a veteran with a simple mission: to
            help military families understand their life insurance options beyond
            standard military coverage. We connect service members, veterans,
            and their families with licensed professionals who specialize in
            protecting military households.
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
              We operate as an independent lead generation service, connecting
              military families with licensed insurance professionals.
            </li>
            <li>
              We do not provide insurance advice, recommendations, or coverage
              of any kind.
            </li>
            <li>
              Valor Legacies is independently operated and is not affiliated
              with the U.S. Government, Department of Defense, or any branch of
              the military.
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
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.
          </p>
        </footer>
      </article>
    </main>
  );
}
