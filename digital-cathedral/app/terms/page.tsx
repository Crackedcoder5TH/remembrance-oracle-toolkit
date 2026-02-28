import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Terms of Service — Digital Cathedral",
  description: "Terms and conditions governing use of the Digital Cathedral website.",
};

export default function TermsPage() {
  return (
    <main className="min-h-screen px-4 py-12 max-w-3xl mx-auto">
      <header className="mb-10">
        <div className="text-teal-cathedral text-sm tracking-[0.3em] uppercase mb-3 pulse-gentle">
          Terms of Service
        </div>
        <h1 className="text-3xl font-light text-[var(--text-primary)] mb-2">
          Terms of Service
        </h1>
        <p className="text-sm text-[var(--text-muted)]">
          Last Updated: February 25, 2026 &mdash; Effective: February 25, 2026
        </p>
      </header>

      <div className="cathedral-surface p-6 md:p-8 space-y-8 text-sm text-[var(--text-muted)] leading-relaxed">
        {/* 1. Agreement */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">1. Agreement to Terms</h2>
          <p>
            By accessing or using the website located at https://digital-cathedral.vercel.app (the &ldquo;Site&rdquo;),
            operated by Digital Cathedral (&ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;),
            you agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree
            to these Terms, do not use the Site.
          </p>
        </section>

        {/* 2. Nature of Service */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">2. Nature of Our Service</h2>
          <p className="mb-3">
            <strong className="text-[var(--text-primary)]">We are NOT an insurance company, insurance agent, or insurance broker.</strong>
          </p>
          <p className="mb-3">
            Our Site provides a platform for consumers to express interest in learning about life insurance
            options. When you submit your information through our form, we connect you with one or more
            licensed insurance professionals who may contact you to discuss coverage options.
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>We do not provide insurance quotes.</li>
            <li>We do not sell, negotiate, or bind insurance coverage.</li>
            <li>We do not make recommendations about specific insurance products, coverage amounts, or carriers.</li>
            <li>We do not guarantee any specific rates, coverage availability, or underwriting outcomes.</li>
            <li>Any insurance products offered by licensed professionals are subject to the terms and conditions of the applicable insurance company.</li>
          </ul>
        </section>

        {/* 3. Eligibility */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">3. Eligibility</h2>
          <p>
            You must be at least 18 years of age and a resident of the United States to use our Site and
            submit information through our lead form. By using the Site, you represent and warrant that
            you meet these eligibility requirements.
          </p>
        </section>

        {/* 4. Information You Provide */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">4. Information You Provide</h2>
          <p>
            You agree to provide accurate, current, and complete information when submitting our form. You
            are solely responsible for the accuracy of the information you provide. Submitting false,
            misleading, or fraudulent information is prohibited and may result in legal action.
          </p>
        </section>

        {/* 5. Communications Consent */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">5. Communications Consent</h2>
          <p className="mb-3">
            By checking the TCPA consent checkbox and submitting our form, you provide your prior express
            written consent for the specific company identified in the consent disclosure to contact you
            at the phone number and/or email address you provided. This may include:
          </p>
          <ul className="list-disc list-inside space-y-1 ml-2">
            <li>Phone calls, including calls made using an automatic telephone dialing system or prerecorded voice.</li>
            <li>Text messages (SMS/MMS).</li>
            <li>Email communications.</li>
          </ul>
          <p className="mt-3">
            <strong className="text-[var(--text-primary)]">This consent is not a condition of purchasing any product or service.</strong> You
            may revoke consent at any time by contacting us at privacy@digital-cathedral.app, replying STOP to any text
            message, or using the opt-out mechanism in any email. Standard message and data rates may apply.
          </p>
        </section>

        {/* 6. Third-Party Relationships */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">6. Third-Party Relationships</h2>
          <p>
            Licensed insurance professionals who contact you are independent third parties, not employees
            or agents of Digital Cathedral. We are not responsible for their actions, advice, products, or
            services. Any contract or agreement you enter into with an insurance professional or carrier
            is solely between you and that party.
          </p>
        </section>

        {/* 7. No Guarantees */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">7. No Guarantees</h2>
          <p>
            We make no guarantees that: (a) you will be contacted by a licensed professional; (b) you will
            qualify for any insurance product; (c) any specific rates or premiums will be available to you;
            or (d) coverage will be offered in your state. Insurance availability, rates, and terms vary
            by state, carrier, and individual circumstances.
          </p>
        </section>

        {/* 8. Intellectual Property */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">8. Intellectual Property</h2>
          <p>
            All content on this Site, including text, graphics, logos, and software, is the property of
            Digital Cathedral or its licensors and is protected by applicable intellectual property laws.
            You may not reproduce, distribute, or create derivative works from our content without our
            prior written permission.
          </p>
        </section>

        {/* 9. Disclaimer of Warranties */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">9. Disclaimer of Warranties</h2>
          <p>
            THE SITE IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE&rdquo; WITHOUT WARRANTIES
            OF ANY KIND, EITHER EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO IMPLIED WARRANTIES OF
            MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT WARRANT
            THAT THE SITE WILL BE UNINTERRUPTED, ERROR-FREE, OR SECURE.
          </p>
        </section>

        {/* 10. Limitation of Liability */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">10. Limitation of Liability</h2>
          <p>
            TO THE MAXIMUM EXTENT PERMITTED BY LAW, DIGITAL CATHEDRAL SHALL NOT BE LIABLE FOR ANY INDIRECT,
            INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES ARISING OUT OF OR RELATED TO YOUR
            USE OF THE SITE OR ANY INSURANCE PRODUCTS OR SERVICES OBTAINED THROUGH PROFESSIONALS
            CONNECTED VIA THE SITE. OUR TOTAL LIABILITY SHALL NOT EXCEED ONE HUNDRED DOLLARS ($100).
          </p>
        </section>

        {/* 11. Indemnification */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">11. Indemnification</h2>
          <p>
            You agree to indemnify and hold harmless Digital Cathedral, its officers, directors, employees,
            and agents from any claims, losses, damages, liabilities, and expenses (including reasonable
            attorneys&rsquo; fees) arising from your use of the Site, your submission of information,
            or your violation of these Terms.
          </p>
        </section>

        {/* 12. Governing Law */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">12. Governing Law & Disputes</h2>
          <p>
            These Terms are governed by the laws of the State of California, without regard to conflict of
            law principles. Any disputes arising from these Terms or your use of the Site shall be
            resolved through binding arbitration in San Francisco, California in accordance with the rules of the
            American Arbitration Association, except that either party may seek injunctive relief in
            any court of competent jurisdiction.
          </p>
        </section>

        {/* 13. Changes */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">13. Changes to These Terms</h2>
          <p>
            We may modify these Terms at any time. The &ldquo;Last Updated&rdquo; date indicates the most
            recent revision. Your continued use of the Site after changes constitutes acceptance of the
            revised Terms.
          </p>
        </section>

        {/* 14. Contact */}
        <section>
          <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-3">14. Contact Us</h2>
          <p>
            For questions about these Terms, contact us at:
          </p>
          <div className="mt-3 p-4 bg-[var(--bg-surface)] rounded-lg border border-indigo-cathedral/10">
            <p>Digital Cathedral</p>
            <p>Email: legal@digital-cathedral.app</p>
          </div>
        </section>
      </div>

      {/* Footer */}
      <footer className="mt-12 text-center text-xs text-[var(--text-muted)] space-y-2">
        <nav className="flex gap-4 justify-center">
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">Get Protected</a>
          <a href="/privacy" className="text-teal-cathedral/70 hover:text-teal-cathedral">Privacy Policy</a>
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">Home</a>
        </nav>
        <p>&copy; {new Date().getFullYear()} Digital Cathedral. All rights reserved.</p>
      </footer>
    </main>
  );
}
