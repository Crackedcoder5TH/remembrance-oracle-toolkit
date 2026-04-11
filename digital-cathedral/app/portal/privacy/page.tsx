import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Agent Portal Privacy Policy — Valor Legacies",
  description:
    "How Valor Legacies handles your data as a licensed insurance professional using our Agent Portal.",
};

export default function PortalPrivacyPage() {
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
          Agent Portal
        </div>
        <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
          Privacy Policy
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
            This Privacy Policy applies to licensed insurance professionals (&ldquo;Clients&rdquo;)
            who access the Valor Legacies Agent Portal to purchase and manage leads. This policy
            is separate from the{" "}
            <Link href="/privacy" className="text-teal-cathedral hover:underline">consumer-facing Privacy Policy</Link>,
            which governs data collected from individuals seeking insurance coverage.
          </p>
        </section>

        {/* 2. Data We Collect */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">2. Data We Collect</h2>
          <p className="mb-3">When you use the Agent Portal, we collect:</p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              <strong className="text-[var(--text-primary)]">Account information:</strong>{" "}
              Your name, email address, phone number, company name, and insurance license number.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Billing information:</strong>{" "}
              Payment method details are collected and processed directly by Stripe, Inc. (see Payment
              Processing below). We store only the last four digits, card brand, and billing history.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Usage data:</strong>{" "}
              Lead purchase history, filter preferences, login timestamps, and account activity.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Support communications:</strong>{" "}
              Any messages or requests you send to our support team.
            </li>
          </ul>
        </section>

        {/* 3. Payment Processing */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">3. Payment Processing</h2>
          <p className="mb-3">
            All payments are processed by{" "}
            <a
              href="https://stripe.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-cathedral hover:underline"
            >
              Stripe, Inc.
            </a>{" "}
            We <strong className="text-[var(--text-primary)]">never</strong> see,
            handle, or store your full credit card number, expiration date, or CVV.
            All payment data is collected directly by Stripe through their secure,
            PCI-DSS Level 1 compliant payment form embedded on our site.
          </p>
          <p className="mb-3">
            When you make a payment, Stripe may share the following with us:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>The last four digits of your card number</li>
            <li>Card brand (Visa, Mastercard, etc.)</li>
            <li>Payment amount and status (succeeded, failed)</li>
            <li>A unique transaction identifier</li>
          </ul>
          <p className="mt-3">
            This information is used solely to maintain your account balance and
            billing history. For details on how Stripe handles your payment data,
            see{" "}
            <a
              href="https://stripe.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-teal-cathedral hover:underline"
            >
              Stripe&apos;s Privacy Policy
            </a>
            .
          </p>
        </section>

        {/* 4. How We Use Your Data */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">4. How We Use Your Data</h2>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>To provide and manage your Agent Portal account.</li>
            <li>To process lead purchases and maintain your account balance.</li>
            <li>To deliver leads matching your configured filters.</li>
            <li>To communicate account-related updates, billing notices, and support responses.</li>
            <li>To prevent fraud and enforce our Terms of Service.</li>
            <li>To comply with legal obligations.</li>
          </ul>
        </section>

        {/* 5. Cookies & Tracking */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">5. Cookies &amp; Tracking</h2>
          <p className="mb-3">
            The Agent Portal uses only essential cookies and third-party services required for
            functionality:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              <strong className="text-[var(--text-primary)]">Authentication:</strong>{" "}
              Session cookies to keep you logged in.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Stripe:</strong>{" "}
              Our payment processor may set cookies to enable fraud detection and secure payment
              processing. See{" "}
              <a
                href="https://stripe.com/cookies-policy/legal"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-cathedral hover:underline"
              >
                Stripe&apos;s Cookie Policy
              </a>
              .
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Local storage:</strong>{" "}
              Used for UI preferences (e.g., theme). Not used for tracking.
            </li>
          </ul>
          <p>We do not use advertising pixels or retargeting cookies.</p>
        </section>

        {/* 6. Data Security */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">6. Data Security</h2>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>All connections are encrypted via HTTPS (TLS 1.2+).</li>
            <li>Authentication is enforced on all portal endpoints.</li>
            <li>Payment data is handled exclusively by Stripe (PCI-DSS Level 1).</li>
            <li>Rate limiting prevents abuse of login and API endpoints.</li>
          </ul>
        </section>

        {/* 7. Data Sharing */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">7. Data Sharing</h2>
          <p>
            We do not sell your account or billing data. Your information may be shared with:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2 mt-2">
            <li>
              <strong className="text-[var(--text-primary)]">Stripe:</strong>{" "}
              For payment processing.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Vercel:</strong>{" "}
              Hosting platform.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Law enforcement:</strong>{" "}
              When required by law, subpoena, or court order.
            </li>
          </ul>
        </section>

        {/* 8. Data Retention */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">8. Data Retention</h2>
          <p>
            Account and billing records are retained for the duration of your active account and
            for up to 7 years after account closure to comply with tax and financial record-keeping
            requirements. You may request account deletion by contacting us.
          </p>
        </section>

        {/* 9. Your Rights */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">9. Your Rights</h2>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>
              <strong className="text-[var(--text-primary)]">Access:</strong>{" "}
              Request a copy of all personal data we hold about your account.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Correction:</strong>{" "}
              Request correction of inaccurate account information.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Deletion:</strong>{" "}
              Request deletion of your account and associated data, subject to legal retention requirements.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Data portability:</strong>{" "}
              Request an export of your purchase history and account data.
            </li>
          </ul>
          <p className="mt-3">
            To exercise any of these rights, email{" "}
            <a href="mailto:valorlegacies@gmail.com" className="text-teal-cathedral hover:underline">
              valorlegacies@gmail.com
            </a>
            .
          </p>
        </section>

        {/* 10. Changes */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">10. Changes to This Policy</h2>
          <p>
            We may update this policy from time to time. The &ldquo;Last Updated&rdquo; date indicates
            the most recent revision. Continued use of the Agent Portal after changes constitutes
            acceptance of the updated policy.
          </p>
        </section>

        {/* 11. Contact */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">11. Contact Us</h2>
          <p>For privacy questions related to the Agent Portal, contact:</p>
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
          <a href="/portal" className="text-teal-cathedral/70 hover:text-teal-cathedral">Agent Portal</a>
          <a href="/portal/terms" className="text-teal-cathedral/70 hover:text-teal-cathedral">Portal Terms</a>
          <a href="/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral">Consumer Privacy</a>
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">Home</a>
        </nav>
        <p>&copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.</p>
      </footer>
    </main>
  );
}
