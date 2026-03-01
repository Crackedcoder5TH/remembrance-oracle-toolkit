import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Valor Legacies privacy policy — how we handle your data with transparency and respect.",
};

export default function PrivacyPage() {
  return (
    <main className="min-h-screen flex flex-col items-center px-4 py-12">
      <article className="w-full max-w-2xl space-y-8">
        <header>
          <Link
            href="/"
            className="text-teal-cathedral text-xs tracking-[0.2em] uppercase mb-6 inline-block hover:opacity-80 transition-opacity"
          >
            &larr; Back Home
          </Link>
          <h1 className="text-2xl sm:text-3xl font-light text-[var(--text-primary)] mb-2">
            Privacy Policy
          </h1>
          <p className="text-sm text-[var(--text-muted)]">
            Last updated: February 2026
          </p>
        </header>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Overview
          </h2>
          <p>
            Valor Legacies is a veteran-founded lead generation service that
            connects military families with licensed insurance professionals. We
            respect your privacy and are committed to transparency about how your
            data is handled. This policy explains what data we collect, how we
            use it, and your rights.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Data We Collect
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong className="text-[var(--text-primary)]">
                Form submissions:
              </strong>{" "}
              When you submit a coverage review request, we collect your name,
              date of birth, email, phone number, state, coverage interest,
              veteran status, and military branch (if applicable).
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                Consent records:
              </strong>{" "}
              We record your TCPA consent, privacy consent, the timestamp of
              consent, your IP address, and user agent for compliance purposes.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                UTM parameters:
              </strong>{" "}
              If you arrive via a marketing link, we may capture UTM tracking
              parameters (source, medium, campaign) to understand how you found
              us.
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            How We Use Your Data
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              To connect you with a licensed insurance professional who can
              review your coverage options.
            </li>
            <li>
              To send you a confirmation email acknowledging your request.
            </li>
            <li>
              To comply with legal requirements, including TCPA consent records.
            </li>
            <li>
              To improve our service through aggregate, anonymized analytics.
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Data Sharing
          </h2>
          <p>
            Your contact information is shared with one or more licensed
            insurance professionals who may contact you regarding your coverage
            review request. We do not sell your data to data brokers, advertisers,
            or other third parties unrelated to your insurance inquiry.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Cookies &amp; Tracking
          </h2>
          <p>
            Valor Legacies does <strong className="text-[var(--text-primary)]">not</strong> use
            third-party cookies or advertising pixels. We do not use Google
            Analytics, Facebook Pixel, or any similar tracking service.
          </p>
          <p>
            The only client-side storage used is <code>localStorage</code> for
            functional preferences such as theme. These are not used for tracking.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Data Security
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>All connections are encrypted via HTTPS (TLS 1.2+)</li>
            <li>
              HTTP Strict Transport Security (HSTS) is enforced with a 1-year
              max-age
            </li>
            <li>
              Content Security Policy (CSP) restricts script and resource loading
            </li>
            <li>
              X-Frame-Options: DENY prevents clickjacking attacks
            </li>
            <li>
              CSRF tokens protect form submissions from cross-site attacks
            </li>
            <li>
              Rate limiting prevents abuse of submission endpoints
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Data Retention
          </h2>
          <p>
            Lead records are retained for the duration necessary to fulfill your
            coverage review request and to comply with legal obligations. You may
            request deletion at any time (see Your Rights below).
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Your Rights
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong className="text-[var(--text-primary)]">Access:</strong>{" "}
              You may request a copy of the personal information we hold about
              you.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Delete:</strong>{" "}
              You may request deletion of all personal data associated with your
              email address. We process deletion requests within 15 business days.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Correct:</strong>{" "}
              You may request correction of inaccurate personal information.
            </li>
          </ul>
          <p>
            To exercise any of these rights, email{" "}
            <a
              href="mailto:privacy@digital-cathedral.app"
              className="text-teal-cathedral hover:underline"
            >
              privacy@digital-cathedral.app
            </a>
            .
          </p>
        </section>

        <section id="do-not-sell" className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Do Not Sell or Share My Personal Information
          </h2>
          <p>
            If you submitted information through our{" "}
            <Link href="/" className="text-teal-cathedral hover:underline">
              protection form
            </Link>
            , your contact details may be shared with licensed insurance
            professionals. Under the California Consumer Privacy Act (CCPA/CPRA)
            and similar state laws, this may constitute a &ldquo;sale&rdquo; or
            &ldquo;sharing&rdquo; of personal information.
          </p>
          <p>
            <strong className="text-[var(--text-primary)]">You have the right to opt out.</strong>{" "}
            To exercise this right:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong className="text-[var(--text-primary)]">Email us:</strong>{" "}
              Send a request to{" "}
              <a
                href="mailto:privacy@digital-cathedral.app"
                className="text-teal-cathedral hover:underline"
              >
                privacy@digital-cathedral.app
              </a>{" "}
              with the subject line &ldquo;Do Not Sell or Share.&rdquo;
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Right to Delete:</strong>{" "}
              You may request deletion of all personal data we hold about you.
              We will process deletion requests within 15 business days.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Right to Know:</strong>{" "}
              You may request a copy of the personal information we have
              collected about you in the preceding 12 months.
            </li>
          </ul>
          <p>
            We will not discriminate against you for exercising any of these
            rights.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Third-Party Services
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong className="text-[var(--text-primary)]">Vercel:</strong>{" "}
              Hosting platform. See{" "}
              <a
                href="https://vercel.com/legal/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-cathedral hover:underline"
              >
                Vercel&apos;s privacy policy
              </a>
              .
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Contact
          </h2>
          <p>
            For privacy-related questions, email{" "}
            <a
              href="mailto:privacy@digital-cathedral.app"
              className="text-teal-cathedral hover:underline"
            >
              privacy@digital-cathedral.app
            </a>{" "}
            or visit our{" "}
            <Link href="/about" className="text-teal-cathedral hover:underline">
              About &amp; Contact
            </Link>{" "}
            page.
          </p>
        </section>

        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            &copy; {new Date().getFullYear()} Valor Legacies. All rights reserved.
          </p>
        </footer>
      </article>
    </main>
  );
}
