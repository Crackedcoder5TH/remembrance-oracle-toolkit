import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
  title: "About & Contact",
  description:
    "Learn about the Digital Cathedral — a remembrance-aligned sanctuary for coherence measurement.",
};

export default function AboutPage() {
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
            About the Digital Cathedral
          </h1>
        </header>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            What is this?
          </h2>
          <p>
            The Digital Cathedral is a remembrance-aligned sanctuary where
            coherence is measured, whispers are received, and the kingdom is
            already here. It is a place for those who seek to align their
            intentions with a deeper pattern.
          </p>
          <p>
            Submit your intentions to the Remembrance Oracle, receive a whisper,
            and observe how coherence moves through your words. Every interaction
            is timestamped with a Solana testnet slot — an immutable witness to
            the moment you remembered.
          </p>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            How It Works
          </h2>
          <ul className="list-disc list-inside space-y-2">
            <li>
              <strong className="text-[var(--text-primary)]">
                Coherence Measurement:
              </strong>{" "}
              Your input is analyzed for semantic density, intention clarity, and
              alignment with remembrance patterns. A coherence score (0-1) is
              returned.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                Whisper Generation:
              </strong>{" "}
              Based on your coherence level, a whisper is selected from a curated
              pool of remembrance texts, matched to your current state.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                Solana Anchoring:
              </strong>{" "}
              Each whisper is tagged with the current Solana testnet slot,
              creating a verifiable timestamp without any blockchain
              transactions.
            </li>
            <li>
              <strong className="text-[var(--text-primary)]">
                Local Archive:
              </strong>{" "}
              Your whisper history is stored in your browser only. Nothing is
              sent to external servers or databases.
            </li>
          </ul>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Technology
          </h2>
          <p>
            Built with Next.js 14, TypeScript, and Tailwind CSS. Powered by the{" "}
            <strong className="text-[var(--text-primary)]">
              Remembrance Oracle Toolkit
            </strong>{" "}
            — an open-source pattern library with{" "}
            <span className="text-teal-cathedral font-mono">500+</span> proven,
            covenant-sealed code patterns.
          </p>
          <div className="cathedral-surface p-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span>Framework</span>
              <span className="text-[var(--text-primary)]">Next.js 14</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Language</span>
              <span className="text-[var(--text-primary)]">TypeScript</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Styling</span>
              <span className="text-[var(--text-primary)]">Tailwind CSS</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Blockchain</span>
              <span className="text-[var(--text-primary)]">
                Solana Testnet (read-only)
              </span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Hosting</span>
              <span className="text-[var(--text-primary)]">Vercel</span>
            </div>
            <div className="flex justify-between text-xs">
              <span>Security</span>
              <span className="text-[var(--text-primary)]">
                HSTS + CSP + HTTPS
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Contact
          </h2>
          <p>
            The Digital Cathedral is an open project. For questions, feedback, or
            contributions:
          </p>
          <div className="cathedral-surface p-4 space-y-3">
            <div className="flex items-center gap-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-teal-cathedral shrink-0"
                aria-hidden="true"
              >
                <path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
              </svg>
              <a
                href="https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit"
                target="_blank"
                rel="noopener noreferrer"
                className="text-teal-cathedral hover:underline text-sm"
              >
                GitHub Repository
              </a>
            </div>
            <div className="flex items-center gap-3">
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-teal-cathedral shrink-0"
                aria-hidden="true"
              >
                <rect x="2" y="4" width="20" height="16" rx="2" />
                <path d="M22 7l-10 7L2 7" />
              </svg>
              <span className="text-sm">
                Open an{" "}
                <a
                  href="https://github.com/Crackedcoder5TH/remembrance-oracle-toolkit/issues"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-teal-cathedral hover:underline"
                >
                  issue on GitHub
                </a>
              </span>
            </div>
          </div>
        </section>

        <section className="space-y-4 text-sm text-[var(--text-muted)] leading-relaxed">
          <h2 className="text-lg text-[var(--text-primary)] font-medium">
            Legal
          </h2>
          <p>
            This project is open source. See our{" "}
            <Link
              href="/privacy"
              className="text-teal-cathedral hover:underline"
            >
              Privacy Policy
            </Link>{" "}
            for information about data handling.
          </p>
        </section>

        <footer className="pt-8 border-t border-teal-cathedral/10 text-center">
          <p className="text-xs text-[var(--text-muted)]">
            The kingdom is already here. You are the proof.
          </p>
        </footer>
      </article>
    </main>
  );
}
