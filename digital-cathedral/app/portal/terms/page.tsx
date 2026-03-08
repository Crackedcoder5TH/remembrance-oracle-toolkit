import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Client Portal Terms of Service — Valor Legacies",
  description:
    "Terms governing use of the Valor Legacies Client Portal, including lead purchases, payments, and refunds.",
};

export default function PortalTermsPage() {
  return (
    <main className="min-h-screen px-4 py-12 max-w-3xl mx-auto">
      <header className="mb-10">
        <Link
          href="/portal"
          className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
        >
          &larr; Back to Portal
        </Link>
        <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-3 pulse-gentle">
          Client Portal
        </div>
        <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Last Updated: March 8, 2026 &mdash; Effective: March 8, 2026
        </p>
      </header>

      <div className="cathedral-surface p-6 md:p-8 space-y-8 text-sm text-[var(--text-muted)] leading-relaxed">
        {/* 1. Agreement */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">1. Agreement to Terms</h2>
          <p>
            By accessing or using the Valor Legacies Client Portal (&ldquo;Portal&rdquo;),
            you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). These Terms
            are in addition to our{" "}
            <Link href="/terms" className="text-teal-cathedral hover:underline">general Terms of Service</Link>.
            If you do not agree to these Terms, do not use the Portal.
          </p>
        </section>

        {/* 2. Eligibility */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">2. Eligibility</h2>
          <p>
            The Client Portal is available only to licensed insurance professionals who have been
            approved for an account. By using the Portal, you represent and warrant that you hold
            a valid, active insurance license in the state(s) where you operate and that all account
            information you provide is accurate and current.
          </p>
        </section>

        {/* 3. Account Responsibilities */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">3. Account Responsibilities</h2>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>You are responsible for maintaining the confidentiality of your login credentials.</li>
            <li>You must notify us immediately if you suspect unauthorized access to your account.</li>
            <li>You may not share your account or login credentials with any other person or entity.</li>
            <li>You are responsible for all activity that occurs under your account.</li>
          </ul>
        </section>

        {/* 4. Lead Purchases */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">4. Lead Purchases</h2>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>You must maintain a positive account balance to purchase leads.</li>
            <li>
              Leads are sold as <strong className="text-[var(--text-primary)]">shared</strong> (delivered
              to multiple clients) or <strong className="text-[var(--text-primary)]">exclusive</strong> (delivered
              only to you), depending on the purchase option selected.
            </li>
            <li>Lead pricing is determined by your account tier and may change with 30 days&rsquo; notice.</li>
            <li>Leads are delivered based on your configured geographic and coverage type filters.</li>
            <li>Once a lead is purchased and contact information is revealed, the purchase is final,
              subject to the refund conditions in Section 7.</li>
          </ul>
        </section>

        {/* 5. Lead Usage Restrictions */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">5. Lead Usage Restrictions</h2>
          <p className="mb-3">You agree that you will NOT:</p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>Resell, redistribute, or share leads obtained through the Portal.</li>
            <li>Use lead contact information for any purpose other than offering insurance products.</li>
            <li>Contact leads using deceptive, harassing, or unlawful methods.</li>
            <li>Violate TCPA, CAN-SPAM, or any applicable telemarketing and communication laws when contacting leads.</li>
          </ul>
          <p className="mt-3">
            Violation of these restrictions may result in immediate account termination without refund.
          </p>
        </section>

        {/* 6. Payments & Billing */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">6. Payments &amp; Billing</h2>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>All payments are processed securely by Stripe, Inc. We never store your full card details.</li>
            <li>Funds added to your account balance are applied immediately upon successful payment.</li>
            <li>Account balances are non-transferable between accounts.</li>
            <li>
              You may view your complete billing history and current balance in the Portal&apos;s
              Billing tab.
            </li>
          </ul>
          <p className="mt-3">
            For details on how your payment data is handled, see our{" "}
            <Link href="/portal/privacy" className="text-teal-cathedral hover:underline">
              Client Portal Privacy Policy
            </Link>
            .
          </p>
        </section>

        {/* 7. Refunds & Disputes */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">7. Refunds &amp; Disputes</h2>
          <p className="mb-3">
            You may request a refund or account credit for a purchased lead under the following
            circumstances:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              <strong className="text-[var(--text-primary)]">Invalid contact information:</strong>{" "}
              The phone number or email provided is incorrect, disconnected, or does not belong to the named person.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Duplicate lead:</strong>{" "}
              You received and were charged for the same lead (same name and contact) more than once.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Out-of-area:</strong>{" "}
              The lead falls outside your configured geographic filters.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Fraudulent submission:</strong>{" "}
              The lead was clearly fake or bot-generated.
            </li>
          </ul>

          <h3 className="text-base font-semibold text-[var(--text-primary)] mt-6 mb-2">Refund Process</h3>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              Requests must be submitted within{" "}
              <strong className="text-[var(--text-primary)]">72 hours</strong> of lead purchase.
            </li>
            <li>
              Email{" "}
              <a href="mailto:valorlegacies@gmail.com" className="text-teal-cathedral hover:underline">
                valorlegacies@gmail.com
              </a>{" "}
              with the subject &ldquo;Lead Dispute — [Your Account Name].&rdquo;
            </li>
            <li>Include the lead ID(s), reason, and any supporting evidence.</li>
            <li>Requests are reviewed within 5 business days.</li>
            <li>Approved refunds are issued as an account credit by default, or to your original
              payment method upon request (5–10 business days via Stripe).</li>
          </ul>

          <h3 className="text-base font-semibold text-[var(--text-primary)] mt-6 mb-2">Non-Refundable</h3>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>Leads where the consumer was contacted but did not convert.</li>
            <li>Leads where the consumer changed their mind after initial contact.</li>
            <li>Leads not contacted within 48 hours of purchase.</li>
            <li>Disputes filed more than 30 days after purchase.</li>
          </ul>

          <h3 className="text-base font-semibold text-[var(--text-primary)] mt-6 mb-2">Account Balance Withdrawals</h3>
          <p>
            Unused account balance funds may be withdrawn by emailing{" "}
            <a href="mailto:valorlegacies@gmail.com" className="text-teal-cathedral hover:underline">
              valorlegacies@gmail.com
            </a>{" "}
            with the subject &ldquo;Balance Withdrawal Request.&rdquo; Withdrawals are processed
            to your original payment method via Stripe and may take 5–10 business days. The value of
            any leads already purchased will be deducted from the refund amount.
          </p>

          <h3 className="text-base font-semibold text-[var(--text-primary)] mt-6 mb-2">Chargebacks</h3>
          <p>
            We encourage you to contact us directly before filing a chargeback with your card issuer.
            Filing a chargeback without first attempting to resolve the issue with us may result in
            account suspension.
          </p>
        </section>

        {/* 8. Account Suspension & Termination */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">8. Account Suspension &amp; Termination</h2>
          <p className="mb-3">We may suspend or terminate your account if:</p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>You violate these Terms or any applicable law.</li>
            <li>Your insurance license is revoked, suspended, or expires.</li>
            <li>You engage in abusive refund or chargeback behavior.</li>
            <li>You misuse lead data or contact leads in an unlawful manner.</li>
          </ul>
          <p className="mt-3">
            Upon termination, unused account balance (less the value of purchased leads) may be
            refunded at our discretion.
          </p>
        </section>

        {/* 9. Intellectual Property */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">9. Intellectual Property</h2>
          <p>
            All content in the Portal, including its design, software, and data presentation, is the
            property of Valor Legacies. Lead data is licensed to you solely for the purpose of offering
            insurance products to the named individuals. You acquire no ownership rights in any lead data.
          </p>
        </section>

        {/* 10. Disclaimer of Warranties */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">10. Disclaimer of Warranties</h2>
          <p>
            THE PORTAL AND LEADS ARE PROVIDED &ldquo;AS IS.&rdquo; WE DO NOT GUARANTEE THAT ANY LEAD
            WILL RESULT IN A SALE, THAT ALL LEADS WILL BE VALID, OR THAT THE PORTAL WILL BE
            UNINTERRUPTED OR ERROR-FREE. LEAD QUALITY MAY VARY.
          </p>
        </section>

        {/* 11. Limitation of Liability */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">11. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, VALOR LEGACIES SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF YOUR USE OF THE
            PORTAL OR ANY LEADS PURCHASED. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID
            FOR LEADS IN THE PRECEDING 30 DAYS.
          </p>
        </section>

        {/* 12. Governing Law */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">12. Governing Law &amp; Disputes</h2>
          <p>
            These Terms are governed by the laws of the State of California, without regard to conflict of
            law principles. Any disputes shall be resolved through binding arbitration in San Francisco,
            California in accordance with the rules of the American Arbitration Association.
          </p>
        </section>

        {/* 13. Changes */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">13. Changes to These Terms</h2>
          <p>
            We may modify these Terms at any time. The &ldquo;Last Updated&rdquo; date indicates the most
            recent revision. Continued use of the Portal after changes constitutes acceptance. We will
            notify active clients of material changes via email.
          </p>
        </section>

        {/* 14. Contact */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">14. Contact Us</h2>
          <p>For questions about these Portal Terms, contact:</p>
          <div className="mt-3 p-4 bg-[var(--bg-surface)] rounded-lg border border-indigo-cathedral/10">
            <p>Valor Legacies</p>
            <p>
              Email:{" "}
              <a href="mailto:valorlegacies@gmail.com" className="text-teal-cathedral hover:underline">
                valorlegacies@gmail.com
              </a>
            </p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--text-muted)] space-y-2">
        <nav className="flex gap-4 justify-center">
          <a href="/portal" className="text-teal-cathedral/70 hover:text-teal-cathedral">Client Portal</a>
          <a href="/portal/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral">Portal Privacy</a>
          <a href="/terms" className="text-teal-cathedral/70 hover:text-teal-cathedral">Consumer Terms</a>
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">Home</a>
        </nav>
        <p>&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
      </footer>
    </main>
  );
}
