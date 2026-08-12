import type { Metadata } from "next";
import Link from "next/link";
import { AEOSpeakablePage } from "../components/aeo-schema";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Common questions about Valor Legacies, life insurance for major life moments, and how our no-cost coverage review works.",
};

const FAQS = [
  {
    q: "What does Valor Legacies do?",
    a: "Valor Legacies helps families understand and explore life insurance options for the chapter they are in. We review your request and may connect you with a licensed insurance professional who can explain available options based on your needs, goals, budget, and eligibility.",
  },
  {
    q: "Is Valor Legacies an insurance company?",
    a: "No. Valor Legacies is an independent life insurance resource, not an insurance company, agent, or broker. We do not sell, quote, or bind coverage. We may connect consumers with licensed insurance professionals.",
  },
  {
    q: "Is there a cost to request a review?",
    a: "No. Requesting a review is free and there is no obligation to purchase coverage.",
  },
  {
    q: "What happens after I submit my information?",
    a: "Every request is carefully reviewed. A licensed insurance professional may then follow up by phone, text, or email using the contact information and consent you provide to discuss relevant options. Submission does not guarantee eligibility or coverage.",
  },
  {
    q: "Do I need to know what type of policy I need?",
    a: "Not at all. You can begin with your life chapter and what you want to protect. A licensed professional can explain term, permanent, final expense, and other available options in clear language so you can make an informed decision.",
  },
  {
    q: "What if I already have life insurance through work?",
    a: "Workplace coverage can be a valuable benefit, but it may be limited or may not follow you if you change jobs. A review can help you understand what you have and explore whether separate coverage could help close a gap.",
  },
  {
    q: "What if I just had a baby?",
    a: "Welcoming a child is a meaningful time to review income replacement, caregiving, education, and other long-term family needs. You do not need to have every number figured out before requesting guidance.",
  },
  {
    q: "What if I recently bought a home?",
    a: "Life insurance can help a family manage mortgage payments and other household obligations if someone dies. A review can help you consider your mortgage, income, existing coverage, and budget together.",
  },
  {
    q: "What is final expense planning?",
    a: "Final expense planning focuses on funds for funeral costs, medical bills, and other end-of-life expenses so loved ones are not left to manage the full financial burden. Coverage options and eligibility vary.",
  },
  {
    q: "What if I am planning for retirement?",
    a: "Retirement is a good time to review how insurance fits alongside savings, income needs, debts, final expenses, and the support you want to leave your family. A licensed professional can explain options relevant to your circumstances.",
  },
  {
    q: "What if I want to leave a legacy?",
    a: "Legacy planning may include providing for loved ones, supporting a cause, or creating financial stability for the next generation. A review can help you explore how life insurance may fit within those broader goals.",
  },
  {
    q: "What if I am a veteran or military family member?",
    a: "Valor Legacies is veteran-founded and proudly serves veterans, service members, and military families alongside families from every walk of life. A review can include questions about existing military benefits and private coverage options.",
  },
  {
    q: "Is Valor Legacies affiliated with the VA, DoD, or government?",
    a: "No. Valor Legacies is independently operated and is not affiliated with the U.S. Department of Veterans Affairs, the Department of Defense, or any government agency.",
  },
  {
    q: "How is my information protected?",
    a: "Your information is handled with care, protected using appropriate safeguards, and shared with licensed insurance professionals only as described in our Privacy Policy and your consent. You may contact us to exercise applicable privacy rights.",
  },
];

// Schema.org FAQPage structured data — makes content available to AI crawlers
// and enables Google FAQ rich results
const faqJsonLd = {
  "@context": "https://schema.org",
  "@type": "FAQPage",
  mainEntity: FAQS.map((item) => ({
    "@type": "Question",
    name: item.q,
    acceptedAnswer: {
      "@type": "Answer",
      text: item.a,
    },
  })),
};

export default function FaqPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <AEOSpeakablePage
        title="Frequently Asked Questions — Valor Legacies"
        description="Common questions about family protection, major life moments, coverage reviews, and veteran insurance considerations."
        url="/faq"
        speakableCssSelectors={["h1", "h2", "p"]}
      />

      <article className="w-full max-w-2xl space-y-8">
        <header>
          <Link
            href="/"
            className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
          >
            &larr; Back Home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-2">
            Frequently Asked Questions
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Common questions about planning protection around life’s biggest moments.
          </p>
        </header>

        <div className="space-y-6">
          {FAQS.map((item) => (
            <div key={item.q} className="border-b border-indigo-cathedral/8 pb-5">
              <h2 className="text-sm font-medium text-[var(--text-primary)] mb-2">
                {item.q}
              </h2>
              <p className="text-sm text-[var(--text-muted)] leading-relaxed">
                {item.a}
              </p>
            </div>
          ))}
        </div>

        <div className="cathedral-surface p-6 text-center">
          <p className="text-sm text-[var(--text-muted)] mb-4">
            Have a question not answered here?
          </p>
          <a
            href="mailto:valorlegacies@gmail.com"
            className="text-teal-cathedral text-sm hover:underline"
          >
            Contact us
          </a>
        </div>

        <div className="text-center pt-4">
          <Link
            href="/"
            className="inline-block px-8 py-3 rounded-lg font-medium text-sm transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90"
          >
            Start My Coverage Review
          </Link>
          <p className="text-xs text-[var(--text-muted)] mt-2">Takes less than 60 seconds.</p>
        </div>

        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <nav className="flex gap-4 justify-center mb-3">
            <Link href="/blog" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Blog</Link>
            <Link href="/resources" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Guides</Link>
            <Link href="/about" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">About</Link>
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
