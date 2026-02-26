import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Frequently Asked Questions",
  description:
    "Common questions about Digital Cathedral, military life insurance options, SGLI alternatives, and how our free coverage review works.",
};

const FAQS = [
  {
    q: "Is this the same as SGLI?",
    a: "No. This is a review of additional or alternative life insurance options available outside standard military coverage. SGLI (Servicemembers' Group Life Insurance) is a separate program administered by the VA.",
  },
  {
    q: "Is this affiliated with the military or government?",
    a: "No. Digital Cathedral is independently operated and not affiliated with the U.S. Government, Department of Defense, or any branch of military service.",
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
    a: "No. Digital Cathedral is not an insurance company, agent, or broker. We do not sell insurance, provide quotes, or bind coverage. We connect consumers with licensed professionals.",
  },
  {
    q: "Who will contact me?",
    a: "A licensed insurance professional experienced in military-family coverage will review your information and reach out via phone or email.",
  },
];

export default function FaqPage() {
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
            Frequently Asked Questions
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Common questions about our free coverage review service.
          </p>
        </header>

        <div className="space-y-6">
          {FAQS.map((item) => (
            <div key={item.q} className="border-b border-navy-cathedral/8 pb-5">
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
            href="mailto:privacy@digital-cathedral.app"
            className="text-emerald-accent text-sm hover:underline"
          >
            Contact us
          </a>
        </div>

        <div className="text-center pt-4">
          <Link
            href="/"
            className="inline-block px-8 py-3 rounded-lg font-medium text-sm transition-all bg-emerald-accent text-white hover:bg-emerald-accent/90"
          >
            Start My Coverage Review
          </Link>
          <p className="text-xs text-[var(--text-muted)] mt-2">Takes less than 60 seconds.</p>
        </div>

        <footer className="pt-8 border-t border-emerald-accent/10 text-center">
          <nav className="flex gap-4 justify-center mb-3">
            <Link href="/about" className="text-emerald-accent/70 hover:text-emerald-accent text-xs">About</Link>
            <Link href="/privacy" className="text-emerald-accent/70 hover:text-emerald-accent text-xs">Privacy Policy</Link>
            <Link href="/terms" className="text-emerald-accent/70 hover:text-emerald-accent text-xs">Terms of Service</Link>
          </nav>
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Digital Cathedral. All rights reserved.
          </p>
        </footer>
      </article>
    </main>
  );
}
