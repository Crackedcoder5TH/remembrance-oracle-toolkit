"use client";

/**
 * Error Boundary — The Kingdom's Safety Net
 *
 * Oracle decision: EVOLVE from result-type-ts (0.645)
 * Evolved: Result<T,E> error pattern → full React error boundary UI
 *
 * Shows a calming, branded fallback instead of raw stack traces.
 * Provides a reset button so users can retry without reloading.
 */

export default function ErrorPage({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-md cathedral-surface p-8 text-center space-y-6">
        <div className="text-4xl">&#9878;</div>

        <div>
          <h1 className="text-2xl font-light text-[var(--text-primary)] mb-2">
            Something Went Wrong
          </h1>
          <p className="text-sm text-[var(--text-muted)] leading-relaxed">
            We encountered an unexpected issue. Your information is safe &mdash;
            please try again or return to the home page.
          </p>
        </div>

        {error.digest && (
          <p className="text-xs text-[var(--text-muted)] font-mono">
            Reference: {error.digest}
          </p>
        )}

        <div className="flex gap-3 justify-center">
          <button
            onClick={reset}
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all bg-emerald-accent text-white hover:bg-emerald-accent/90"
          >
            Try Again
          </button>
          <a
            href="/"
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-all text-[var(--text-muted)] border border-navy-cathedral/10 hover:border-navy-cathedral/25"
          >
            Go Home
          </a>
        </div>
      </div>

      <footer className="mt-16 text-center text-xs text-[var(--text-muted)]">
        <p>The kingdom endures. Try again.</p>
      </footer>
    </main>
  );
}
