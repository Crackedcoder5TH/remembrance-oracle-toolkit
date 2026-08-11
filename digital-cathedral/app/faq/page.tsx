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
    q: "How do I know what kind of life insurance may fit my family?",
    a: "The right fit depends on the people who rely on you, your budget, health, debts, income, and long-term goals. Term and permanent policies serve different needs. A licensed insurance professional can explain available options and help you compare them without assuming one solution fits everyone.",
  },
  {
    q: "When should I review my life insurance needs?",
    a: "Major life moments are useful times to review protection: welcoming a child, getting married, buying a home, changing jobs, preparing for retirement, supporting aging relatives, or planning final expenses. You can also request a review simply because your current coverage no longer feels clear.",
  },
  {
    q: "Is this the same as SGLI?",
    a: "No. This is additional or alternative life insurance options available outside standard military coverage. SGLI (Servicemembers' Group Life Insurance) is a separate program supervised by the U.S. Department of Veterans Affairs (VA) and administered by the Prudential Insurance Company of America.",
  },
  {
    q: "Is this affiliated with the military or government?",
    a: "No. Valor Legacies is independently operated and is not affiliated with the U.S. Department of Veterans Affairs, the Department of Defense, or any government agency.",
  },
  {
    q: "Is there any obligation to purchase?",
    a: "No. Requesting a review simply connects you with a licensed professional to explore your options. There is no obligation, no pressure, and no cost for the consultation.",
  },
  {
    q: "Who can request a coverage review?",
    a: "Adults exploring family, income, mortgage, final expense, retirement, or legacy protection may request a review. Valor Legacies also welcomes service members, veterans, and military families. Available options depend on state availability, underwriting, and individual eligibility.",
  },
  {
    q: "How long does the process take?",
    a: "The form takes less than 60 seconds. After you submit, a licensed insurance professional will typically reach out within 3 business days.",
  },
  {
    q: "What happens to my information?",
    a: "Your information is securely stored and shared only with licensed insurance professionals who may contact you about coverage options. See our Privacy Policy for full details. You can request deletion of your data at any time under CCPA/CPRA.",
  },
  {
    q: "Do you sell insurance?",
    a: "No. Valor Legacies is not an insurance company, agent, or broker. We do not sell insurance, provide quotes, or bind coverage. We connect consumers with licensed professionals.",
  },
  {
    q: "Who will contact me?",
    a: "A licensed insurance professional will review your information and may reach out by phone, text, or email using the contact preferences and consent you provide.",
  },
  {
    q: "What types of coverage can I explore?",
    a: "You can ask about family and income protection, mortgage responsibilities, final expenses, retirement considerations, and legacy goals. Product availability and suitability vary, so a licensed professional can explain the options available for your circumstances.",
  },
  {
    q: "Can my AI assistant help me sign up?",
    a: "Yes. Valor Legacies supports AI agent integration. If you're using an AI assistant like ChatGPT, Claude, or Gemini, it can help submit your information on your behalf — but only after you explicitly confirm consent through a secure verification link. Your AI assistant will guide you through the process.",
  },
  {
    q: "How does the AI agent consent process work?",
    a: "Your AI assistant requests permission to act on your behalf, and you'll receive a confirmation link. You must click the link to approve before any information is submitted. Consent expires after 24 hours and can be revoked at any time. No data is shared without your explicit approval.",
  },
  {
    q: "Is my data protected?",
    a: "Yes. We comply with TCPA, CCPA/CPRA, and FCC 2025 regulations. Your data is encrypted, stored securely, and never sold to third parties. You can request complete deletion of your data at any time.",
  },
  {
    q: "What happens to my SGLI when I leave the military?",
    a: "SGLI coverage continues for 120 days after separation. You then have 240 days to convert to VGLI (Veterans' Group Life Insurance) without health evidence. However, VGLI rates increase every 5 years and is only temporary coverage, not permanent coverage. Many veterans find that private coverage with locked-in rates is more cost-effective long-term. We can help you compare both options.",
  },
  {
    q: "How much life insurance does a military family need?",
    a: "Financial advisors typically recommend 10-12 times your annual income in life insurance coverage. For military families, consider your BAH, base pay, special pay, and benefits that would stop if something happened. SGLI covers up to $500,000, but many families need additional coverage — especially those with mortgages, children, or a non-working spouse.",
  },
  {
    q: "Does Valor Legacies serve all 50 states?",
    a: "Yes. We serve all 50 states, the District of Columbia, and Puerto Rico. Coverage availability may vary by state and carrier, but our licensed professionals can find options in any state.",
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
