import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Refund Policy",
  description:
    "Valor Legacies refund policy for lead purchases and account balance funds.",
};

export default function RefundPolicyPage() {
  return (
    <main className="min-h-screen px-4 py-12 max-w-3xl mx-auto">
      <header className="mb-10">
        <Link
          href="/"
          className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
        >
          &larr; Back Home
        </Link>
        <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
          Refund Policy
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Last Updated: March 8, 2026 &mdash; Effective: March 8, 2026
        </p>
      </header>

      <div className="cathedral-surface p-6 md:p-8 space-y-8 text-sm text-[var(--text-muted)] leading-relaxed">
        {/* 1. Overview */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">1. Overview</h2>
          <p>
            This Refund Policy applies to licensed insurance professionals (&ldquo;Clients&rdquo;)
            who purchase leads through the Valor Legacies Client Portal. All payments are processed
            by Stripe, Inc. and are subject to the terms outlined below.
          </p>
        </section>

        {/* 2. Lead Refunds */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">2. Lead Refunds</h2>
          <p className="mb-3">
            We stand behind the quality of our leads. You may request a refund or account credit
            for a purchased lead under the following circumstances:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              <strong className="text-[var(--text-primary)]">Invalid contact information:</strong>{" "}
              The phone number or email address provided by the lead is incorrect, disconnected,
              or does not belong to the person named.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Duplicate lead:</strong>{" "}
              You received the same lead (same name and contact information) more than once
              and were charged for both.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Out-of-area lead:</strong>{" "}
              The lead falls outside the geographic coverage areas you specified in your
              account filters.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Fraudulent submission:</strong>{" "}
              The lead was submitted using clearly fake or bot-generated information.
            </li>
          </ul>
        </section>

        {/* 3. Refund Request Timeframe */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">3. Refund Request Timeframe</h2>
          <p>
            Refund requests for individual leads must be submitted within{" "}
            <strong className="text-[var(--text-primary)]">72 hours</strong> of the lead purchase.
            Requests submitted after 72 hours will be reviewed on a case-by-case basis but are
            not guaranteed.
          </p>
        </section>

        {/* 4. How to Request a Refund */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">4. How to Request a Refund</h2>
          <p className="mb-3">To request a refund, email us at:</p>
          <div className="p-4 bg-[var(--bg-surface)] rounded-lg border border-indigo-cathedral/10 mb-3">
            <p>
              <a
                href="mailto:valorlegacies@gmail.com"
                className="text-teal-cathedral hover:underline"
              >
                valorlegacies@gmail.com
              </a>
            </p>
            <p className="mt-1 text-xs">Subject line: &ldquo;Refund Request &mdash; [Your Account Name]&rdquo;</p>
          </div>
          <p>Please include:</p>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li>Your account name or email</li>
            <li>The lead ID(s) in question</li>
            <li>The reason for the refund request</li>
            <li>Any supporting evidence (e.g., screenshot of disconnected number)</li>
          </ul>
        </section>

        {/* 5. Refund Processing */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">5. Refund Processing</h2>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              Refund requests are reviewed within{" "}
              <strong className="text-[var(--text-primary)]">5 business days</strong>.
            </li>
            <li>
              Approved refunds are issued as an{" "}
              <strong className="text-[var(--text-primary)]">account credit</strong> by default,
              added back to your Client Portal balance.
            </li>
            <li>
              If you prefer a refund to your original payment method, please specify this in your
              request. Card refunds are processed via Stripe and may take 5&ndash;10 business days
              to appear on your statement.
            </li>
          </ul>
        </section>

        {/* 6. Account Balance Refunds */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">6. Account Balance Refunds</h2>
          <p className="mb-3">
            If you wish to withdraw unused funds from your account balance:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              Email{" "}
              <a
                href="mailto:valorlegacies@gmail.com"
                className="text-teal-cathedral hover:underline"
              >
                valorlegacies@gmail.com
              </a>{" "}
              with the subject &ldquo;Balance Withdrawal Request.&rdquo;
            </li>
            <li>
              Unused balance refunds are processed to your original payment method via Stripe.
            </li>
            <li>
              Refunds may take 5&ndash;10 business days to appear on your statement after processing.
            </li>
            <li>
              We reserve the right to deduct the value of any leads already purchased from
              the refund amount.
            </li>
          </ul>
        </section>

        {/* 7. Non-Refundable Items */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">7. Non-Refundable Items</h2>
          <p className="mb-3">The following are not eligible for refunds:</p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>Leads where the consumer was successfully contacted but did not convert to a sale.</li>
            <li>Leads where the consumer changed their mind after initial contact.</li>
            <li>Leads that were not contacted within the first 48 hours of purchase.</li>
            <li>Disputes filed more than 30 days after the original purchase.</li>
          </ul>
        </section>

        {/* 8. Chargebacks */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">8. Chargebacks</h2>
          <p>
            We encourage you to contact us directly before filing a chargeback with your card
            issuer. Filing a chargeback without first attempting to resolve the issue with us may
            result in account suspension. We will cooperate fully with any legitimate dispute
            resolution process.
          </p>
        </section>

        {/* 9. Changes */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">9. Changes to This Policy</h2>
          <p>
            We may update this Refund Policy from time to time. The &ldquo;Last Updated&rdquo;
            date indicates the most recent revision. Continued use of the Client Portal after
            changes constitutes acceptance of the updated policy.
          </p>
        </section>

        {/* 10. Contact */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">10. Contact Us</h2>
          <p>For refund questions or requests, contact us at:</p>
          <div className="mt-3 p-4 bg-[var(--bg-surface)] rounded-lg border border-indigo-cathedral/10">
            <p>Valor Legacies</p>
            <p>
              Email:{" "}
              <a
                href="mailto:valorlegacies@gmail.com"
                className="text-teal-cathedral hover:underline"
              >
                valorlegacies@gmail.com
              </a>
            </p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--text-muted)] space-y-2">
        <nav className="flex gap-4 justify-center">
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">Get Protected</a>
          <a href="/terms" className="text-teal-cathedral/70 hover:text-teal-cathedral">Terms of Service</a>
          <a href="/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral">Privacy Policy</a>
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">Home</a>
        </nav>
        <p>&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
      </footer>
    </main>
  );
}
