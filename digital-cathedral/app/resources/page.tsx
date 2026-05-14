import type { Metadata } from "next";
import Link from "next/link";
import { getAllLandingPages } from "../lib/landing-pages";
import { ServiceSchema } from "../components/schema-markup";

export const metadata: Metadata = {
  title: "Military Life Insurance Resources",
  description:
    "Explore life insurance options for veterans, active duty, National Guard, and military families. Free coverage reviews from licensed professionals.",
  keywords: [
    "veteran life insurance",
    "military life insurance",
    "SGLI alternatives",
    "military family coverage",
    "veteran insurance options",
  ],
  openGraph: {
    title: "Military Life Insurance Resources",
    description: "Explore life insurance options for veterans, active duty, National Guard, and military families.",
    type: "article",
    modifiedTime: "2026-03-12T00:00:00Z",
  },
};

export default function ResourcesIndex() {
  const pages = getAllLandingPages();

  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <ServiceSchema />

      <article className="w-full max-w-4xl space-y-8">
        <header>
          <Link
            href="/"
            className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
          >
            &larr; Back Home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-2">
            Military Life Insurance Resources
          </h1>
          <p className="text-sm text-[var(--text-muted)] max-w-2xl">
            Explore coverage options tailored to your military service. Each guide includes
            FAQs, coverage details, and a free review from licensed professionals who
            specialize in military-family insurance.
          </p>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {pages.map((page) => (
            <Link
              key={page.slug}
              href={`/resources/${page.slug}`}
              className="cathedral-surface p-6 hover:border-teal-cathedral/30 transition-all group"
            >
              <h2 className="text-base font-medium text-[var(--text-primary)] group-hover:text-teal-cathedral transition-colors mb-2">
                {page.title}
              </h2>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                {page.metaDescription}
              </p>
              <span className="inline-block mt-3 text-xs text-teal-cathedral">
                Learn more &rarr;
              </span>
            </Link>
          ))}
        </div>

        <div className="text-center pt-8">
          <Link
            href="/"
            className="inline-block px-8 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Start My Free Coverage Review
          </Link>
          <p className="text-xs text-[var(--text-muted)] mt-2">
            Takes less than 60 seconds. No obligation.
          </p>
        </div>

        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <nav className="flex gap-4 justify-center mb-3">
            <Link href="/blog" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Blog</Link>
            <Link href="/faq" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">FAQ</Link>
            <Link href="/about" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">About</Link>
            <Link href="/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Privacy</Link>
          </nav>
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.
          </p>
        </footer>
      </article>
    </main>
  );
}
