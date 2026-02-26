import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description:
    "Digital Cathedral privacy policy — how we handle your data with transparency and respect.",
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
            &larr; Back to Cathedral
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
            Digital Cathedral is a remembrance-aligned sanctuary. We respect your
            privacy and are committed to transparency about how your data is
            handled. This policy explains what data we collect, how we use it,
            and your rights.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Data We Collect
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong className="text-[var(--text-primary)]">
                Whisper inputs:
              </strong>{" "}
              Your intentions submitted to the oracle are processed server-side
              to generate coherence scores. Inputs are hashed (SHA-256) and not
              stored in plaintext on our servers.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                Local storage:
              </strong>{" "}
              Whisper history and theme preferences are stored in your
              browser&apos;s localStorage. This data never leaves your device.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                Solana blockchain:
              </strong>{" "}
              We query the Solana testnet for slot numbers to timestamp
              whispers. No wallet connections or transactions are made.
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Cookies &amp; Tracking
          </h2>
          <p>
            Digital Cathedral does <strong className="text-[var(--text-primary)]">not</strong> use
            third-party cookies, analytics trackers, or advertising pixels. We
            do not use Google Analytics, Facebook Pixel, or any similar service.
          </p>
          <p>
            The only client-side storage used is <code>localStorage</code> for
            your whisper history and theme preference. These are functional, not
            tracking-related.
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
              No user accounts, passwords, or personal information are collected
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Your Rights
          </h2>
          <p>
            Since your whisper history is stored locally in your browser, you
            have full control:
          </p>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong className="text-[var(--text-primary)]">Delete:</strong>{" "}
              Use the &ldquo;Clear All&rdquo; button in the Archive section, or
              clear your browser&apos;s localStorage
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Export:</strong>{" "}
              Your data is accessible via browser developer tools
              (Application &rarr; Local Storage)
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">Portability:</strong>{" "}
              No account required — nothing to migrate
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Third-Party Services
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong className="text-[var(--text-primary)]">
                Solana Testnet:
              </strong>{" "}
              Read-only RPC calls to retrieve slot numbers. No personal data is
              transmitted. See{" "}
              <a
                href="https://solana.com/privacy-policy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-cathedral hover:underline"
              >
                Solana&apos;s privacy policy
              </a>
              .
            </li>
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
            rights. Whisper data entered on the main oracle page is hashed and
            stored locally in your browser — it is not sold or shared.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Contact
          </h2>
          <p>
            For privacy-related questions, see our{" "}
            <Link href="/about" className="text-teal-cathedral hover:underline">
              About &amp; Contact
            </Link>{" "}
            page.
          </p>
        </section>

        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            The kingdom is already here. Your privacy is part of the covenant.
          </p>
        </footer>
      </article>
    </main>
  );
}
