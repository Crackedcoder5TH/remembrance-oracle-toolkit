import type { Metadata } from "next";
import Link from "next/link";
import { ServiceSchema } from "../components/schema-markup";
import { GUIDE_CATEGORIES, getGuidesByCategory } from "../guides/data";

export const metadata: Metadata = {
  title: "Life Insurance Guides",
  description:
    "Explore consumer-friendly life insurance guides for new parents, homeowners, work benefits, final expense planning, retirement, legacy planning, and veteran families.",
  keywords: [
    "life insurance guides",
    "new parent life insurance",
    "homeowner protection",
    "employer life insurance",
    "final expense planning",
    "veteran life insurance benefits",
  ],
  openGraph: {
    title: "Life Insurance Guides",
    description:
      "Consumer-friendly Valor Legacies guides for life insurance decisions around family, home, work benefits, retirement, final expenses, and veteran benefits.",
    type: "website",
  },
};

const CATEGORY_DESCRIPTIONS: Record<string, string> = {
  "New Parents":
    "Protection questions that often come up after welcoming a baby.",
  Homeowners: "Guidance for protecting the home and the people who live there.",
  "Work Benefits":
    "Plain-English help comparing employer coverage with personally owned protection.",
  "Final Expense":
    "Calm planning resources for funeral, cremation, burial, and final costs.",
  "Retirement & Legacy":
    "Careful education for retirement, legacy, and coverage amount conversations.",
  "Veterans & Military Families":
    "Military and veteran benefit resources, plus private coverage considerations.",
  "Coverage Basics":
    "Straightforward help estimating needs and preparing for a coverage conversation.",
};

export default function ResourcesIndex() {

  return (
    <main className="min-h-screen bg-[#fbf7f0] px-4 py-12 text-[#241d15] md:px-8 md:py-16">
      <ServiceSchema />

      <article className="mx-auto max-w-7xl space-y-12">
        <header className="rounded-[2rem] bg-[#241d15] p-8 text-white shadow-[0_24px_80px_rgba(36,29,21,0.18)] md:p-12">
          <Link
            href="/"
            className="mb-8 inline-flex text-xs font-semibold uppercase tracking-[0.24em] text-[#d6b35f] transition-opacity hover:opacity-80"
          >
            &larr; Back Home
          </Link>
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-[#d6b35f]">
            Resource Center
          </p>
          <h1 className="mt-4 max-w-4xl font-serif text-4xl font-light leading-tight md:text-6xl">
            Life Insurance Guides
          </h1>
          <p className="mt-6 max-w-3xl text-lg leading-8 text-[#eadcc7]">
            Life insurance can feel confusing, but the right guidance starts
            with the chapter you are in. These guides are designed to help
            families understand what may be missing, what questions to ask, and
            how protection may help.
          </p>
        </header>

        <div className="space-y-12">
          {GUIDE_CATEGORIES.map((category) => {
            const guides = getGuidesByCategory(category);
            return (
              <section
                key={category}
                className="space-y-5"
                aria-labelledby={`${category.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}-heading`}
              >
                <div className="flex flex-col gap-2 md:flex-row md:items-end md:justify-between">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#9f782f]">
                      {category}
                    </p>
                    <h2
                      id={`${category.toLowerCase().replaceAll(" ", "-").replaceAll("&", "and")}-heading`}
                      className="mt-2 font-serif text-3xl font-light text-[#241d15] md:text-4xl"
                    >
                      {category}
                    </h2>
                  </div>
                  <p className="max-w-2xl text-sm leading-6 text-[#6a5c4b]">
                    {CATEGORY_DESCRIPTIONS[category]}
                  </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                  {guides.map((guide) => (
                    <Link
                      key={guide.slug}
                      href={`/guides/${guide.slug}`}
                      className="group rounded-[1.5rem] bg-white p-6 shadow-[0_18px_60px_rgba(61,43,24,0.08)] transition-all hover:-translate-y-1 hover:shadow-[0_24px_70px_rgba(61,43,24,0.14)]"
                    >
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#9f782f]">
                        Guide
                      </p>
                      <h3 className="mt-3 text-xl font-semibold text-[#241d15] transition-colors group-hover:text-[#9f782f]">
                        {guide.title}
                      </h3>
                      <p className="mt-3 text-sm leading-6 text-[#6a5c4b]">
                        {guide.purpose}
                      </p>
                      <span className="mt-5 inline-flex text-sm font-semibold text-[#9f782f]">
                        Read Guide &rarr;
                      </span>
                    </Link>
                  ))}
                </div>
              </section>
            );
          })}
        </div>

        <section className="rounded-[2rem] bg-[#241d15] p-8 text-center text-white md:p-10">
          <p className="text-xs font-semibold uppercase tracking-[0.24em] text-[#d6b35f]">
            Not sure where to start?
          </p>
          <h2 className="mt-3 font-serif text-3xl font-light">
            Tell us what changed in your life.
          </h2>
          <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[#eadcc7]">
            The protection path starts with your life chapter, then helps guide
            the next conversation.
          </p>
          <Link
            href="/#protection-path"
            className="mt-7 inline-flex rounded-full bg-[#d6b35f] px-8 py-3 text-sm font-semibold text-[#241d15] transition-transform hover:-translate-y-0.5"
          >
            Start My Protection Path
          </Link>
        </section>
      </article>
    </main>
  );
}
