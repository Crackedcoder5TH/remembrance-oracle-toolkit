"use client";

import { useState, FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" className="shrink-0">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

function LoginContent() {
  const [key, setKey] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [showApiKey, setShowApiKey] = useState(false);
  const router = useRouter();
  const searchParams = useSearchParams();

  // Show error from NextAuth callback (e.g., access denied)
  const callbackError = searchParams.get("error");

  function handleGoogleSignIn() {
    setError("");
    setGoogleLoading(true);
    // Redirect to NextAuth Google sign-in
    window.location.href = "/api/auth/signin/google?callbackUrl=/api/admin/google-callback";
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

        <div className="cathedral-surface p-6 space-y-5">
          {/* Google Sign-In — Primary Method */}
          <button
            type="button"
            onClick={handleGoogleSignIn}
            disabled={googleLoading}
            className="w-full flex items-center justify-center gap-3 py-3 rounded-lg text-sm font-medium transition-all bg-white text-gray-700 border border-gray-300 hover:bg-gray-50 hover:shadow-md disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {googleLoading ? (
              <span className="text-gray-500">Redirecting to Google...</span>
            ) : (
              <>
                <GoogleIcon />
                <span>Sign in with Google</span>
              </>
            )}
          </button>

          {(error || callbackError) && (
            <p className="text-crimson-cathedral text-sm text-center">
              {error || (callbackError === "AccessDenied"
                ? "You don't have admin access. Contact an administrator."
                : "Sign-in failed. Please try again.")}
            </p>
          )}

          {/* Divider */}
          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-indigo-cathedral/10" />
            </div>
            <div className="relative flex justify-center text-xs">
              <button
                type="button"
                onClick={() => setShowApiKey(!showApiKey)}
                className="px-2 bg-[var(--bg-elevated,#1a1a2e)] text-[var(--text-muted)] hover:text-teal-cathedral transition-colors"
              >
                {showApiKey ? "Hide API key login" : "Or use API key"}
              </button>
            </div>
          </div>

          {/* API Key Fallback — Collapsible */}
          {showApiKey && (
            <form onSubmit={handleSubmit} className="space-y-4">
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

              <button
                type="submit"
                disabled={loading || !key.trim()}
                className="w-full py-2.5 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {loading ? "Authenticating..." : "Enter with API Key"}
              </button>
            </form>
          )}
        </div>

        <p className="text-center text-xs text-[var(--text-muted)]">
          <a href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">
            &larr; Back home
          </a>
        </p>
      </div>
    </main>
  );
}

export default function AdminLoginPage() {
  return (
    <Suspense fallback={
      <main className="min-h-screen flex items-center justify-center px-4">
        <div className="text-[var(--text-muted)]">Loading...</div>
      </main>
    }>
      <LoginContent />
    </Suspense>
  );
}
