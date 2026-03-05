"use client";

import { useState, FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn, useSession } from "next-auth/react";

export default function AdminLoginPage() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();
  const { data: session } = useSession();

  // If already signed in via Google as admin, redirect to admin dashboard
  if (session?.user && (session.user as Record<string, unknown>).isAdmin) {
    router.replace("/admin");
    return null;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      });

      const data = await res.json();

      if (res.ok && data.success) {
        router.push("/admin");
      } else {
        setError(data.message || "Authentication failed.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6">
        <div className="text-center">
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase mb-3">
            Admin Gate
          </div>
          <h1 className="text-2xl font-light text-[var(--text-primary)]">
            Admin Login
          </h1>
        </div>

        {/* Google OAuth sign-in */}
        <div className="cathedral-surface p-6 space-y-4">
          <button
            onClick={() => signIn("google", { callbackUrl: "/admin" })}
            className="w-full flex items-center justify-center gap-3 bg-white text-gray-700 border border-gray-300 rounded-lg px-4 py-3 text-sm font-medium hover:bg-gray-50 hover:shadow-md transition-all"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
              <path
                d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
                fill="#4285F4"
              />
              <path
                d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                fill="#34A853"
              />
              <path
                d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18A11.96 11.96 0 001 12c0 1.94.46 3.77 1.18 5.42l3.66-2.84z"
                fill="#FBBC05"
              />
              <path
                d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                fill="#EA4335"
              />
            </svg>
            Sign in with Google
          </button>

          {/* Show message if signed in but not admin */}
          {session?.user && !(session.user as Record<string, unknown>).isAdmin && (
            <p className="text-crimson-cathedral text-sm text-center">
              Your Google account is not authorized for admin access.
            </p>
          )}
        </div>

        {/* Divider */}
        <div className="flex items-center gap-3">
          <div className="flex-1 h-px bg-[var(--text-muted)] opacity-20" />
          <span className="text-xs text-[var(--text-muted)]">or use API key</span>
          <div className="flex-1 h-px bg-[var(--text-muted)] opacity-20" />
        </div>

        {/* API key form */}
        <form onSubmit={handleSubmit} className="cathedral-surface p-6 space-y-4">
          <div>
            <label
              htmlFor="apiKey"
              className="block text-sm text-[var(--text-muted)] mb-1"
            >
              API Key
            </label>
            <input
              id="apiKey"
              type="password"
              autoComplete="current-password"
              value={key}
              onChange={(e) => setKey(e.target.value)}
              required
              className="w-full px-3 py-2 rounded-lg text-sm bg-[var(--bg-deep)] text-[var(--text-primary)] border border-indigo-cathedral/10 focus:border-teal-cathedral/50 focus:outline-none transition-colors"
              placeholder="Enter admin API key"
            />
          </div>

          {error && (
            <p className="text-crimson-cathedral text-sm text-center">{error}</p>
          )}

          <button
            type="submit"
            disabled={loading || !key.trim()}
            className="w-full py-2.5 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {loading ? "Authenticating..." : "Enter"}
          </button>
        </form>

        <p className="text-center text-xs text-[var(--text-muted)]">
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">
            &larr; Back home
          </a>
        </p>
      </div>
    </main>
  );
}
