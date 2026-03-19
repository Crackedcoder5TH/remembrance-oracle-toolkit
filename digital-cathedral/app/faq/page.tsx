import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Common questions about Valor Legacies, military life insurance options, SGLI alternatives, and how our free coverage review works.",
};

const FAQS = [
  {
    q: "What is the best life insurance for veterans?",
    a: "The best life insurance for veterans depends on your needs. Term life is ideal for mortgage protection and income replacement. Whole life works well for final expense and legacy planning. Indexed Universal Life (IUL) offers retirement savings with life insurance protection. A licensed professional can help you compare options based on your service history, age, and family situation.",
  },
  {
    q: "Is this the same as SGLI?",
    a: "No. This is additional or alternative life insurance options available outside standard military coverage. SGLI (Servicemembers' Group Life Insurance) is a separate program supervised by the U.S. Department of Veterans Affairs (VA) and administered by the Prudential Insurance Company of America.",
  },
  {
    q: "Is this affiliated with the military or government?",
    a: "No. Valor Legacies is independently operated and not affiliated with the U.S. Government, Department of Defense, or any branch of military service.",
  },
  {
    q: "Is there any obligation to purchase?",
    a: "No. Requesting a review simply connects you with a licensed professional to explore your options. There is no obligation, no pressure, and no cost for the consultation.",
  },
  {
    q: "Are veterans eligible?",
    a: "Yes. Many life insurance options are available for veterans, including those who have fully separated from service. Options vary by state and individual eligibility.",
  },
  {
    q: "How long does the process take?",
    a: "The form takes less than 60 seconds. After you submit, a licensed insurance professional will typically reach out within 1 business day.",
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
    a: "A licensed insurance professional experienced in military-family coverage will review your information and reach out via phone or email.",
  },
  {
    q: "What types of coverage can I explore?",
    a: "You can explore mortgage protection, final expense (burial/funeral), income replacement, retirement savings (IUL), guaranteed income (annuity), and legacy/wealth transfer options. If you're not sure, a licensed professional will help determine the best fit.",
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
    a: "SGLI coverage continues for 120 days after separation at no cost. You then have 240 days to convert to VGLI (Veterans' Group Life Insurance) without health evidence. However, VGLI rates increase every 5 years. Many veterans find that private coverage with locked-in rates is more cost-effective long-term. We can help you compare both options.",
  },
  {
    q: "Can I get life insurance with a VA disability rating?",
    a: "Yes. Veterans with service-connected disabilities have several options. Guaranteed issue policies require no medical exam or health questions. You may also be eligible for S-DVI (Service-Disabled Veterans' Insurance) through the VA. A licensed professional can help you find the most affordable coverage for your situation.",
  },
  {
    q: "How much life insurance does a military family need?",
    a: "Financial advisors typically recommend 10-12 times your annual income in life insurance coverage. For military families, consider your BAH, base pay, special pay, and benefits that would stop if something happened. SGLI covers up to $400,000, but many families need additional coverage — especially those with mortgages, children, or a non-working spouse.",
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
            Common questions about our free coverage review service.
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
            <Link href="/resources" className="text-teal-cathedral/70 hover:text-teal-cathedral text-xs">Resources</Link>
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
