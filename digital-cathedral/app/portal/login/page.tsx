"use client";

/**
 * Client Portal Login / Sign-Up Page
 */

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function ClientLoginPage() {
  const router = useRouter();
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [contactName, setContactName] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  // Auto-redirect if already authenticated
  useEffect(() => {
    fetch("/api/client/profile").then((res) => {
      if (res.ok) router.push("/portal");
    }).catch(() => {});
  }, [router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const endpoint = mode === "login" ? "/api/client/login" : "/api/client/register";
      const payload =
        mode === "login"
          ? { email, password }
          : { email, password, contactName, companyName, phone };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const data = await res.json();

      if (data.success) {
        router.push("/portal");
      } else {
        setError(data.message || "Something went wrong.");
      }
    } catch {
      setError("Network error. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <div className="max-w-sm w-full space-y-6">
        <div className="text-center">
          <div className="text-teal-cathedral text-xs tracking-[0.3em] uppercase pulse-gentle mb-2">
            Client Portal
          </div>
          <h1 className="text-2xl font-light text-[var(--text-primary)]">
            {mode === "login" ? "Sign In" : "Create Your Account"}
          </h1>
          <p className="text-sm text-[var(--text-muted)] mt-2">
            {mode === "login"
              ? "Access your lead purchase dashboard"
              : "Sign up to browse and purchase leads"}
          </p>
        </div>

        {/* Toggle buttons */}
        <div className="flex rounded-lg overflow-hidden border border-[var(--teal,theme(colors.teal.500))]">
          <button
            type="button"
            onClick={() => { setMode("login"); setError(""); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-all ${
              mode === "login"
                ? "bg-teal-cathedral text-white"
                : "text-teal-cathedral hover:bg-[var(--bg-surface)]"
            }`}
          >
            Sign In
          </button>
          <button
            type="button"
            onClick={() => { setMode("signup"); setError(""); }}
            className={`flex-1 py-2.5 text-sm font-medium transition-all ${
              mode === "signup"
                ? "bg-teal-cathedral text-white"
                : "text-teal-cathedral hover:bg-[var(--bg-surface)]"
            }`}
          >
            Sign Up
          </button>
        </div>

        <form onSubmit={handleSubmit} className="cathedral-surface p-6 rounded-xl space-y-4">
          {mode === "signup" && (
            <>
              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">
                  Your Name <span className="text-red-400">*</span>
                </label>
                <input
                  type="text"
                  autoComplete="name"
                  value={contactName}
                  onChange={(e) => setContactName(e.target.value)}
                  required
                  className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
                  placeholder="John Doe"
                />
              </div>

              <div>
                <label className="block text-xs text-[var(--text-muted)] mb-1">
                  Company Name <span className="text-xs opacity-60">(optional)</span>
                </label>
                <input
                  type="text"
                  autoComplete="organization"
                  value={companyName}
                  onChange={(e) => setCompanyName(e.target.value)}
                  className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
                  placeholder="Acme Insurance"
                />
              </div>
            </>
          )}

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Email</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label className="block text-xs text-[var(--text-muted)] mb-1">Password</label>
            <input
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
              placeholder={mode === "signup" ? "Min 8 characters" : ""}
            />
          </div>

          {mode === "signup" && (
            <div>
              <label className="block text-xs text-[var(--text-muted)] mb-1">
                Phone <span className="text-xs opacity-60">(optional)</span>
              </label>
              <input
                type="tel"
                autoComplete="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                className="w-full bg-[var(--bg-surface)] text-[var(--text-primary)] placeholder-[var(--text-muted)] border border-indigo-cathedral/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-indigo-cathedral/25"
                placeholder="(555) 123-4567"
              />
            </div>
          )}

          {error && (
            <div className="px-4 py-3 rounded-lg text-sm bg-red-50 text-red-700 border border-red-200">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading || !email.trim() || !password.trim()}
            className="w-full px-4 py-3 rounded-lg text-sm font-medium transition-all bg-teal-cathedral text-white hover:bg-teal-cathedral/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {loading
              ? mode === "login" ? "Signing in..." : "Creating account..."
              : mode === "login" ? "Sign In" : "Create Account"}
          </button>
        </form>

        <p className="text-center text-sm text-[var(--text-muted)]">
          {mode === "login" ? (
            <>
              Don&apos;t have an account?{" "}
              <button
                type="button"
                onClick={() => { setMode("signup"); setError(""); }}
                className="text-teal-cathedral hover:text-teal-cathedral/80 font-medium transition-colors"
              >
                Sign up
              </button>
            </>
          ) : (
            <>
              Already have an account?{" "}
              <button
                type="button"
                onClick={() => { setMode("login"); setError(""); }}
                className="text-teal-cathedral hover:text-teal-cathedral/80 font-medium transition-colors"
              >
                Sign in
              </button>
            </>
          )}
        </p>

        <p className="text-center text-xs text-[var(--text-muted)]">
          <Link href="/" className="text-teal-cathedral/70 hover:text-teal-cathedral">
            &larr; Back home
          </Link>
        </p>
      </div>
    </main>
  );
}
