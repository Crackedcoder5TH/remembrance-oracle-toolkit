import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GUIDE_DISCLAIMER, GUIDES, getGuideBySlug } from "../data";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateStaticParams() {
  return GUIDES.map((guide) => ({ slug: guide.slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) return {};

  return {
    title: `${guide.title} | Valor Legacies Guides`,
    description: guide.metaDescription,
    alternates: {
      canonical: `/guides/${guide.slug}`,
    },
    openGraph: {
      title: guide.title,
      description: guide.metaDescription,
      type: "article",
    },
  };
}

export default async function GuidePage({ params }: Props) {
  const { slug } = await params;
  const guide = getGuideBySlug(slug);
  if (!guide) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-[#fbf7f0] px-4 py-12 text-[#241d15] md:px-8 md:py-16">
      <article className="mx-auto max-w-4xl space-y-10">
        <header className="rounded-[2rem] bg-[#241d15] p-8 text-white shadow-[0_24px_80px_rgba(36,29,21,0.18)] md:p-12">
          <Link
            href="/resources"
            className="mb-8 inline-flex text-xs font-semibold uppercase tracking-[0.24em] text-[#d6b35f] transition-opacity hover:opacity-80"
          >
            &larr; Resource Center
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d6b35f]">
            {guide.category}
          </p>
          <h1 className="mt-4 font-serif text-4xl font-light leading-tight md:text-6xl">
            {guide.title}
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#eadcc7]">
            {guide.intro}
          </p>
        </header>

        <section className="rounded-[1.5rem] border border-[#decda9] bg-white p-6 shadow-[0_18px_60px_rgba(61,43,24,0.08)] md:p-8">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9f782f]">
            What this guide helps you understand
          </p>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {guide.helps.map((item) => (
              <li
                key={item}
                className="rounded-2xl bg-[#fbf7f0] p-4 text-sm leading-6 text-[#5d4f3f]"
              >
                {item}
              </li>
            ))}
          </ul>
        </section>

        <div className="space-y-8">
          {guide.sections.map((section) => (
            <section
              key={section.heading}
              className="rounded-[1.5rem] bg-white p-6 shadow-[0_18px_60px_rgba(61,43,24,0.08)] md:p-8"
            >
              <h2 className="font-serif text-3xl font-light text-[#241d15]">
                {section.heading}
              </h2>
              <div className="mt-4 space-y-4 text-base leading-8 text-[#5d4f3f]">
                {section.body.map((paragraph) => (
                  <p key={paragraph}>{paragraph}</p>
                ))}
              </div>
              {section.bullets && (
                <ul className="mt-5 space-y-3 text-sm leading-6 text-[#5d4f3f]">
                  {section.bullets.map((bullet) => (
                    <li key={bullet} className="flex gap-3">
                      <span
                        className="mt-2 h-2 w-2 shrink-0 rounded-full bg-[#d6b35f]"
                        aria-hidden="true"
                      />
                      <span>{bullet}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </div>

        <section className="rounded-[1.5rem] border border-[#decda9] bg-[#fffaf1] p-6 md:p-8">
          <h2 className="font-serif text-3xl font-light text-[#241d15]">
            Questions to ask yourself
          </h2>
          <ul className="mt-5 grid gap-3 md:grid-cols-2">
            {guide.questions.map((question) => (
              <li
                key={question}
                className="rounded-2xl bg-white p-4 text-sm leading-6 text-[#5d4f3f]"
              >
                {question}
              </li>
            ))}
          </ul>
        </section>

        <section className="rounded-[2rem] bg-[#241d15] p-8 text-center text-white md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d6b35f]">
            Ready for the next step?
          </p>
          <h2 className="mt-3 font-serif text-3xl font-light">
            Start with your life, not insurance jargon.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#eadcc7]">
            Tell us what changed, and we can help guide the next conversation
            with a licensed professional.
          </p>
          <Link
            href="/#protection-path"
            className="mt-7 inline-flex rounded-full bg-[#d6b35f] px-8 py-3 text-sm font-semibold text-[#241d15] transition-transform hover:-translate-y-0.5"
          >
            {guide.cta}
          </Link>
        </section>

        <section className="rounded-[1.5rem] bg-white p-6 text-sm leading-7 text-[#5d4f3f] shadow-[0_18px_60px_rgba(61,43,24,0.08)] md:p-8">
          <h2 className="font-serif text-2xl font-light text-[#241d15]">
            Sources & Helpful References
          </h2>
          <ul className="mt-4 space-y-2">
            {guide.sources.map((source) => (
              <li key={source.href}>
                <a
                  href={source.href}
                  className="font-semibold text-[#9f782f] underline-offset-4 hover:underline"
                  rel="noreferrer"
                >
                  {source.label}
                </a>
              </li>
            ))}
          </ul>
        </section>

        <footer className="rounded-[1.5rem] border border-[#decda9] bg-white/70 p-5 text-xs leading-6 text-[#6a5c4b]">
          {GUIDE_DISCLAIMER}
        </footer>
      </article>
    </main>
  );
}
