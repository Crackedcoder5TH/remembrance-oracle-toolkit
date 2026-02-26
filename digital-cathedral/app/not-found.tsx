/**
 * Not Found (404) — The Kingdom's Lost Path
 *
 * Oracle decision: GENERATE (0.368) — no existing pattern, write new
 *
 * Branded 404 page that gently redirects visitors back to useful pages
 * instead of showing a raw framework error.
 */

import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found — Digital Cathedral",
  description: "The page you're looking for doesn't exist. Let us help you find what you need.",
};

export default function NotFoundPage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md text-center space-y-6">
        <div className="text-6xl font-light text-emerald-accent/30">
          404
        </div>

        <div>
          <h1 className="text-2xl font-light text-[var(--text-primary)] mb-2">
            Page Not Found
          </h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            The path you followed doesn&rsquo;t lead anywhere. Let us guide you
            back to where the kingdom can help.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 justify-center">
          <a
            href="/"
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all bg-emerald-accent text-white hover:bg-emerald-accent/90"
          >
            Get a Quote
          </a>
          <a
            href="/"
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all text-[var(--text-muted)] border border-navy-cathedral/10 hover:border-navy-cathedral/25"
          >
            Go Home
          </a>
        </div>

        <nav className="pt-4 border-t border-navy-cathedral/8">
          <p className="text-xs text-[var(--text-muted)] mb-2">Or try one of these:</p>
          <div className="flex gap-4 justify-center text-xs">
            <a href="/privacy" className="text-emerald-accent/70 hover:text-emerald-accent">Privacy Policy</a>
            <a href="/terms" className="text-emerald-accent/70 hover:text-emerald-accent">Terms of Service</a>
          </div>
        </nav>
      </div>

      <footer className="mt-16 text-center text-xs text-[var(--text-muted)]">
        <p>The kingdom is still here. Find your way back.</p>
      </footer>
    </main>
  );
}
