import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About & Contact",
  description:
    "Learn about Digital Cathedral — veteran-founded life insurance lead generation for military families.",
};

export default function AboutPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <article className="w-full max-w-2xl space-y-8">
        <header>
          <Link
            href="/"
            className="text-emerald-accent text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
          >
            &larr; Back Home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-2">
            About Digital Cathedral
          </h1>
        </header>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Our Mission
          </h2>
          <p>
            Digital Cathedral was founded by a veteran with a simple mission:
            help military families understand their life insurance options beyond
            standard military coverage. We connect service members, veterans, and
            their families with licensed insurance professionals who specialize
            in military-family needs.
          </p>
          <p>
            We are <strong className="text-[var(--text-primary)]">not</strong> an
            insurance company, agent, or broker. We do not sell insurance, provide
            quotes, or bind coverage. We are an independent lead generation service
            that bridges the gap between military families and qualified
            professionals who can help.
          </p>
        </section>

        <section id="how-it-works" className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed scroll-mt-8">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            How It Works
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong className="text-[var(--text-primary)]">
                Submit a request:
              </strong>{" "}
              Fill out our short, secure form with your basic information and
              coverage interest.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                We match you:
              </strong>{" "}
              Your information is shared with a licensed insurance professional
              experienced in military-family coverage.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                Free consultation:
              </strong>{" "}
              A professional reviews your needs and contacts you within 1
              business day — no obligation, no pressure.
            </li>
          </ul>
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
              Digital Cathedral is independently operated and{" "}
              <strong className="text-[var(--text-primary)]">
                not affiliated
              </strong>{" "}
              with the U.S. Government, Department of Defense, or any branch of
              military service.
            </li>
            <li>
              We do not provide insurance advice, quotes, or coverage of any
              kind.
            </li>
            <li>
              Coverage availability, rates, and terms vary by state and are
              subject to underwriting approval.
            </li>
            <li>
              Your information may be shared with licensed insurance
              professionals who may contact you.
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
                className="text-emerald-accent shrink-0"
                aria-hidden="true"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
              <a
                href="mailto:privacy@digital-cathedral.app"
                className="text-emerald-accent hover:underline text-sm"
              >
                privacy@digital-cathedral.app
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
              className="text-emerald-accent hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            and{" "}
            <Link
              href="/terms"
              className="text-emerald-accent hover:underline"
            >
              Terms of Service
            </Link>{" "}
            for complete details about data handling and site usage.
          </p>
        </section>

        <footer className="pt-8 border-t border-emerald-accent/10 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Digital Cathedral. All rights reserved.
          </p>
        </footer>
      </article>
    </main>
  );
}
