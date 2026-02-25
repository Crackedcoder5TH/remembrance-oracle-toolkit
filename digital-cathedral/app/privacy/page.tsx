import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy — [Company Name]",
  description: "How we collect, use, and protect your personal information.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen px-4 py-12 max-w-3xl mx-auto">
      <header className="mb-10">
        <div className="text-emerald-accent text-sm tracking-[0.3em] uppercase mb-3 pulse-gentle">
          Privacy Covenant
        </div>
        <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
          Privacy Policy
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Last Updated: February 25, 2026 &mdash; Effective: February 25, 2026
        </p>
      </header>

      <div className="cathedral-surface p-6 md:p-8 space-y-8 text-sm text-[var(--text-muted)] leading-relaxed">
        {/* 1. Introduction */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">1. Introduction</h2>
          <p>
            [Company Name] (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;) operates the website
            located at [website URL] (the &ldquo;Site&rdquo;). This Privacy Policy explains how we collect,
            use, disclose, and protect your personal information when you visit our Site and submit
            information through our lead form. We are not an insurance company, insurance agent, or
            insurance broker. We connect consumers with licensed insurance professionals.
          </p>
        </section>

        {/* 2. Information We Collect */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">2. Information We Collect</h2>
          <p className="mb-3">We collect the following categories of personal information:</p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li><strong className="text-[var(--text-primary)]">Identifiers:</strong> First name, last name, email address, phone number, state of residence.</li>
            <li><strong className="text-[var(--text-primary)]">Insurance Interest:</strong> General type of life insurance coverage you are interested in.</li>
            <li><strong className="text-[var(--text-primary)]">Consent Records:</strong> Timestamp, IP address, user agent, page URL, and the consent text you agreed to at the time of submission.</li>
            <li><strong className="text-[var(--text-primary)]">Device/Usage Data:</strong> IP address, browser type, operating system, referring URL, pages viewed, and dates/times of access (collected automatically).</li>
          </ul>
        </section>

        {/* 3. How We Use Your Information */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">3. How We Use Your Information</h2>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li>To connect you with licensed insurance professionals who may contact you about life insurance products.</li>
            <li>To respond to your inquiries and fulfill your requests.</li>
            <li>To comply with legal obligations, including maintaining records of consent as required by the TCPA and FCC regulations.</li>
            <li>To improve our Site and services.</li>
            <li>To detect and prevent fraud or abuse.</li>
          </ul>
        </section>

        {/* 4. How We Share Your Information */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">4. How We Share Your Information</h2>
          <p className="mb-3">
            We may share your personal information with the following categories of third parties:
          </p>
          <ul className="list-disc list-inside space-y-2 ml-2">
            <li><strong className="text-[var(--text-primary)]">Licensed Insurance Professionals:</strong> Your contact information and coverage interest are shared with licensed insurance agents and/or carriers who may contact you about life insurance products. We only share your information with the specific company or companies you consented to at the time of form submission.</li>
            <li><strong className="text-[var(--text-primary)]">Service Providers:</strong> Companies that help us operate our Site (hosting, analytics, email delivery) under contractual obligations to protect your data.</li>
            <li><strong className="text-[var(--text-primary)]">Legal Compliance:</strong> When required by law, court order, or governmental authority.</li>
          </ul>
          <p className="mt-3">
            <strong className="text-[var(--text-primary)]">Note:</strong> Sharing your information with licensed insurance
            professionals for compensation may constitute a &ldquo;sale&rdquo; or &ldquo;sharing&rdquo; of personal
            information under certain state privacy laws (including the California Consumer Privacy Act).
            See Section 7 below for your opt-out rights.
          </p>
        </section>

        {/* 5. Data Retention */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">5. Data Retention</h2>
          <p>
            We retain your personal information for as long as necessary to fulfill the purposes described
            in this Policy. Consent records are retained for a minimum of 5 years to comply with TCPA
            requirements. You may request deletion of your personal information at any time (see Section 7),
            subject to our legal retention obligations.
          </p>
        </section>

        {/* 6. Data Security */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">6. Data Security</h2>
          <p>
            We implement reasonable administrative, technical, and physical safeguards to protect your
            personal information, including encryption of data in transit (TLS/SSL), access controls,
            and regular security assessments. No method of transmission or storage is 100% secure, and
            we cannot guarantee absolute security.
          </p>
        </section>

        {/* 7. Your Privacy Rights */}
        <section id="do-not-sell">
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">7. Your Privacy Rights</h2>
          <p className="mb-3">
            Depending on your state of residence, you may have the following rights:
          </p>

          <h3 className="font-semibold text-[var(--text-primary)] mt-4 mb-2">California Residents (CCPA/CPRA)</h3>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li><strong>Right to Know:</strong> Request what personal information we have collected about you.</li>
            <li><strong>Right to Delete:</strong> Request deletion of your personal information.</li>
            <li><strong>Right to Correct:</strong> Request correction of inaccurate information.</li>
            <li><strong>Right to Opt Out of Sale/Sharing:</strong> You may opt out of the sale or sharing of your personal information.</li>
            <li><strong>Right to Non-Discrimination:</strong> We will not discriminate against you for exercising your rights.</li>
          </ul>

          <h3 className="font-semibold text-[var(--text-primary)] mt-4 mb-2">
            Do Not Sell or Share My Personal Information
          </h3>
          <p>
            To opt out of the sale or sharing of your personal information, please contact us at
            [privacy@company.com] with the subject line &ldquo;Do Not Sell or Share.&rdquo; We will process
            your request within 15 business days.
          </p>

          <h3 className="font-semibold text-[var(--text-primary)] mt-4 mb-2">Other State Privacy Laws</h3>
          <p>
            Residents of Virginia, Colorado, Connecticut, Texas, Oregon, Montana, and other states
            with comprehensive privacy laws may have similar rights including the right to access,
            delete, correct, and opt out of the sale of personal data and targeted advertising. To
            exercise any of these rights, contact us at [privacy@company.com].
          </p>
        </section>

        {/* 8. TCPA & Communications */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">8. Telephone & Text Communications</h2>
          <p className="mb-3">
            If you provide your phone number and consent on our form, you agree to receive calls and/or
            text messages from the specific company identified in the consent disclosure. This consent
            complies with the FCC&rsquo;s one-to-one consent rule (effective January 27, 2025).
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Consent is not a condition of purchasing any product or service.</li>
            <li>You may revoke consent at any time by contacting us at [phone/email] or replying STOP to any text message.</li>
            <li>Message and data rates may apply.</li>
            <li>Call frequency may vary.</li>
          </ul>
        </section>

        {/* 9. Cookies */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">9. Cookies & Tracking Technologies</h2>
          <p>
            Our Site may use cookies, web beacons, and similar technologies to improve your experience
            and analyze traffic. You can control cookies through your browser settings. Disabling cookies
            may affect Site functionality.
          </p>
        </section>

        {/* 10. Children */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">10. Children&rsquo;s Privacy</h2>
          <p>
            Our Site is not directed to individuals under the age of 18. We do not knowingly collect
            personal information from children. If you believe we have collected information from a
            minor, please contact us immediately.
          </p>
        </section>

        {/* 11. Changes */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">11. Changes to This Policy</h2>
          <p>
            We may update this Privacy Policy from time to time. The &ldquo;Last Updated&rdquo; date at
            the top of this page indicates when the most recent changes were made. We encourage you to
            review this Policy periodically.
          </p>
        </section>

        {/* 12. Contact */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">12. Contact Us</h2>
          <p>
            If you have questions about this Privacy Policy or wish to exercise your privacy rights,
            contact us at:
          </p>
          <div className="mt-3 p-4 bg-soft-gray rounded-lg border border-navy-cathedral/10">
            <p>[Company Name]</p>
            <p>[Physical Address]</p>
            <p>Email: [privacy@company.com]</p>
            <p>Phone: [phone number]</p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--text-muted)] space-y-2">
        <nav className="flex gap-4 justify-center">
          <a href="/protect" className="text-emerald-accent/70 hover:text-emerald-accent">Get Protected</a>
          <a href="/terms" className="text-emerald-accent/70 hover:text-emerald-accent">Terms of Service</a>
          <a href="/" className="text-emerald-accent/70 hover:text-emerald-accent">Home</a>
        </nav>
        <p>The kingdom protects what matters. Remember.</p>
      </footer>
    </main>
  );
}
